import cv2
import numpy as np
import time
import threading
from datetime import datetime
from typing import Optional, Dict, Any, List
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
    Manages camera input with configurable FPS, resolution, and instant hardware switching.
    Includes automatic synthetic stream fallback if no physical webcam is detected.
    Supports dynamic enumeration of connected webcams (including 1080p Full HD devices).
    """

    _cached_cameras: Optional[List[Dict[str, Any]]] = None
    _cached_cameras_time: float = 0.0

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
        self.dropped_frames = 0
        self.last_frame_time: float = 0.0
        self.fps_actual = 0.0
        self.error_count = 0
        self.connected_since: Optional[float] = None
        self._lock = threading.Lock()
        self._latest_frame: Optional[FrameData] = None
        self._latest_lock = threading.Lock()

    @classmethod
    def list_available_cameras(cls, max_tested: int = 5, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Enumerate ONLY physical hardware cameras (inbuilt laptop webcams and USB webcams).
        Strictly filters out all software, broadcasting, and virtual filter devices (e.g. NVIDIA Broadcast, OBS, DroidCam).
        """
        now = time.time()
        if not force_refresh and cls._cached_cameras is not None and (now - cls._cached_cameras_time < 30.0):
            return cls._cached_cameras

        VIRTUAL_CAMERA_KEYWORDS = [
            'nvidia', 'broadcast', 'obs', 'virtual', 'droidcam', 'iriun',
            'epoccam', 'camo', 'manycam', 'xsplit', 'snap camera', 'vmix',
            'splitcam', 'screen', 'loopback', 'ndi', 'dummy', 'fake'
        ]

        discovered = []

        # Step 1: DirectShow hardware device query via pygrabber (Windows native hardware bus)
        try:
            from pygrabber.dshow_graph import FilterGraph
            graph = FilterGraph()
            raw_devices = graph.get_input_devices()
            for idx, raw_name in enumerate(raw_devices):
                name_lower = raw_name.lower()
                # Exclude any virtual or software driver
                if any(kw in name_lower for kw in VIRTUAL_CAMERA_KEYWORDS):
                    continue

                is_1080p = any(term in name_lower for term in ['1080', 'fhd', 'full hd', '1080p', 'hd pro', 'pro hd'])
                res_str = '1920x1080' if is_1080p else '1280x720'

                discovered.append({
                    "source": str(idx),
                    "index": idx,
                    "name": raw_name,
                    "hardware_name": raw_name,
                    "max_resolution": res_str,
                    "is_1080p": is_1080p,
                    "is_physical": True,
                    "working": True
                })
        except Exception as ex:
            logger.debug(f"DirectShow filter graph enumeration fallback: {ex}")

        # Step 2: Fallback to index probe if pygrabber finds nothing
        if not discovered:
            for idx in range(max_tested):
                try:
                    cap = cv2.VideoCapture(idx)
                    if cap is not None and cap.isOpened():
                        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
                        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
                        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
                        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                        w_max = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        h_max = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        is_1080p = (w_max >= 1920 and h_max >= 1080)
                        res_str = f"{w_max}x{h_max}" if (w_max > 0 and h_max > 0) else f"{w}x{h}"

                        label = f"USB / Inbuilt Webcam {idx}"
                        if is_1080p:
                            label += " (1080p FHD)"
                        else:
                            label += f" ({res_str})"

                        discovered.append({
                            "source": str(idx),
                            "index": idx,
                            "name": label,
                            "hardware_name": label,
                            "max_resolution": res_str,
                            "is_1080p": is_1080p,
                            "is_physical": True,
                            "working": True
                        })
                        cap.release()
                except Exception as ex:
                    logger.debug(f"Fallback probe error index {idx}: {ex}")

        if not discovered:
            discovered.append({
                "source": "0",
                "index": 0,
                "name": "Simulated Proctored Stream (Demo)",
                "hardware_name": "Demo Stream",
                "max_resolution": "1280x720",
                "is_1080p": False,
                "is_physical": False,
                "working": True
            })

        cls._cached_cameras = discovered
        cls._cached_cameras_time = now
        return discovered

    @staticmethod
    def _open_capture(source_str: str, width: int, height: int, fps: int) -> Optional[cv2.VideoCapture]:
        """
        Open physical camera with Windows DirectShow backend,
        and single-frame buffering to eliminate video delay and frame latency.
        """
        try:
            src = int(source_str) if source_str.isdigit() else source_str
            # DirectShow on Windows with buffer size = 1 gives lowest latency capture
            if isinstance(src, int) and hasattr(cv2, 'CAP_DSHOW'):
                cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(src)

            if cap is not None and cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                cap.set(cv2.CAP_PROP_FPS, fps)
                return cap
        except Exception as ex:
            logger.debug(f"DirectShow open failed for {source_str}: {ex}")

        # Fallback to standard open if DirectShow fails
        try:
            src = int(source_str) if source_str.isdigit() else source_str
            cap = cv2.VideoCapture(src)
            if cap is not None and cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                return cap
        except Exception as ex:
            logger.debug(f"Standard open failed for {source_str}: {ex}")

        return None

    def switch_source(
        self,
        new_source: str,
        fps: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None
    ) -> bool:
        """
        Instantly switch camera device source on the fly without stopping downstream loops.
        """
        with self._lock:
            self.camera_source = new_source
            if fps is not None and fps > 0:
                self.target_fps = fps
            if width is not None and width > 0:
                self.target_width = width
            if height is not None and height > 0:
                self.target_height = height

            if not self.is_running:
                logger.info(f"Camera source configured to {self.camera_source} ({self.target_width}x{self.target_height}) [Standby]")
                return True

            # Release previous physical stream
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception as e:
                    logger.debug(f"Error releasing previous capture: {e}")
                self.cap = None

            try:
                new_cap = self._open_capture(
                    self.camera_source,
                    self.target_width,
                    self.target_height,
                    self.target_fps
                )

                # If requested camera failed to open and source is not "0", attempt auto-recovery to physical camera 0
                if (new_cap is None or not new_cap.isOpened()) and str(self.camera_source) != "0":
                    logger.info(f"Camera source {self.camera_source} unavailable; attempting fallback to primary camera 0...")
                    fallback_cap = self._open_capture("0", self.target_width, self.target_height, self.target_fps)
                    if fallback_cap is not None and fallback_cap.isOpened():
                        new_cap = fallback_cap
                        self.camera_source = "0"
                        logger.info("Successfully recovered using physical camera 0")

                if new_cap is not None and new_cap.isOpened():
                    self.cap = new_cap
                    self.is_synthetic = False
                    self.error_count = 0
                    logger.info(f"Successfully switched live feed to camera {self.camera_source} ({self.target_width}x{self.target_height} @ {self.target_fps} FPS)")
                else:
                    logger.warning(f"Could not open camera {self.camera_source}. Running in synthetic fallback mode.")
                    self.is_synthetic = True
                    self.cap = None
                return True
            except Exception as e:
                logger.error(f"Error switching camera source: {e}")
                self.is_synthetic = True
                return False

    def start(self) -> bool:
        """Initialize and start camera capture. Falls back to synthetic demo stream if physical camera is unavailable."""
        with self._lock:
            if self.is_running:
                logger.warning("Camera already running")
                return True

            try:
                new_cap = self._open_capture(
                    self.camera_source,
                    self.target_width,
                    self.target_height,
                    self.target_fps
                )

                # If primary source failed and wasn't "0", try probing physical camera 0 before giving up
                if (new_cap is None or not new_cap.isOpened()) and str(self.camera_source) != "0":
                    logger.info(f"Camera {self.camera_source} unavailable on startup; probing primary physical camera 0...")
                    fallback_cap = self._open_capture("0", self.target_width, self.target_height, self.target_fps)
                    if fallback_cap is not None and fallback_cap.isOpened():
                        new_cap = fallback_cap
                        self.camera_source = "0"
                        logger.info("Successfully bound to primary physical camera 0")

                if new_cap is None or not new_cap.isOpened():
                    logger.warning(f"Could not open physical camera {self.camera_source}. Running in SYNTHETIC DEMO mode.")
                    self.is_synthetic = True
                    self.cap = None
                    actual_fps = float(self.target_fps)
                    actual_width = self.target_width
                    actual_height = self.target_height
                else:
                    self.cap = new_cap
                    self.is_synthetic = False
                    actual_fps = self.cap.get(cv2.CAP_PROP_FPS) or float(self.target_fps)
                    actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or self.target_width
                    actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or self.target_height
                    logger.info(f"Physical camera opened: {actual_width}x{actual_height} @ {actual_fps:.1f} FPS (DirectShow MJPG)")

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
        cv2.putText(img, f"CAMERA {self.camera_source} [DEMO / SYNTHETIC STREAM] - {ts_str}", (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 140), 2)
        cv2.putText(img, f"FRAME: {self.frame_count} | {self.target_fps} FPS", (self.target_width - 320, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (170, 185, 205), 1)

        return img

    def _capture_loop(self):
        """Background thread for hardware and synthetic frame capture."""
        frame_interval = 1.0 / max(1, self.target_fps)

        while self.is_running:
            loop_start = time.time()

            try:
                if self.is_synthetic:
                    frame = self._generate_synthetic_frame()
                    elapsed = time.time() - loop_start
                    sleep_time = frame_interval - elapsed
                    if sleep_time > 0:
                        time.sleep(sleep_time)
                else:
                    if self.cap is None:
                        frame = self._generate_synthetic_frame()
                        time.sleep(0.03)
                    else:
                        ret, frame = self.cap.read()
                        if not ret or frame is None:
                            self.error_count += 1
                            if self.error_count > 10:
                                logger.warning("Physical camera read failed repeatedly — falling back to synthetic demo")
                                self.is_synthetic = True
                                self.error_count = 0
                            time.sleep(0.03)
                            continue
                        self.error_count = 0
                        # Note: cap.read() blocks on hardware sensor clock (~33ms @ 30 FPS), no extra sleep needed

                current_time = time.time()
                frame_data = FrameData(
                    frame=frame,
                    timestamp=current_time,
                    frame_number=self.frame_count,
                    camera_id=int(self.camera_source) if self.camera_source.isdigit() else 0
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

            except Exception as e:
                logger.error(f"Capture loop error: {e}")
                self.error_count += 1
                time.sleep(0.05)

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

        if self.frame_count == 0:
            return False

        if time.time() - self.last_frame_time > 5.0:
            return False

        return True

    def get_status(self) -> Dict[str, Any]:
        """Get camera status info."""
        return {
            "camera_id": int(self.camera_source) if self.camera_source.isdigit() else 0,
            "camera_source": self.camera_source,
            "status": "ACTIVE" if self.is_running and self.validate_stream() else "INACTIVE",
            "mode": "SYNTHETIC" if getattr(self, "is_synthetic", False) else "PHYSICAL",
            "fps": round(self.fps_actual, 1),
            "target_fps": self.target_fps,
            "resolution": f"{self.target_width}x{self.target_height}",
            "is_1080p": (self.target_width >= 1920 and self.target_height >= 1080),
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