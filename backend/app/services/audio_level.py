"""Microphone level capture (dB) for audio anomaly detection.

A single background thread reads the default input device and keeps the
latest RMS level in dB. Returns None if no mic is available or capture fails.
"""
import threading
import time

import numpy as np

try:
    import sounddevice as sd
    _AVAILABLE = True
except ImportError:
    sd = None
    _AVAILABLE = False

BLOCK_SECONDS = 0.2
SAMPLE_RATE = 16000


class AudioLevelService:
    def __init__(self):
        self._level_db: float | None = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._error = None

    def start(self) -> bool:
        if not _AVAILABLE or sd is None:
            return False
        if self._running:
            return True
        try:
            sd.query_devices(kind="input")
        except Exception as e:
            self._error = e
            return False
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return True

    def _loop(self):
        if sd is None:
            return
        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                blocksize=int(SAMPLE_RATE * BLOCK_SECONDS),
                dtype="float32",
            ) as stream:
                while self._running:
                    data, _ = stream.read(int(SAMPLE_RATE * BLOCK_SECONDS))
                    rms = float(np.sqrt(np.mean(data ** 2)))
                    dbfs = 20.0 * np.log10(rms + 1e-10) if rms > 0 else -100.0
                    # Map digital dBFS (-100 dBFS to 0 dBFS) to positive 0-100 sound level
                    normalized_db = float(np.clip(dbfs + 100.0, 0.0, 100.0))
                    with self._lock:
                        self._level_db = normalized_db
        except Exception:
            with self._lock:
                self._level_db = None
                self._error = True

    def get_level_db(self) -> float | None:
        with self._lock:
            return self._level_db

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None


audio_level_service = AudioLevelService()
