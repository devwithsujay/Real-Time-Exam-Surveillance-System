import os
import cv2
import numpy as np
import json
import time
import logging
import threading
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.database import get_db_session
from app.models import VideoAudit, VideoAuditIncident, VideoAuditStatus, EventType, EventSeverity
from app.services.detection_engine import DetectionEngine
from app.services.mediapipe_analyzer import MediaPipeAnalyzer
from app.services.vlm_client import get_vlm_client, build_multiframe_proctor_prompt

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

            # Sampling rate (guarantees 1 frame every 1 second for 30s = 30 frames):
            # If sample_fps is set to 1 (or default): exactly 1 frame every 1 second (step = fps = 30).
            # If a user entered 30 (thinking "30s video at 30 fps = 30 frames"), we clamp to 1 fps
            # so it advances 1 second per image rather than checking the 1st second 30 times.
            sample_rate = audit.sample_fps if (audit.sample_fps and audit.sample_fps > 0) else 1
            if sample_rate >= round(fps):
                # Clamp to 1 frame per second to prevent evaluating 30 raw frames in the first second
                sample_rate = 1
            step = max(1, round(fps / sample_rate))

            detector, mediapipe = get_detectors()

            # Ensure snapshot directory exists
            audit_dir = os.path.dirname(video_path)
            snapshot_dir = os.path.join(audit_dir, "snapshots")
            os.makedirs(snapshot_dir, exist_ok=True)

            # Clean existing incidents if this audit is being re-run
            db.query(VideoAuditIncident).filter(VideoAuditIncident.audit_id == audit_id).delete()
            db.commit()

            processed_count = 0
            frame_idx = 0
            incidents_count = 0
            risk_points = 0.0

            # Cooldown tracker to prevent duplicate DB rows for continuous actions
            last_incident_time: Dict[EventType, float] = {}
            COOLDOWN_SEC = 3.0

            # Spatial workstation anchor tracking: lock initial desk positions of students during early frames
            baseline_anchors: Dict[str, Dict[str, Any]] = {}
            seat_displacement_history: Dict[str, List[float]] = {}

            # Temporary file path for passing individual inspection frames to VLM
            temp_scan_path = os.path.join(snapshot_dir, f"_scan_frame_{audit_id}.jpg")

            logger.info(f"Starting frame-by-frame VLM audit {audit_id}: total_frames={total_frames}, fps={fps:.2f}, step={step} (1 frame every {step/fps:.1f}s)")
            last_db_sync = time.time()

            vlm = get_vlm_client()
            vlm_enabled = bool(vlm and getattr(vlm, "enabled", False))

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % step == 0:
                    time_sec = round(frame_idx / fps, 2)
                    processed_count += 1
                    logger.info(f"Audit {audit_id} -> VLM Evaluating Timestamp: {time_sec:.1f}s (Frame #{frame_idx} of {total_frames}) [step={step}]")

                    # 1. Run YOLOv8 detection & tracking on current frame
                    detection_result = detector.track(frame, frame_number=frame_idx)
                    detections = detection_result.detections

                    detected_persons = [d for d in detections if d.class_name == "person"]
                    detected_phones = [d for d in detections if d.class_name in ("cell phone", "phone")]
                    detected_items = [d for d in detections if d.class_name in ("book", "laptop", "remote")]

                    # Sort all visible students spatially from left to right across the room/desks
                    sorted_persons = sorted(detected_persons, key=lambda p: (p.bbox[0] + p.bbox[2]) / 2.0)
                    students_list: List[Dict[str, Any]] = []
                    for i, p in enumerate(sorted_persons):
                        seat_tag = f"S{i+1}"
                        students_list.append({
                            "seat": seat_tag,
                            "label": f"{seat_tag} (Candidate)" if i == 0 and len(sorted_persons) == 1 else seat_tag,
                            "bbox": p.bbox,
                            "track_id": getattr(p, "track_id", i + 1),
                            "center_x": (p.bbox[0] + p.bbox[2]) / 2.0,
                            "center_y": (p.bbox[1] + p.bbox[3]) / 2.0
                        })

                    # Dynamically generate seat labels string for the VLM prompt
                    if not students_list:
                        seat_labels = "S1 (Candidate desk)"
                    elif len(students_list) == 1:
                        seat_labels = "S1 (Candidate desk)"
                    elif len(students_list) == 2:
                        seat_labels = "S1 (left student), S2 (right student)"
                    else:
                        seat_labels = ", ".join([f"S{i+1} (Desk {i+1}, left-to-right)" for i in range(len(students_list))])

                    # Lock baseline workstation anchors during the initial seated frames
                    if len(baseline_anchors) < len(students_list) and processed_count <= 6 and len(students_list) >= 1:
                        for s in students_list:
                            s_seat = s["seat"]
                            if s_seat not in baseline_anchors:
                                baseline_anchors[s_seat] = {
                                    "seat": s_seat,
                                    "anchor_x": s["center_x"],
                                    "anchor_y": s["center_y"],
                                    "track_id": s["track_id"],
                                    "bbox": s["bbox"]
                                }

                    # CV Model: Identify anomalies to label & give red marker
                    anomaly_box = None
                    anomaly_label = None
                    cv_flagged_type = None
                    target_student: Optional[Dict[str, Any]] = None

                    if detected_phones:
                        best_phone = max(detected_phones, key=lambda x: x.confidence)
                        px = (best_phone.bbox[0] + best_phone.bbox[2]) / 2.0
                        py = (best_phone.bbox[1] + best_phone.bbox[3]) / 2.0
                        closest_student = min(students_list, key=lambda s: (s["center_x"] - px)**2 + (s["center_y"] - py)**2) if students_list else None
                        seat_tag = f" [{closest_student['seat']}]" if closest_student else ""
                        anomaly_box = best_phone.bbox
                        anomaly_label = f"CV DETECTED: PHONE{seat_tag} ({int(best_phone.confidence * 100)}%)"
                        cv_flagged_type = EventType.PHONE_DETECTED
                        target_student = closest_student
                    elif detected_items:
                        best_item = max(detected_items, key=lambda x: x.confidence)
                        ix = (best_item.bbox[0] + best_item.bbox[2]) / 2.0
                        iy = (best_item.bbox[1] + best_item.bbox[3]) / 2.0
                        closest_student = min(students_list, key=lambda s: (s["center_x"] - ix)**2 + (s["center_y"] - iy)**2) if students_list else None
                        seat_tag = f" [{closest_student['seat']}]" if closest_student else ""
                        anomaly_box = best_item.bbox
                        anomaly_label = f"CV DETECTED: {best_item.class_name.upper()}{seat_tag}"
                        cv_flagged_type = EventType.CHEAT_SHEET
                        target_student = closest_student

                    # Dual-occupancy / 2 people at one desk check
                    if not anomaly_box and len(students_list) >= 2:
                        for idx in range(len(students_list) - 1):
                            s1 = students_list[idx]
                            s2 = students_list[idx + 1]
                            h_sep = abs(s1["center_x"] - s2["center_x"])
                            x_left = max(s1["bbox"][0], s2["bbox"][0])
                            y_top = max(s1["bbox"][1], s2["bbox"][1])
                            x_right = min(s1["bbox"][2], s2["bbox"][2])
                            y_bottom = min(s1["bbox"][3], s2["bbox"][3])
                            ov_w = max(0, x_right - x_left)
                            ov_h = max(0, y_bottom - y_top)
                            overlap_area = ov_w * ov_h

                            # Check if one person is an upright standing adult (e.g. invigilator)
                            # Seated examinees have aspect ratio w/h > 0.45; standing adults in aisle have slender w/h < 0.40 and tall height
                            w1 = s1["bbox"][2] - s1["bbox"][0]
                            h1 = s1["bbox"][3] - s1["bbox"][1]
                            w2 = s2["bbox"][2] - s2["bbox"][0]
                            h2 = s2["bbox"][3] - s2["bbox"][1]
                            asp1 = w1 / max(1.0, float(h1))
                            asp2 = w2 / max(1.0, float(h2))
                            is_standing_person = (asp1 < 0.40 and h1 > 300) or (asp2 < 0.40 and h2 > 300)

                            if (h_sep < 160.0 or overlap_area > 4000) and not is_standing_person:
                                anomaly_box = [
                                    min(s1["bbox"][0], s2["bbox"][0]),
                                    min(s1["bbox"][1], s2["bbox"][1]),
                                    max(s1["bbox"][2], s2["bbox"][2]),
                                    max(s1["bbox"][3], s2["bbox"][3])
                                ]
                                anomaly_label = f"CV DETECTED: 2 STUDENTS AT ONE DESK [{s1['seat']} & {s2['seat']}] (Shared Desk Crowding)"
                                cv_flagged_type = EventType.SEAT_VIOLATION
                                target_student = s1
                                break

                    # Multi-student peeking check between adjacent desks
                    if not anomaly_box and len(students_list) >= 2:
                        for idx in range(len(students_list) - 1):
                            s_left = students_list[idx]
                            s_right = students_list[idx + 1]
                            try:
                                face_l = mediapipe.analyze(frame, person_bbox=s_left["bbox"])
                                yaw_l = (face_l.head_pose.get("yaw", 0.0) if getattr(face_l, "head_pose", None) else getattr(face_l, "gaze_yaw", 0.0)) if face_l else 0.0
                                if face_l and face_l.face_detected and yaw_l > 35.0 and face_l.gaze_confidence > 0.70:
                                    anomaly_box = s_left["bbox"]
                                    anomaly_label = f"CV DETECTED: HEAD TURN [{s_left['seat']} -> {s_right['seat']}]"
                                    cv_flagged_type = EventType.PEEKING_NEIGHBOR_PAPER
                                    target_student = s_left
                                    break
                            except Exception:
                                pass
                            try:
                                face_r = mediapipe.analyze(frame, person_bbox=s_right["bbox"])
                                yaw_r = (face_r.head_pose.get("yaw", 0.0) if getattr(face_r, "head_pose", None) else getattr(face_r, "gaze_yaw", 0.0)) if face_r else 0.0
                                if face_r and face_r.face_detected and yaw_r < -35.0 and face_r.gaze_confidence > 0.70:
                                    anomaly_box = s_right["bbox"]
                                    anomaly_label = f"CV DETECTED: HEAD TURN [{s_right['seat']} -> {s_left['seat']}]"
                                    cv_flagged_type = EventType.PEEKING_NEIGHBOR_PAPER
                                    target_student = s_right
                                    break
                            except Exception:
                                pass

                    # Single student looking away check
                    if not anomaly_box and students_list:
                        for st in students_list:
                            try:
                                face = mediapipe.analyze(frame, person_bbox=st["bbox"])
                                yaw = (face.head_pose.get("yaw", 0.0) if getattr(face, "head_pose", None) else getattr(face, "gaze_yaw", 0.0)) if face else 0.0
                                if face and face.face_detected and abs(yaw) > 38.0 and face.gaze_confidence > 0.75:
                                    anomaly_box = face.bbox or st["bbox"]
                                    anomaly_label = f"CV DETECTED: LOOKING AWAY [{st['seat']}]"
                                    cv_flagged_type = EventType.LOOKING_AWAY
                                    target_student = st
                                    break
                            except Exception:
                                pass

                    # Spatial Seat Displacement Check: Detect students standing up, moving places, or vacating desk
                    if baseline_anchors and not anomaly_box:
                        for st in students_list:
                            # Skip upright standing personnel in the aisle (e.g. invigilator)
                            w_st = st["bbox"][2] - st["bbox"][0]
                            h_st = st["bbox"][3] - st["bbox"][1]
                            asp_st = w_st / max(1.0, float(h_st))
                            if asp_st < 0.40 and h_st > 300:
                                continue

                            matched_anchor = None
                            for s_tag, anchor in baseline_anchors.items():
                                if anchor.get("track_id") == st["track_id"]:
                                    matched_anchor = anchor
                                    break
                            if not matched_anchor:
                                matched_anchor = min(baseline_anchors.values(), key=lambda a: (a["anchor_x"] - st["center_x"])**2 + (a["anchor_y"] - st["center_y"])**2)

                            if matched_anchor:
                                disp = ((st["center_x"] - matched_anchor["anchor_x"])**2 + (st["center_y"] - matched_anchor["anchor_y"])**2)**0.5
                                seat_tag = matched_anchor["seat"]
                                hist = seat_displacement_history.setdefault(seat_tag, [])
                                hist.append(disp)
                                if len(hist) > 5:
                                    hist.pop(0)

                                # If student moved significantly away from assigned workstation (> 250 pixels on 1080p, sustained)
                                if disp > 250.0 and len(hist) >= 2 and all(h > 200.0 for h in hist[-2:]):
                                    anomaly_box = st["bbox"]
                                    anomaly_label = f"CV DETECTED: MOVED PLACES [{seat_tag}] (Displaced {int(disp)}px from desk)"
                                    cv_flagged_type = EventType.SEAT_VIOLATION
                                    target_student = st
                                    break

                    # 2. Prepare clean, high-performance frame for VLM inspection (downscale to 960px for 4x-10x speedup)
                    h_orig, w_orig = frame.shape[:2]
                    if w_orig > 960:
                        target_w = 960
                        target_h = int(h_orig * (target_w / float(w_orig)))
                        vlm_input_frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
                    else:
                        vlm_input_frame = frame
                    cv2.imwrite(temp_scan_path, vlm_input_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

                    # 4. Send this individual frame to VLM
                    vlm_verified = False
                    vlm_analysis_dict = None
                    is_violation = False
                    event_type = cv_flagged_type or EventType.SUSPICIOUS_BEHAVIOR
                    severity = EventSeverity.LOW
                    risk_delta = 0.0
                    final_desc = ""
                    res_confidence = 0.85
                    violating_student: Optional[Dict[str, Any]] = target_student

                    if vlm_enabled and os.path.isfile(temp_scan_path):
                        try:
                            prompt = build_multiframe_proctor_prompt(
                                n_frames=1,
                                camera_angle="desk-level exam surveillance",
                                seat_labels=seat_labels,
                                exam_rules="closed book; students must remain seated at assigned desks; no standing up, leaving seat or moving places; no chits, phones, notes or earphones"
                            )
                            res = vlm.analyze_image_file_sync(temp_scan_path, prompt=prompt)
                            if res.description or res.inference_time_ms > 0:
                                vlm_verified = True
                                res_confidence = float(res.confidence or 0.85)

                                # Correlate specific violating seat from VLM if returned
                                if res.violating_seats:
                                    for v_seat in res.violating_seats:
                                        m_seat = next((s for s in students_list if s["seat"] == v_seat or v_seat.startswith(s["seat"])), None)
                                        if m_seat:
                                            violating_student = m_seat
                                            break

                                vlm_analysis_dict = {
                                    "phone_detected": res.phone_detected,
                                    "cheating_detected": res.cheating_detected,
                                    "seat_violation_detected": getattr(res, "seat_violation_detected", False),
                                    "talking_detected": res.talking_detected,
                                    "earbud_detected": res.earbud_detected,
                                    "peeking_detected": res.peeking_detected,
                                    "detected_objects": res.detected_objects,
                                    "description": res.description or "VLM frame inspection complete.",
                                    "confidence": res.confidence,
                                    "violating_seats": res.violating_seats,
                                    "inference_time_ms": res.inference_time_ms,
                                    "model": vlm.model
                                }

                                seat_prefix = f"[{violating_student['seat']}] " if (violating_student and len(students_list) > 1) else ""

                                is_invigilator_patrol = (
                                    res.verdict == "FALSE_POSITIVE"
                                    or any(w in res.description.lower() for w in ("invigilator", "teacher patrolling", "patrolling aisles", "patrolling", "normal exam"))
                                )

                                if res.phone_detected:
                                    is_violation = True
                                    event_type = EventType.PHONE_DETECTED
                                    severity = EventSeverity.HIGH
                                    risk_delta = 25.0
                                    final_desc = f"{seat_prefix}[VLM Phone Detection] {res.description}"
                                elif is_invigilator_patrol and not (res.phone_detected or res.cheating_detected):
                                    is_violation = False
                                elif getattr(res, "seat_violation_detected", False) or any(k in res.description.lower() for k in ("seat violation", "leaving seat", "left seat", "vacat", "stood up", "standing up", "moving away", "moved places", "moving places", "moved from", "another desk", "another student's desk", "another seat", "moving place", "two people", "two students", "sharing a desk", "sharing the same", "single desk", "one desk", "crowding", "abnormal seating")):
                                    is_violation = True
                                    event_type = EventType.SEAT_VIOLATION
                                    severity = EventSeverity.HIGH
                                    risk_delta = 25.0
                                    tag = "Two Students at One Desk" if any(k in res.description.lower() for k in ("two", "sharing", "one desk", "single desk", "crowd")) else "Seat Violation"
                                    final_desc = f"{seat_prefix}[VLM {tag}] {res.description}"
                                elif res.cheating_detected:
                                    is_violation = True
                                    event_type = EventType.CHEAT_SHEET
                                    severity = EventSeverity.HIGH
                                    risk_delta = 20.0
                                    tag = "Chit Passing" if any(w in res.description.lower() for w in ("chit", "pass", "slip", "exchange")) else "Unauthorized Material"
                                    final_desc = f"{seat_prefix}[VLM {tag}] {res.description}"
                                elif res.peeking_detected:
                                    is_violation = True
                                    event_type = EventType.PEEKING_NEIGHBOR_PAPER
                                    severity = EventSeverity.MEDIUM
                                    risk_delta = 15.0
                                    final_desc = f"{seat_prefix}[VLM Peeking Detection] {res.description}"
                                elif res.talking_detected:
                                    is_violation = True
                                    event_type = EventType.COMMUNICATION
                                    severity = EventSeverity.MEDIUM
                                    risk_delta = 15.0
                                    final_desc = f"{seat_prefix}[VLM Communication Detection] {res.description}"
                                elif res.earbud_detected:
                                    is_violation = True
                                    event_type = EventType.UNAUTHORIZED_ITEM
                                    severity = EventSeverity.HIGH
                                    risk_delta = 20.0
                                    final_desc = f"{seat_prefix}[VLM Audio Device] {res.description}"
                                elif cv_flagged_type == EventType.SEAT_VIOLATION and res.verdict == "CONFIRMED_VIOLATION" and not is_invigilator_patrol:
                                    is_violation = True
                                    event_type = EventType.SEAT_VIOLATION
                                    severity = EventSeverity.HIGH
                                    risk_delta = 25.0
                                    final_desc = f"{seat_prefix}[Seat Violation - Moved Places] {res.description}"
                                elif (res.verdict == "CONFIRMED_VIOLATION" or (res.plausible is True and res.confidence >= 0.70)) and not is_invigilator_patrol:
                                    is_violation = True
                                    event_type = cv_flagged_type or EventType.SUSPICIOUS_BEHAVIOR
                                    severity = EventSeverity.MEDIUM
                                    risk_delta = 15.0
                                    final_desc = f"{seat_prefix}[VLM Confirmed Violation] {res.description}"
                                else:
                                    is_violation = False
                        except Exception as ve:
                            logger.debug(f"VLM single-frame scan exception at frame {frame_idx}: {ve}")
                    elif cv_flagged_type:
                        # Fallback if VLM is offline/disabled: record CV anomaly
                        is_violation = True
                        event_type = cv_flagged_type
                        severity = EventSeverity.HIGH if cv_flagged_type in (EventType.PHONE_DETECTED, EventType.SEAT_VIOLATION) else EventSeverity.MEDIUM
                        risk_delta = 25.0 if cv_flagged_type == EventType.SEAT_VIOLATION else (20.0 if cv_flagged_type == EventType.PHONE_DETECTED else 15.0)
                        seat_prefix = f"[{violating_student['seat']}] " if (violating_student and len(students_list) > 1) else ""
                        final_desc = f"{seat_prefix}[CV Sensor Detection] {anomaly_label}"

                    # 5. If violation detected and cooldown period passed, save permanent snapshot and record incident
                    if is_violation:
                        time_since_last = time_sec - last_incident_time.get(event_type, -999.0)
                        if time_since_last >= COOLDOWN_SEC:
                            prefix_tag = event_type.value.lower()[:12]
                            snap_filename = f"snap_{frame_idx:06d}_{prefix_tag}.jpg"
                            snap_abs_path = os.path.join(snapshot_dir, snap_filename)

                            assigned_student = violating_student or (students_list[0] if students_list else None)
                            assigned_track = assigned_student["track_id"] if assigned_student else 0
                            assigned_bbox = anomaly_box or (assigned_student["bbox"] if assigned_student else [0, 0, frame.shape[1], frame.shape[0]])

                            # Draw tactical overlay onto original full-res frame for high-clarity permanent evidence
                            annotated_evidence = VideoAuditService._annotate_frame(
                                frame,
                                students=students_list,
                                anomaly_bbox=assigned_bbox,
                                anomaly_label=final_desc,
                                time_sec=time_sec,
                                frame_idx=frame_idx
                            )
                            cv2.imwrite(snap_abs_path, annotated_evidence, [cv2.IMWRITE_JPEG_QUALITY, 92])
                            snap_rel = f"snapshots/{snap_filename}"

                            incident = VideoAuditIncident(
                                audit_id=audit_id,
                                timestamp_seconds=time_sec,
                                frame_index=frame_idx,
                                event_type=event_type,
                                severity=severity,
                                confidence=res_confidence,
                                description=final_desc,
                                track_id=assigned_track,
                                bbox=json.dumps(assigned_bbox),
                                snapshot_path=snap_rel,
                                vlm_verified=vlm_verified,
                                vlm_analysis=json.dumps(vlm_analysis_dict) if vlm_analysis_dict else None
                            )
                            db.add(incident)
                            incidents_count += 1
                            risk_points += risk_delta
                            last_incident_time[event_type] = time_sec
                            logger.info(f"Audit {audit_id}: Violation logged at {time_sec}s (Frame {frame_idx}): {event_type.value} by {assigned_student['seat'] if assigned_student else 'S1'}")

                    # 6. Live progress update to DB every 1.0 second
                    now = time.time()
                    if now - last_db_sync > 1.0:
                        progress = min(99.0, round((frame_idx / max(1, total_frames)) * 100.0, 1))
                        audit.processed_frames = frame_idx
                        audit.progress_percent = progress
                        audit.total_violations = incidents_count
                        audit.risk_score = min(100.0, round(risk_points, 1))
                        db.commit()
                        last_db_sync = now

                frame_idx += 1

            cap.release()

            # Clean up temporary inspection frame
            if os.path.isfile(temp_scan_path):
                try:
                    os.remove(temp_scan_path)
                except Exception:
                    pass

            # Mark audit completed
            audit.status = VideoAuditStatus.COMPLETED
            audit.completed_at = utcnow()
            audit.progress_percent = 100.0
            audit.processed_frames = total_frames
            audit.total_violations = incidents_count
            audit.risk_score = min(100.0, round(risk_points, 1))
            db.commit()
            logger.info(f"Frame-by-frame Video audit {audit_id} finished successfully with {incidents_count} violations (Risk score: {audit.risk_score})")

            # Stage 2: Automatic Post-Scan VLM Verification pass for any unverified incidents
            try:
                VideoAuditService._run_vlm_verification_pass(audit_id, db, video_path)
            except Exception as vlm_err:
                logger.warning(f"VLM post-scan verification pass skipped: {vlm_err}")

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
    def _annotate_frame(
        frame: np.ndarray,
        students: Optional[List[Dict[str, Any]]] = None,
        cand_bbox: Optional[List[Any]] = None,
        cand_label: str = "S1 (Candidate)",
        neighbor_bbox: Optional[List[Any]] = None,
        neighbor_label: str = "S2 (Neighbor)",
        anomaly_bbox: Optional[List[Any]] = None,
        anomaly_label: Optional[str] = None,
        time_sec: Optional[float] = None,
        frame_idx: Optional[int] = None
    ) -> np.ndarray:
        """Draw tactical proctoring overlay supporting any number of students (S1, S2, S3, S4...) with distinct color badges, plus bright red anomaly markers."""
        annotated = frame.copy()
        h, w = annotated.shape[:2]

        palette = [
            {"box": (40, 40, 220), "text": (255, 255, 255)},   # S1: Crimson
            {"box": (220, 180, 40), "text": (20, 20, 20)},     # S2: Amber / Gold
            {"box": (220, 210, 30), "text": (20, 20, 20)},     # S3: Cyan / Teal
            {"box": (200, 60, 180), "text": (255, 255, 255)},   # S4: Purple / Violet
            {"box": (50, 200, 100), "text": (20, 20, 20)},     # S5: Emerald Green
            {"box": (30, 130, 230), "text": (255, 255, 255)},   # S6: Electric Orange
        ]

        # Normalize students list
        display_students: List[Dict[str, Any]] = []
        if students:
            display_students = students
        else:
            if cand_bbox and len(cand_bbox) == 4:
                display_students.append({"label": cand_label, "bbox": cand_bbox})
            if neighbor_bbox and len(neighbor_bbox) == 4:
                display_students.append({"label": neighbor_label, "bbox": neighbor_bbox})

        # 1. Draw each student's designated seat box and top badge
        for i, st in enumerate(display_students):
            s_box = st.get("bbox")
            if not s_box or len(s_box) != 4:
                continue
            x1, y1, x2, y2 = [int(v) for v in s_box]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            c = palette[i % len(palette)]
            s_label = str(st.get("label") or f"S{i+1}")

            # Tactical student box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), c["box"], 2)
            # Label badge
            badge_w = min(w - x1, max(75, len(s_label) * 11 + 14))
            cv2.rectangle(annotated, (x1, max(0, y1 - 24)), (x1 + badge_w, y1), c["box"], -1)
            cv2.putText(annotated, s_label, (x1 + 4, max(14, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.44, c["text"], 1)

        # 2. CV Detected Anomaly Marker (thick bright red box with warning label)
        if anomaly_bbox and len(anomaly_bbox) == 4:
            ax1, ay1, ax2, ay2 = [int(v) for v in anomaly_bbox]
            ax1, ay1 = max(0, ax1), max(0, ay1)
            ax2, ay2 = min(w, ax2), min(h, ay2)
            cv2.rectangle(annotated, (ax1, ay1), (ax2, ay2), (0, 0, 255), 3)
            anom_text = anomaly_label or "CV SUSPECT: ANOMALY"
            badge_w = min(w - ax1, max(160, len(anom_text) * 9 + 16))
            cv2.rectangle(annotated, (ax1, max(0, ay1 - 24)), (ax1 + badge_w, ay1), (0, 0, 255), -1)
            cv2.putText(annotated, anom_text, (ax1 + 4, max(14, ay1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # 3. Tactical HUD / Watermark in bottom corner
        tc_str = f" // {time_sec:.2f}s" if time_sec is not None else ""
        f_str = f"FRAME {frame_idx:06d}" if frame_idx is not None else ""
        s_count_str = f" // {len(display_students)} STUDENTS" if len(display_students) > 0 else ""
        cv2.putText(annotated, f"ARGUS FORENSIC AUDIT // {f_str}{tc_str}{s_count_str}", (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1)

        return annotated

    @staticmethod
    def _save_annotated_snapshot(
        frame: np.ndarray,
        bbox: Optional[List[Any]],
        label: str,
        snapshot_dir: str,
        audit_id: str,
        frame_idx: int,
        prefix: str,
        neighbor_bbox: Optional[List[Any]] = None,
        anomaly_bbox: Optional[List[Any]] = None,
        anomaly_label: Optional[str] = None,
        time_sec: Optional[float] = None
    ) -> str:
        """Draw tactical overlay and save single full-resolution snapshot."""
        try:
            annotated = VideoAuditService._annotate_frame(
                frame,
                cand_bbox=bbox,
                cand_label=label,
                neighbor_bbox=neighbor_bbox,
                anomaly_bbox=anomaly_bbox,
                anomaly_label=anomaly_label,
                time_sec=time_sec,
                frame_idx=frame_idx
            )
            snap_filename = f"snap_{frame_idx:06d}_{prefix}.jpg"
            snap_abs_path = os.path.join(snapshot_dir, snap_filename)
            cv2.imwrite(snap_abs_path, annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
            # Return relative path format: snapshots/snap_...
            return f"snapshots/{snap_filename}"
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
            return ""

    @staticmethod
    def _save_multiframe_snapshot(
        frames: List[np.ndarray],
        timecodes: List[float],
        bbox: Optional[List[Any]],
        label: str,
        snapshot_dir: str,
        audit_id: str,
        frame_idx: int,
        prefix: str,
        neighbor_bbox: Optional[List[Any]] = None
    ) -> str:
        """Stitch 1 to 3 chronological frames into an annotated multi-panel proctor strip."""
        try:
            if not frames:
                return ""
            if len(frames) == 1:
                return VideoAuditService._save_annotated_snapshot(
                    frames[0], bbox, label, snapshot_dir, audit_id, frame_idx, prefix
                )

            target_h = 360
            banner_h = 28
            panels = []
            n = len(frames)
            peak_pos = n // 2  # Middle panel is peak anomaly moment

            for i, f in enumerate(frames):
                annotated = f.copy()
                h, w = annotated.shape[:2]

                # Highlight peak event panel with bounding box & label
                if i == peak_pos:
                    if bbox and len(bbox) == 4:
                        cand_label = f"S1: {label}" if neighbor_bbox else label
                        x1, y1, x2, y2 = [int(v) for v in bbox]
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), (40, 40, 220), 2)
                        cv2.rectangle(annotated, (x1, max(0, y1 - 22)), (min(w, x1 + 240), y1), (40, 40, 220), -1)
                        cv2.putText(annotated, cand_label, (x1 + 4, max(14, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)

                    if neighbor_bbox and len(neighbor_bbox) == 4:
                        nx1, ny1, nx2, ny2 = [int(v) for v in neighbor_bbox]
                        nx1, ny1 = max(0, nx1), max(0, ny1)
                        nx2, ny2 = min(w, nx2), min(h, ny2)
                        cv2.rectangle(annotated, (nx1, ny1), (nx2, ny2), (220, 180, 40), 2)
                        cv2.rectangle(annotated, (nx1, max(0, ny1 - 22)), (min(w, nx1 + 140), ny1), (220, 180, 40), -1)
                        cv2.putText(annotated, "S2 (NEIGHBOR)", (nx1 + 4, max(14, ny1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (20, 20, 20), 1)

                target_w = int(w * (target_h / float(max(1, h))))
                rf = cv2.resize(annotated, (target_w, target_h), interpolation=cv2.INTER_AREA)

                tc_str = f"{timecodes[i]:.1f}s" if i < len(timecodes) else f"F{i+1}"
                tag = "PEAK" if i == peak_pos else ("T - 1.5s" if i < peak_pos else "T + 1.5s")
                header_text = f"FRAME {i+1} [{tag} // {tc_str}]"

                panel = cv2.copyMakeBorder(rf, banner_h, 0, 0, 0, cv2.BORDER_CONSTANT, value=(15, 15, 20))
                cv2.putText(panel, header_text, (10, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200) if i == peak_pos else (200, 200, 200), 1)
                panels.append(panel)

            montage = np.hstack(panels)
            mh, mw = montage.shape[:2]
            cv2.putText(montage, f"ARGUS FORENSIC AUDIT // MULTI-FRAME TEMPORAL SEQUENCE // FRAME {frame_idx}", (14, mh - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 200), 1)

            snap_filename = f"snap_{frame_idx:06d}_{prefix}.jpg"
            snap_abs_path = os.path.join(snapshot_dir, snap_filename)
            cv2.imwrite(snap_abs_path, montage, [cv2.IMWRITE_JPEG_QUALITY, 85])
            return f"snapshots/{snap_filename}"
        except Exception as e:
            logger.error(f"Failed to save multi-frame snapshot: {e}")
            return VideoAuditService._save_annotated_snapshot(frames[0], bbox, label, snapshot_dir, audit_id, frame_idx, prefix)

    @staticmethod
    def _run_vlm_verification_pass(audit_id: str, db: Session, video_path: str):
        """Stage 2: Automatic post-scan VLM second-opinion pass on unique keyframe snapshots."""
        vlm = get_vlm_client()
        if not vlm.enabled:
            return

        incidents = db.query(VideoAuditIncident).filter(
            VideoAuditIncident.audit_id == audit_id,
            VideoAuditIncident.vlm_verified == False
        ).order_by(VideoAuditIncident.timestamp_seconds).limit(10).all()

        if not incidents:
            return

        audit_dir = os.path.dirname(video_path)
        logger.info(f"Running post-scan VLM verification pass on {len(incidents)} flagged keyframes for audit {audit_id}...")

        prompt = build_multiframe_proctor_prompt(
            n_frames=1,
            camera_angle="desk-level exam surveillance",
            seat_labels="S1 (candidate), S2 (adjacent neighbor)",
            exam_rules="closed book; no phones, notes or earphones; calculators not allowed"
        )

        verified_count = 0
        for inc in incidents:
            if not inc.snapshot_path:
                continue
            snapshot_abs = os.path.join(audit_dir, inc.snapshot_path)
            if not os.path.isfile(snapshot_abs):
                continue

            try:
                res = vlm.analyze_image_file_sync(snapshot_abs, prompt=prompt)
                if res.description or res.inference_time_ms > 0:
                    analysis_dict = {
                        "phone_detected": res.phone_detected,
                        "cheating_detected": res.cheating_detected,
                        "talking_detected": res.talking_detected,
                        "earbud_detected": res.earbud_detected,
                        "peeking_detected": res.peeking_detected,
                        "detected_objects": res.detected_objects,
                        "description": res.description or "VLM evaluation complete.",
                        "confidence": res.confidence,
                        "inference_time_ms": res.inference_time_ms,
                        "model": vlm.model
                    }
                    inc.vlm_verified = True
                    inc.vlm_analysis = json.dumps(analysis_dict)
                    verified_count += 1
            except Exception as e:
                logger.debug(f"VLM post-scan analysis failed for incident {inc.incident_id}: {e}")

        if verified_count > 0:
            db.commit()
            logger.info(f"VLM post-scan verification completed for {verified_count} incidents on audit {audit_id}")

    @staticmethod
    async def verify_incident_vlm(audit_id: str, incident_id: str, db: Session) -> Dict[str, Any]:
        """Verify an individual incident on-demand using VLM (async)."""
        incident = db.query(VideoAuditIncident).filter(
            VideoAuditIncident.incident_id == incident_id,
            VideoAuditIncident.audit_id == audit_id
        ).first()
        if not incident:
            raise ValueError(f"Incident {incident_id} not found in audit {audit_id}")

        audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
        if not audit:
            raise ValueError(f"Audit {audit_id} not found")

        audit_dir = os.path.dirname(audit.video_path)
        snapshot_abs = os.path.join(audit_dir, incident.snapshot_path or "")
        if not os.path.isfile(snapshot_abs):
            raise FileNotFoundError(f"Evidence snapshot file not found at: {snapshot_abs}")

        vlm = get_vlm_client()
        prompt = build_multiframe_proctor_prompt(
            n_frames=1,
            camera_angle="desk-level exam surveillance",
            seat_labels="S1 (candidate), S2 (adjacent neighbor)",
            exam_rules="closed book; no phones, notes or earphones; calculators not allowed"
        )
        res = await vlm.analyze_image_file(snapshot_abs, prompt=prompt)

        analysis_dict = {
            "phone_detected": res.phone_detected,
            "cheating_detected": res.cheating_detected,
            "talking_detected": res.talking_detected,
            "earbud_detected": res.earbud_detected,
            "peeking_detected": res.peeking_detected,
            "detected_objects": res.detected_objects,
            "description": res.description or "VLM inspection complete.",
            "confidence": res.confidence,
            "inference_time_ms": res.inference_time_ms,
            "model": vlm.model
        }

        incident.vlm_verified = True
        incident.vlm_analysis = json.dumps(analysis_dict)
        db.commit()

        return {
            "incident_id": incident.incident_id,
            "vlm_verified": True,
            "vlm_analysis": analysis_dict,
            "message": "VLM verification complete."
        }

    @staticmethod
    async def verify_all_incidents_vlm(audit_id: str, db: Session) -> Dict[str, Any]:
        """Batch-verifies all unverified incidents for an audit session."""
        incidents = db.query(VideoAuditIncident).filter(
            VideoAuditIncident.audit_id == audit_id
        ).all()
        verified_count = 0
        for inc in incidents:
            try:
                await VideoAuditService.verify_incident_vlm(audit_id, inc.incident_id, db)
                verified_count += 1
            except Exception as e:
                logger.warning(f"Failed to verify incident {inc.incident_id} with VLM: {e}")
        return {
            "audit_id": audit_id,
            "total_incidents": len(incidents),
            "verified_count": verified_count,
            "message": f"Successfully verified {verified_count} of {len(incidents)} incidents with VLM."
        }

