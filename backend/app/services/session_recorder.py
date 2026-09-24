import os
import cv2
import time
import queue
import logging
import threading
import subprocess
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_FFMPEG_EXE: Optional[str] = None
try:
    import imageio_ffmpeg
    _FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    pass


class SessionVideoRecorder:
    """
    Thread-decoupled continuous exam session video recorder.
    Consumes frames asynchronously through an internal queue so that live 30 FPS
    surveillance, WebSocket streaming, and AI detection loops are never blocked.
    """

    def __init__(
        self,
        output_dir: str,
        exam_id: str,
        fps: int = 30,
        resolution: Tuple[int, int] = (1280, 720)
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.exam_id = exam_id
        self.fps = fps
        self.width, self.height = resolution

        self.filename_base = f"exam_{self.exam_id}_session"
        self.raw_path = self.output_dir / f"{self.filename_base}.raw.mp4"
        self.final_path = self.output_dir / f"{self.filename_base}.mp4"

        self.frame_queue: queue.Queue = queue.Queue(maxsize=180)  # ~6 seconds buffer
        self.writer: Optional[cv2.VideoWriter] = None
        self.is_recording = False
        self.worker_thread: Optional[threading.Thread] = None

        self.frames_written = 0
        self.frames_dropped = 0
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None

    def start(self) -> bool:
        """Start background video writer thread."""
        if self.is_recording:
            return True

        try:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.writer = cv2.VideoWriter(
                str(self.raw_path),
                fourcc,
                float(self.fps),
                (self.width, self.height)
            )
            if not self.writer.isOpened():
                logger.error(f"Failed to open VideoWriter for session at {self.raw_path}")
                return False

            self.is_recording = True
            self.start_time = time.time()
            self.frames_written = 0
            self.frames_dropped = 0

            self.worker_thread = threading.Thread(
                target=self._writer_loop,
                name=f"SessionRecorder-{self.exam_id[:8]}",
                daemon=True
            )
            self.worker_thread.start()
            logger.info(f"Continuous session recording started for exam {self.exam_id} at {self.raw_path}")
            return True

        except Exception as e:
            logger.exception(f"SessionVideoRecorder failed to start: {e}")
            self.is_recording = False
            return False

    def add_frame(self, frame: np.ndarray):
        """Queue a frame for recording (non-blocking)."""
        if not self.is_recording:
            return

        try:
            self.frame_queue.put_nowait(frame)
        except queue.Full:
            self.frames_dropped += 1
            if self.frames_dropped % 30 == 0:
                logger.warning(
                    f"Session recorder queue full for exam {self.exam_id}; "
                    f"dropped {self.frames_dropped} frames so far."
                )

    def _writer_loop(self):
        """Worker thread loop consuming frames from queue."""
        while self.is_recording or not self.frame_queue.empty():
            try:
                frame = self.frame_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if frame is None:
                break

            try:
                h, w = frame.shape[:2]
                if w != self.width or h != self.height:
                    frame = cv2.resize(frame, (self.width, self.height), interpolation=cv2.INTER_LINEAR)

                if self.writer is not None:
                    self.writer.write(frame)
                    self.frames_written += 1
            except Exception as e:
                logger.error(f"Error writing session frame: {e}")
            finally:
                self.frame_queue.task_done()

    def stop(self) -> Optional[str]:
        """Stop recording, finalize MP4, and remux to browser-playable H.264."""
        if not self.is_recording:
            return str(self.final_path) if self.final_path.exists() else None

        self.is_recording = False
        self.end_time = time.time()

        # Signal worker to terminate
        try:
            self.frame_queue.put_nowait(None)
        except Exception:
            pass

        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=10.0)

        if self.writer:
            self.writer.release()
            self.writer = None

        logger.info(
            f"Session recording stopped for exam {self.exam_id}. "
            f"Wrote {self.frames_written} frames (dropped: {self.frames_dropped})."
        )

        if not self.raw_path.exists() or self.frames_written == 0:
            logger.warning(f"No frames written to session recording {self.raw_path}")
            return None

        # Re-encode raw mp4v to faststart H.264 for HTML5 browser streaming
        if _FFMPEG_EXE:
            try:
                subprocess.run(
                    [
                        _FFMPEG_EXE, "-y",
                        "-i", str(self.raw_path),
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "23",
                        "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart",
                        "-an",
                        "-r", str(self.fps),
                        str(self.final_path)
                    ],
                    check=True,
                    capture_output=True,
                    timeout=120
                )
                try:
                    self.raw_path.unlink()
                except OSError:
                    pass
                logger.info(f"Remuxed session recording to H.264: {self.final_path}")
                return str(self.final_path)
            except Exception as remux_err:
                logger.warning(f"FFmpeg session remux failed ({remux_err}); falling back to raw mp4v")

        # Fallback: rename raw to final
        try:
            if self.raw_path.exists():
                if self.final_path.exists():
                    self.final_path.unlink()
                self.raw_path.rename(self.final_path)
        except Exception as e:
            logger.error(f"Failed to finalize session video file: {e}")
            return str(self.raw_path)

        return str(self.final_path)
