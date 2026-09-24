import cv2
import numpy as np
import subprocess
import threading
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path
from collections import deque
from dataclasses import dataclass

from app.database import get_db_session
from app.models import Event, EventSeverity, EventType, AnomalyStatus
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Locate bundled ffmpeg from imageio-ffmpeg (no system install required)
_FFMPEG_EXE: Optional[str] = None
try:
    import imageio_ffmpeg
    _FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
    logger.info(f"Using bundled ffmpeg: {_FFMPEG_EXE}")
except ImportError:
    logger.warning("imageio-ffmpeg not installed — video clips will use mp4v (not browser-playable)")


@dataclass
class EventData:
    exam_id: str
    track_id: int
    participant_id: Optional[str]
    camera_id: int
    event_type: EventType
    severity: EventSeverity
    timestamp: datetime
    description: str
    confidence: float
    analysis_data: Optional[Dict[str, Any]] = None
    frame: Optional[np.ndarray] = None
    status: AnomalyStatus = AnomalyStatus.PRELIMINARY


class VideoClipWriter:
    """Handle video clip extraction for evidence using a rolling JPEG-compressed frame buffer."""

    def __init__(self, storage_path: str, fps: int = 30):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.fps = fps
        duration = getattr(settings, "BUFFER_DURATION_SECONDS", 30)
        self.buffer_size = int(duration * self.fps)  # e.g., 30s * 30 FPS = 900 frames
        self.jpeg_quality = getattr(settings, "BUFFER_JPEG_QUALITY", 80)
        self.camera_buffers: Dict[int, deque] = {}
        self._lock = threading.Lock()

    def add_frame(self, camera_id: int, frame: np.ndarray, timestamp: Optional[datetime] = None):
        """Add frame to circular buffer for camera as compressed JPEG byte buffer."""
        ret, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality])
        if not ret:
            return
        ts = timestamp or datetime.now()
        with self._lock:
            if camera_id not in self.camera_buffers:
                self.camera_buffers[camera_id] = deque(maxlen=self.buffer_size)
            self.camera_buffers[camera_id].append((ts, encoded))

    @staticmethod
    def _remux_to_h264(src: str, dst: str, fps: int) -> bool:
        """Re-encode an mp4v clip to H.264 using the bundled ffmpeg."""
        if not _FFMPEG_EXE:
            return False
        try:
            subprocess.run(
                [
                    _FFMPEG_EXE, "-y",
                    "-i", src,
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-crf", "23",
                    "-pix_fmt", "yuv420p",  # required for browser playback
                    "-movflags", "+faststart",  # enables progressive download
                    "-an",  # no audio
                    "-r", str(fps),
                    dst
                ],
                check=True,
                capture_output=True,
                timeout=30
            )
            return True
        except Exception as e:
            logger.warning(f"ffmpeg re-encode failed: {e}")
            return False

    def save_clip(
        self,
        exam_id: str,
        track_id: int,
        event_type: str,
        timestamp: datetime,
        duration_seconds: Optional[float] = None,
        camera_id: int = 0
    ) -> Optional[str]:
        """Save video clip from rolling buffer as browser-playable H.264 MP4."""
        eff_duration = duration_seconds if duration_seconds is not None else getattr(settings, "EVENT_CLIP_DURATION_SECONDS", 15.0)
        with self._lock:
            if camera_id not in self.camera_buffers:
                return None

            buffer = list(self.camera_buffers[camera_id])
            if not buffer:
                return None

            # Calculate frames needed
            frames_needed = int(eff_duration * self.fps)
            items_to_save = buffer[-frames_needed:] if len(buffer) >= frames_needed else buffer

            if not items_to_save:
                return None

            # Decode JPEG buffers to uncompressed frames on demand
            frames_to_save: List[np.ndarray] = []
            for item in items_to_save:
                if isinstance(item, tuple):
                    _, encoded = item
                    dec = cv2.imdecode(np.frombuffer(encoded, np.uint8), cv2.IMREAD_COLOR)
                    if dec is not None:
                        frames_to_save.append(dec)
                elif isinstance(item, np.ndarray):
                    frames_to_save.append(item)

            if not frames_to_save:
                return None

            # Generate filename
            timestamp_str = timestamp.strftime("%Y%m%d_%H%M%S")
            filename = f"{event_type}_{timestamp_str}_track{track_id}.mp4"
            filepath = self.storage_path / f"exam_{exam_id}" / filename
            filepath.parent.mkdir(parents=True, exist_ok=True)

            # Step 1: Write raw clip using OpenCV (mp4v — fast, but not browser-playable)
            h, w = frames_to_save[0].shape[:2]
            raw_path = str(filepath) + ".raw.mp4"
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(raw_path, fourcc, self.fps, (w, h))

            for frame in frames_to_save:
                writer.write(frame)
            writer.release()

            # Step 2: Re-encode to H.264 for browser playback
            final_path = str(filepath)
            if self._remux_to_h264(raw_path, final_path, self.fps):
                # Clean up raw file
                try:
                    Path(raw_path).unlink()
                except OSError:
                    pass
                logger.info(f"Saved H.264 evidence clip ({len(frames_to_save)} frames): {filepath}")
            else:
                # Fallback: rename raw file as final (mp4v — won't play in browser but file exists)
                try:
                    Path(raw_path).rename(filepath)
                except OSError:
                    pass
                logger.warning(f"Saved mp4v fallback clip ({len(frames_to_save)} frames): {filepath}")

            return final_path


class ScreenshotCapture:
    """Capture and save screenshots for evidence."""

    def __init__(self, storage_path: str):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def capture(
        self,
        exam_id: str,
        track_id: int,
        event_type: str,
        frame: np.ndarray,
        timestamp: datetime,
        overlays: Optional[List[Dict]] = None
    ) -> str:
        """Save screenshot with optional overlays."""
        # Draw overlays on copy
        vis_frame = frame.copy()

        if overlays:
            for overlay in overlays:
                self._draw_overlay(vis_frame, overlay)

        # Generate filename
        timestamp_str = timestamp.strftime("%Y%m%d_%H%M%S")
        filename = f"{event_type}_{timestamp_str}_track{track_id}.jpg"
        filepath = self.storage_path / f"exam_{exam_id}" / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save
        cv2.imwrite(str(filepath), vis_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

        return str(filepath)

    def _draw_overlay(self, frame: np.ndarray, overlay: Dict):
        """Draw detection overlay on frame."""
        overlay_type = overlay.get('type')

        if overlay_type == 'bbox':
            bbox = overlay.get('bbox')
            color = overlay.get('color', (0, 255, 0))
            thickness = overlay.get('thickness', 2)
            if bbox:
                cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, thickness)

        elif overlay_type == 'keypoints':
            keypoints = overlay.get('keypoints')
            color = overlay.get('color', (255, 0, 0))
            if keypoints:
                for kpt in keypoints:
                    if len(kpt) >= 3 and kpt[2] > 0.5:
                        cv2.circle(frame, (int(kpt[0]), int(kpt[1])), 3, color, -1)

        elif overlay_type == 'gaze':
            center = overlay.get('center')
            direction = overlay.get('direction')
            if center and direction:
                end_pt = (center[0] + direction[0] * 50, center[1] + direction[1] * 50)
                cv2.arrowedLine(frame, center, end_pt, (0, 255, 255), 3)

        elif overlay_type == 'arrow':
            start = overlay.get('start')
            end = overlay.get('end')
            color = overlay.get('color', (0, 0, 255))
            thickness = overlay.get('thickness', 3)
            if start and end:
                cv2.arrowedLine(frame, (int(start[0]), int(start[1])), (int(end[0]), int(end[1])), color, thickness, tipLength=0.2)


class EventLogger:
    """Log events to database and capture evidence."""

    def __init__(self):
        self.clip_writer = VideoClipWriter(settings.CLIPS_STORAGE_PATH)
        self.screenshot_capture = ScreenshotCapture(settings.SCREENSHOTS_STORAGE_PATH)

    def add_frame(self, camera_id: int, frame: np.ndarray):
        """Buffer a live frame into rolling evidence buffer."""
        self.clip_writer.add_frame(camera_id, frame)

    def log_event(
        self,
        event_data: EventData,
        frame: Optional[np.ndarray] = None,
        overlays: Optional[List[Dict]] = None
    ) -> Optional[Event]:
        """Log event to database with evidence capture."""
        db = get_db_session()
        try:
            # Capture screenshot
            screenshot_path = None
            if frame is not None:
                screenshot_path = self.screenshot_capture.capture(
                    event_data.exam_id,
                    event_data.track_id,
                    event_data.event_type.value,
                    frame,
                    event_data.timestamp,
                    overlays
                )

            # Capture video clip (rolling history based on EVENT_CLIP_DURATION_SECONDS)
            clip_path = self.clip_writer.save_clip(
                event_data.exam_id,
                event_data.track_id,
                event_data.event_type.value,
                event_data.timestamp,
                duration_seconds=getattr(settings, "EVENT_CLIP_DURATION_SECONDS", 15.0),
                camera_id=event_data.camera_id
            )

            # Create event in database
            event = create_event(
                db=db,
                exam_id=event_data.exam_id,
                track_id=event_data.track_id,
                participant_id=event_data.participant_id,
                camera_id=event_data.camera_id,
                event_type=event_data.event_type,
                severity=event_data.severity,
                timestamp=event_data.timestamp,
                description=event_data.description,
                confidence=event_data.confidence,
                analysis_data=event_data.analysis_data,
                evidence_clip_path=clip_path,
                evidence_screenshot_path=screenshot_path,
                status=event_data.status
            )

            logger.info(
                f"Event logged: {event_data.event_type.value} "
                f"(Severity: {event_data.severity.value}) for track {event_data.track_id}"
            )

            return event

        except Exception as e:
            logger.error(f"Failed to log event: {e}")
            db.rollback()
            return None
        finally:
            db.close()


# Global instance
_event_logger: Optional[EventLogger] = None


def get_event_logger() -> EventLogger:
    """Get or create global event logger."""
    global _event_logger
    if _event_logger is None:
        _event_logger = EventLogger()
    return _event_logger


# Helper imports
from app.crud import create_event