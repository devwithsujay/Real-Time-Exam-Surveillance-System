import os
import cv2
import json
import time
import logging
import threading
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from app.database import get_db_session
from app.models import VideoAudit, VideoAuditIncident, VideoAuditStatus, EventType, EventSeverity
from app.services.detection_engine import DetectionEngine
from app.services.mediapipe_analyzer import MediaPipeAnalyzer

logger = logging.getLogger(__name__)

# Global singleton detectors to avoid re-initializing heavy YOLO/MediaPipe weights repeatedly
_detector_instance: Optional[DetectionEngine] = None
_mediapipe_instance: Optional[MediaPipeAnalyzer] = None
_detector_lock = threading.Lock()


def get_detectors():
    global _detector_instance, _mediapipe_instance
    with _detector_lock:
        if _detector_instance is None:
            logger.info("Initializing DetectionEngine for VideoAuditService...")
            _detector_instance = DetectionEngine()
        if _mediapipe_instance is None:
            logger.info("Initializing MediaPipeAnalyzer for VideoAuditService...")
            _mediapipe_instance = MediaPipeAnalyzer()
    return _detector_instance, _mediapipe_instance


def utcnow():
    return datetime.now(timezone.utc)


class VideoAuditService:
    @staticmethod
    def extract_metadata(video_path: str) -> Dict[str, Any]:
        """Extract duration, FPS, and frame count from a video file."""
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Video file not found at: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"OpenCV could not open video file: {video_path}")

        try:
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
            if fps <= 0 or fps > 240:
                fps = 25.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            duration_seconds = float(total_frames / fps) if fps > 0 else 0.0
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

            return {
                "fps": fps,
                "total_frames": total_frames,
                "duration_seconds": duration_seconds,
                "width": width,
                "height": height
            }
        finally:
            cap.release()

    @staticmethod
    def run_audit_background(audit_id: str):
        """Spawns asynchronous thread to process video audit."""
        worker_thread = threading.Thread(
            target=VideoAuditService._process_audit_thread,
            args=(audit_id,),
            name=f"audit-worker-{audit_id[:8]}",
            daemon=True
        )
        worker_thread.start()

    @staticmethod
    def _process_audit_thread(audit_id: str):
        db = get_db_session()
        try:
            audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
            if not audit:
                logger.error(f"Audit {audit_id} not found in database")
                return

            audit.status = VideoAuditStatus.PROCESSING
            audit.started_at = utcnow()
            audit.progress_percent = 0.0
            db.commit()

            video_path = audit.video_path
            if not os.path.exists(video_path):
                raise FileNotFoundError(f"Source video file not found: {video_path}")

            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                raise ValueError(f"OpenCV failed to open video: {video_path}")

            fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
            if fps <= 0 or fps > 240:
                fps = 25.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            if total_frames <= 0:
                # If frame count is unknown, estimate from duration
                total_frames = max(1, int(audit.duration_seconds * fps))

            sample_fps = max(1, min(10, audit.sample_fps or 2))
            step = max(1, round(fps / sample_fps))

            detector, mediapipe = get_detectors()

            # Ensure snapshot directory exists
            audit_dir = os.path.dirname(video_path)
            snapshot_dir = os.path.join(audit_dir, "snapshots")
            os.makedirs(snapshot_dir, exist_ok=True)

            processed_count = 0
            frame_idx = 0
            incidents_count = 0
            risk_points = 0.0

            # Debounce tracker: (event_type, track_id) -> last_timestamp_seconds
            cooldowns: Dict[str, float] = {}
            COOLDOWN_PERIOD_SEC = 3.0

            logger.info(f"Starting audit {audit_id}: total_frames={total_frames}, fps={fps:.2f}, step={step}")

            last_db_sync = time.time()

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % step == 0:
                    time_sec = round(frame_idx / fps, 2)
                    processed_count += 1

                    # 1. Run YOLOv8 detection
                    detection_result = detector.track(frame, frame_number=frame_idx)
                    detections = detection_result.detections

                    # Check for anomalies on sampled frame
                    detected_persons = [d for d in detections if d.class_name == "person"]
                    detected_phones = [d for d in detections if d.class_name in ("cell phone", "phone")]

                    # Rule 1: Phone Detection
                    if detected_phones:
                        for phone in detected_phones:
                            cd_key = f"PHONE_{phone.track_id or 0}"
                            if (time_sec - cooldowns.get(cd_key, -999)) >= COOLDOWN_PERIOD_SEC:
                                cooldowns[cd_key] = time_sec
                                incidents_count += 1
                                risk_points += 20.0
                                snap_rel = VideoAuditService._save_annotated_snapshot(
                                    frame, phone.bbox, "UNAUTHORIZED PHONE DETECTED",
                                    snapshot_dir, audit_id, frame_idx, "PHONE"
                                )
                                incident = VideoAuditIncident(
                                    audit_id=audit_id,
                                    timestamp_seconds=time_sec,
                                    frame_index=frame_idx,
                                    event_type=EventType.PHONE_DETECTED,
                                    severity=EventSeverity.HIGH,
                                    confidence=round(phone.confidence, 2),
                                    description=f"Unauthorized mobile device detected in examination zone at {int(time_sec//60):02d}:{int(time_sec%60):02d}",
                                    track_id=phone.track_id or 0,
                                    bbox=json.dumps(phone.bbox),
                                    snapshot_path=snap_rel
                                )
                                db.add(incident)

                    # Rule 2: Multiple Persons (Collaboration/Communication)
                    if len(detected_persons) > 1:
                        cd_key = "COMMUNICATION_MULTI"
                        if (time_sec - cooldowns.get(cd_key, -999)) >= COOLDOWN_PERIOD_SEC:
                            cooldowns[cd_key] = time_sec
                            incidents_count += 1
                            risk_points += 12.0
                            snap_rel = VideoAuditService._save_annotated_snapshot(
                                frame, detected_persons[1].bbox, "MULTIPLE PERSONS DETECTED",
                                snapshot_dir, audit_id, frame_idx, "MULTI"
                            )
                            incident = VideoAuditIncident(
                                audit_id=audit_id,
                                timestamp_seconds=time_sec,
                                frame_index=frame_idx,
                                event_type=EventType.COMMUNICATION,
                                severity=EventSeverity.MEDIUM,
                                confidence=0.88,
                                description=f"Multiple individuals ({len(detected_persons)} detected) in camera field of view at {int(time_sec//60):02d}:{int(time_sec%60):02d}",
                                track_id=detected_persons[0].track_id or 0,
                                bbox=json.dumps(detected_persons[0].bbox),
                                snapshot_path=snap_rel
                            )
                            db.add(incident)

                    # Rule 3: Gaze Departure / Looking Away (MediaPipe)
                    for person in detected_persons:
                        try:
                            face = mediapipe.analyze(frame, person_bbox=person.bbox)
                            if face and face.face_detected:
                                person_trk = person.track_id or 0
                                if face.gaze_direction in ("LEFT", "RIGHT") and face.gaze_confidence > 0.65:
                                    cd_key = f"GAZE_{person_trk}_{face.gaze_direction}"
                                    if (time_sec - cooldowns.get(cd_key, -999)) >= 5.0:
                                        cooldowns[cd_key] = time_sec
                                        incidents_count += 1
                                        risk_points += 6.0
                                        snap_rel = VideoAuditService._save_annotated_snapshot(
                                            frame, face.bbox or person.bbox, f"LOOKING {face.gaze_direction}",
                                            snapshot_dir, audit_id, frame_idx, "GAZE"
                                        )
                                        incident = VideoAuditIncident(
                                            audit_id=audit_id,
                                            timestamp_seconds=time_sec,
                                            frame_index=frame_idx,
                                            event_type=EventType.LOOKING_AWAY,
                                            severity=EventSeverity.LOW,
                                            confidence=round(face.gaze_confidence, 2),
                                            description=f"Candidate visual gaze departed center screen towards {face.gaze_direction} at {int(time_sec//60):02d}:{int(time_sec%60):02d}",
                                            track_id=person_trk,
                                            bbox=json.dumps(face.bbox or person.bbox or []),
                                            snapshot_path=snap_rel
                                        )
                                        db.add(incident)
                        except Exception as mp_err:
                            logger.debug(f"MediaPipe analyze exception for person: {mp_err}")

                    # Update progress periodically (every 1 second or 50 sampled frames)
                    now = time.time()
                    if now - last_db_sync > 1.5:
                        progress = min(99.0, round((frame_idx / max(1, total_frames)) * 100.0, 1))
                        audit.processed_frames = frame_idx
                        audit.progress_percent = progress
                        audit.total_violations = incidents_count
                        audit.risk_score = min(100.0, round(risk_points, 1))
                        db.commit()
                        last_db_sync = now

                frame_idx += 1

            cap.release()

            # Mark audit completed
            audit.status = VideoAuditStatus.COMPLETED
            audit.completed_at = utcnow()
            audit.progress_percent = 100.0
            audit.processed_frames = total_frames
            audit.total_violations = incidents_count
            audit.risk_score = min(100.0, round(risk_points, 1))
            db.commit()
            logger.info(f"Video audit {audit_id} finished successfully with {incidents_count} violations (Risk score: {audit.risk_score})")

        except Exception as e:
            logger.exception(f"Video audit {audit_id} failed: {e}")
            try:
                audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
                if audit:
                    audit.status = VideoAuditStatus.FAILED
                    audit.error_message = str(e)
                    audit.completed_at = utcnow()
                    db.commit()
            except Exception as dbe:
                logger.error(f"Failed to record failure state: {dbe}")
        finally:
            db.close()

    @staticmethod
    def _save_annotated_snapshot(
        frame, bbox, label: str,
        snapshot_dir: str, audit_id: str, frame_idx: int, prefix: str
    ) -> str:
        """Draw tactical overlay and save snapshot crop/fullframe."""
        try:
            annotated = frame.copy()
            h, w = annotated.shape[:2]

            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = [int(v) for v in bbox]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                # Tactical crimson box
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (40, 40, 220), 2)
                # Label badge
                cv2.rectangle(annotated, (x1, max(0, y1 - 24)), (min(w, x1 + 220), y1), (40, 40, 220), -1)
                cv2.putText(annotated, label, (x1 + 4, max(14, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

            # Watermark ARGUS Forensic Desk in corner
            cv2.putText(annotated, f"ARGUS FORENSIC AUDIT // FRAME {frame_idx}", (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1)

            snap_filename = f"snap_{frame_idx:06d}_{prefix}.jpg"
            snap_abs_path = os.path.join(snapshot_dir, snap_filename)
            cv2.imwrite(snap_abs_path, annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            # Return relative path format: snapshots/snap_...
            return f"snapshots/{snap_filename}"
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
            return ""
