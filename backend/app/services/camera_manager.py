import cv2
import numpy as np
import time
import threading
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class FrameData:
    frame: np.ndarray
    timestamp: float
    frame_number: int
    camera_id: int


class CameraManager:
    """
    Manages camera input with configurable FPS and resolution.
    Includes automatic synthetic stream fallback if no physical webcam is detected.
    """

    def __init__(
        self,
        camera_source: str = "0",
        fps: int = 30,
        width: int = 1280,
        height: int = 720
    ):
        self.camera_source = camera_source
        self.target_fps = fps
        self.target_width = width
        self.target_height = height

        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.is_synthetic = False
        self.capture_thread: Optional[threading.Thread] = None

        self.frame_count = 0
        self.last_frame_time: float = 0.0
        self.fps_actual = 0.0
        self.error_count = 0
        self.connected_since: Optional[float] = None
        self._lock = threading.Lock()
        self._latest_frame: Optional[FrameData] = None
        self._latest_lock = threading.Lock()

    def start(self) -> bool:
        """Initialize and start camera capture. Falls back to synthetic demo stream if physical camera is unavailable."""
        with self._lock:
            if self.is_running:
                logger.warning("Camera already running")
                return True

            try:
                # Parse camera source
                if self.camera_source.isdigit():
                    source = int(self.camera_source)
                else:
                    source = self.camera_source

                self.cap = cv2.VideoCapture(source)
                self.is_synthetic = False

                if not self.cap.isOpened():
                    logger.warning(f"Could not open physical camera {self.camera_source}. Running in SYNTHETIC DEMO mode.")
                    self.is_synthetic = True
                    actual_fps = float(self.target_fps)
                    actual_width = self.target_width
                    actual_height = self.target_height
                else:
                    # Set camera properties
                    self.cap.set(cv2.CAP_PROP_FPS, self.target_fps)
                    self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.target_width)
                    self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.target_height)
                    actual_fps = self.cap.get(cv2.CAP_PROP_FPS) or float(self.target_fps)
                    actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or self.target_width
                    actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or self.target_height
                    logger.info(f"Physical camera opened: {actual_width}x{actual_height} @ {actual_fps:.1f} FPS")

                self.is_running = True
                self.frame_count = 0
                self.dropped_frames = 0
                self.error_count = 0
                self.connected_since = time.time()

                # Start capture thread
                self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
                self.capture_thread.start()

                return True

            except Exception as e:
                logger.error(f"Camera start error: {e}")
                self.is_running = False
                return False

    def _generate_synthetic_frame(self) -> np.ndarray:
        """Generate a synthetic surveillance frame when physical webcam is unavailable."""
        img = np.zeros((self.target_height, self.target_width, 3), dtype=np.uint8)
        img[:] = (22, 26, 35)

        # Subtle background grid
        for x in range(0, self.target_width, 80):
            cv2.line(img, (x, 0), (x, self.target_height), (30, 35, 48), 1)
        for y in range(0, self.target_height, 80):
            cv2.line(img, (0, y), (self.target_width, y), (30, 35, 48), 1)

        # Simulated exam desk
        cx, cy = self.target_width // 2, self.target_height // 2 + 60
        cv2.rectangle(img, (cx - 280, cy - 80), (cx + 280, cy + 180), (45, 55, 75), 2)
        cv2.putText(img, "PROCTORED EXAM WORKSTATION", (cx - 190, cy + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (110, 125, 150), 2)
        cv2.putText(img, "SIMULATED SURVEILLANCE FEED", (cx - 180, cy + 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 95, 120), 1)

        # Header bar
        cv2.rectangle(img, (0, 0), (self.target_width, 55), (15, 20, 28), -1)
        ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(img, f"CAMERA 0 [DEMO / SYNTHETIC STREAM] - {ts_str}", (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 140), 2)
        cv2.putText(img, f"FRAME: {self.frame_count} | {self.target_fps} FPS", (self.target_width - 320, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (170, 185, 205), 1)

        return img

    def _capture_loop(self):
        """Background thread for frame capture."""
        frame_interval = 1.0 / self.target_fps

        while self.is_running:
            loop_start = time.time()

            try:
                if self.is_synthetic:
                    frame = self._generate_synthetic_frame()
                else:
                    if self.cap is None:
                        frame = self._generate_synthetic_frame()
                    else:
                        ret, frame = self.cap.read()
                        if not ret or frame is None:
                            self.error_count += 1
                            if self.error_count > 10:
                                logger.warning("Physical camera read failed repeatedly — falling back to synthetic demo")
                                self.is_synthetic = True
                                self.error_count = 0
                            time.sleep(0.1)
                            continue
                        self.error_count = 0

                # Normalize frame
                frame = self._normalize_frame(frame)

                # Create frame data
                current_time = time.time()
                frame_data = FrameData(
                    frame=frame,
                    timestamp=current_time,
                    frame_number=self.frame_count,
                    camera_id=0
                )

                with self._latest_lock:
                    self._latest_frame = frame_data

                self.frame_count += 1
                self.last_frame_time = current_time

                # FPS calculation
                if self.frame_count % 30 == 0 and self.connected_since is not None:
                    elapsed = current_time - self.connected_since
                    if elapsed > 0:
                        self.fps_actual = self.frame_count / elapsed

                # Throttle to target FPS
                elapsed = time.time() - loop_start
                sleep_time = frame_interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

            except Exception as e:
                logger.error(f"Capture loop error: {e}")
                self.error_count += 1
                time.sleep(0.1)

    def _normalize_frame(self, frame: np.ndarray) -> np.ndarray:
        """Normalize frame to target resolution."""
        h, w = frame.shape[:2]

        if w != self.target_width or h != self.target_height:
            frame = cv2.resize(frame, (self.target_width, self.target_height),
                             interpolation=cv2.INTER_LINEAR)

        return frame

    def get_display_frame(self) -> Optional[FrameData]:
        with self._latest_lock:
            return self._latest_frame

    def validate_stream(self) -> bool:
        """Health check on camera stream."""
        if not self.is_running:
            return False

        if not self.is_synthetic:
            if self.cap is None or not self.cap.isOpened():
                return False

        # Check if we're getting frames
        if self.frame_count == 0:
            return False

        # Check recent frame rate
        if time.time() - self.last_frame_time > 5.0:  # No frame for 5 seconds
            return False

        return True

    def get_status(self) -> Dict[str, Any]:
        """Get camera status info."""
        return {
            "camera_id": 0,
            "status": "ACTIVE" if self.is_running and self.validate_stream() else "INACTIVE",
            "mode": "SYNTHETIC" if getattr(self, "is_synthetic", False) else "PHYSICAL",
            "fps": round(self.fps_actual, 1),
            "target_fps": self.target_fps,
            "resolution": f"{self.target_width}x{self.target_height}",
            "connected_since": self.connected_since,
            "frame_count": self.frame_count,
            "error_count": self.error_count
        }

    def stop(self):
        """Stop camera and release resources."""
        with self._lock:
            if not self.is_running:
                return

            self.is_running = False

            if self.capture_thread and self.capture_thread.is_alive() and self.capture_thread is not threading.current_thread():
                self.capture_thread.join(timeout=2.0)

            if self.cap:
                self.cap.release()
                self.cap = None

            logger.info("Camera stopped")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()