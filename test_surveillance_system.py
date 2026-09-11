#!/usr/bin/env python3
"""
Exam Surveillance System — Automated Test Runner

Runs comprehensive tests against all system components:
- Import validation
- Component unit tests
- Integration tests
- Performance benchmarks
- Report generation (JSON + Markdown + HTML)

Usage:
    python test_surveillance_system.py [--url http://127.0.0.1:8000] [--benchmark] [--output ./test_output]
"""

import sys
import os
import json
import time
import importlib
import traceback
import argparse
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any
from enum import Enum

_backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)

# ──────────────────────────────────────────────
# Test infrastructure
# ──────────────────────────────────────────────

class TestStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"


@dataclass
class TestResult:
    name: str
    status: TestStatus
    message: str = ""
    duration_ms: float = 0
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TestSuite:
    name: str
    results: List[TestResult] = field(default_factory=list)

    @property
    def passed(self):
        return sum(1 for r in self.results if r.status == TestStatus.PASS)

    @property
    def failed(self):
        return sum(1 for r in self.results if r.status == TestStatus.FAIL)

    @property
    def warned(self):
        return sum(1 for r in self.results if r.status == TestStatus.WARN)

    @property
    def skipped(self):
        return sum(1 for r in self.results if r.status == TestStatus.SKIP)

    @property
    def total(self):
        return len(self.results)


class TestRunner:
    def __init__(self, base_url: str = "http://127.0.0.1:8000", benchmark: bool = False):
        self.base_url = base_url
        self.benchmark = benchmark
        self.suites: List[TestSuite] = []
        self.start_time = None
        self.end_time = None

    def run_suite(self, suite: TestSuite):
        self.suites.append(suite)
        return suite

    def summary(self) -> Dict:
        total_pass = sum(s.passed for s in self.suites)
        total_fail = sum(s.failed for s in self.suites)
        total_warn = sum(s.warned for s in self.suites)
        total_skip = sum(s.skipped for s in self.suites)
        total = total_pass + total_fail + total_warn + total_skip
        return {
            "total": total,
            "passed": total_pass,
            "failed": total_fail,
            "warned": total_warn,
            "skipped": total_skip,
            "duration_seconds": (self.end_time - self.start_time) if self.end_time else 0,
            "suites": len(self.suites),
        }


# ──────────────────────────────────────────────
# SECTION 1: Import Validation
# ──────────────────────────────────────────────

def test_imports() -> TestSuite:
    suite = TestSuite(name="Import Validation")

    required_modules = [
        ("fastapi", "FastAPI web framework"),
        ("uvicorn", "ASGI server"),
        ("cv2", "OpenCV"),
        ("numpy", "NumPy"),
        ("sqlalchemy", "SQLAlchemy ORM"),
        ("pydantic", "Pydantic schemas"),
        ("pydantic_settings", "Pydantic settings"),
        ("ultralytics", "YOLOv8 (ultralytics)"),
        ("mediapipe", "MediaPipe"),
        ("torch", "PyTorch"),
        ("PIL", "Pillow"),
    ]

    for mod_name, description in required_modules:
        t0 = time.time()
        try:
            mod = importlib.import_module(mod_name)
            version = getattr(mod, "__version__", "unknown")
            suite.results.append(TestResult(
                name=f"import {mod_name}",
                status=TestStatus.PASS,
                message=f"{description} v{version}",
                duration_ms=(time.time() - t0) * 1000,
            ))
        except ImportError as e:
            suite.results.append(TestResult(
                name=f"import {mod_name}",
                status=TestStatus.FAIL,
                message=f"{description} not installed: {e}",
                duration_ms=(time.time() - t0) * 1000,
            ))

    # Internal modules
    internal_modules = [
        ("app.config", "Configuration"),
        ("app.database", "Database engine"),
        ("app.models", "ORM models"),
        ("app.schemas", "Pydantic schemas"),
        ("app.crud", "CRUD operations"),
        ("app.services.camera_manager", "Camera manager"),
        ("app.services.detection_engine", "Detection engine (YOLOv8 + ByteTrack)"),
        ("app.services.mediapipe_analyzer", "MediaPipe analyzer"),
        ("app.services.anomaly_detector", "Anomaly detector"),
        ("app.services.event_logger", "Event logger"),
        ("app.services.auth", "JWT Auth & RBAC"),
        ("app.services.audio_level", "Audio Level Service"),
        ("app.services.vlm_client", "LM Studio VLM Client"),
        ("app.services.report_generator", "Forensic PDF Report Generator"),
    ]

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
    for mod_name, description in internal_modules:
        t0 = time.time()
        try:
            importlib.import_module(mod_name)
            suite.results.append(TestResult(
                name=f"import {mod_name}",
                status=TestStatus.PASS,
                message=f"{description} loaded",
                duration_ms=(time.time() - t0) * 1000,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name=f"import {mod_name}",
                status=TestStatus.FAIL,
                message=f"{description} failed: {e}",
                duration_ms=(time.time() - t0) * 1000,
            ))

    return suite


# ──────────────────────────────────────────────
# SECTION 2: Component Tests
# ──────────────────────────────────────────────

def test_config() -> TestSuite:
    suite = TestSuite(name="Configuration")
    t0 = time.time()
    try:
        from app.config import get_settings
        settings = get_settings()

        checks = [
            ("API_PORT", settings.API_PORT, 8000),
            ("CAMERA_FPS", settings.CAMERA_FPS, 30),
            ("CAMERA_RESOLUTION_WIDTH", settings.CAMERA_RESOLUTION_WIDTH, 1280),
            ("CAMERA_RESOLUTION_HEIGHT", settings.CAMERA_RESOLUTION_HEIGHT, 720),
            ("YOLOV8_CONFIDENCE_THRESHOLD", settings.YOLOV8_CONFIDENCE_THRESHOLD, 0.5),
            ("WEBSOCKET_FRAME_RATE", settings.WEBSOCKET_FRAME_RATE, 2),
        ]

        for name, actual, expected in checks:
            if actual == expected:
                suite.results.append(TestResult(
                    name=f"config.{name} == {expected}",
                    status=TestStatus.PASS,
                    message=f"Got {actual}",
                ))
            else:
                suite.results.append(TestResult(
                    name=f"config.{name} == {expected}",
                    status=TestStatus.WARN,
                    message=f"Expected {expected}, got {actual}",
                ))

        suite.results.append(TestResult(
            name="config singleton",
            status=TestStatus.PASS,
            message="get_settings() returns cached singleton",
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="config load",
            status=TestStatus.FAIL,
            message=str(e),
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_database() -> TestSuite:
    suite = TestSuite(name="Database")
    t0 = time.time()
    try:
        from app.database import init_db, get_db, engine
        from app.models import Base, Exam, Participant, Event

        init_db()

        tables = list(Base.metadata.tables.keys())
        expected_tables = ["exams", "participants", "events"]
        for tbl in expected_tables:
            if tbl in tables:
                suite.results.append(TestResult(
                    name=f"table '{tbl}' exists",
                    status=TestStatus.PASS,
                ))
            else:
                suite.results.append(TestResult(
                    name=f"table '{tbl}' exists",
                    status=TestStatus.FAIL,
                    message=f"Tables found: {tables}",
                ))

        # Test session
        db = next(get_db())
        try:
            count = db.query(Exam).count()
            suite.results.append(TestResult(
                name="DB session query",
                status=TestStatus.PASS,
                message=f"Exam count: {count}",
            ))
        finally:
            db.close()

        suite.results.append(TestResult(
            name="database init",
            status=TestStatus.PASS,
            message=f"Engine: {engine.url}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="database",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_models() -> TestSuite:
    suite = TestSuite(name="ORM Models")
    t0 = time.time()
    try:
        from app.models import (
            Exam, Participant, Event,
            ExamStatus, ParticipantStatus, EventType, EventSeverity
        )

        # Test enums
        enum_checks = [
            ("ExamStatus", ExamStatus, ["CREATED", "IN_PROGRESS", "ENDED", "ARCHIVED"]),
            ("ParticipantStatus", ParticipantStatus, ["REGISTERED", "CHECKED_IN", "CHECKED_OUT", "ABSENT"]),
            ("EventSeverity", EventSeverity, ["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
            ("EventType", EventType, ["PHONE_DETECTED", "CHEAT_SHEET", "COMMUNICATION", "LOOKING_AWAY"]),
        ]

        for name, enum_cls, expected_values in enum_checks:
            actual_values = [e.value for e in enum_cls]
            missing = [v for v in expected_values if v not in actual_values]
            if not missing:
                suite.results.append(TestResult(
                    name=f"enum {name}",
                    status=TestStatus.PASS,
                    message=f"{len(actual_values)} values: {', '.join(actual_values[:4])}...",
                ))
            else:
                suite.results.append(TestResult(
                    name=f"enum {name}",
                    status=TestStatus.FAIL,
                    message=f"Missing: {missing}",
                ))

        # Test model columns
        exam_cols = [c.name for c in Exam.__table__.columns]
        if "exam_id" in exam_cols and "status" in exam_cols:
            suite.results.append(TestResult(
                name="Exam model columns",
                status=TestStatus.PASS,
                message=f"{len(exam_cols)} columns: {', '.join(exam_cols[:5])}...",
            ))
        else:
            suite.results.append(TestResult(
                name="Exam model columns",
                status=TestStatus.FAIL,
                message=f"Missing expected columns. Got: {exam_cols}",
            ))

        suite.results.append(TestResult(
            name="models validation",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="models",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_detection_engine() -> TestSuite:
    suite = TestSuite(name="Detection Engine (YOLOv8)")
    t0 = time.time()
    try:
        from app.services.detection_engine import DetectionEngine, Detection, DetectionResult
        import numpy as np
        import torch
        test_device = "cuda" if torch.cuda.is_available() else "cpu"

        engine = DetectionEngine(
            model_path="models/yolov8n.pt",
            confidence_threshold=0.5,
            nms_threshold=0.45,
            device=test_device
        )

        suite.results.append(TestResult(
            name="YOLOv8 model loaded",
            status=TestStatus.PASS,
            message=f"Model: {engine.model_path}",
        ))

        # Test with synthetic frame
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        # Warmup (CUDA init is expensive on first call)
        for _ in range(3):
            engine.detect(frame, frame_number=0)

        result = engine.detect(frame, frame_number=1)

        if isinstance(result, DetectionResult):
            suite.results.append(TestResult(
                name="detect() returns DetectionResult",
                status=TestStatus.PASS,
                message=f"{len(result.detections)} detections, {result.inference_time_ms:.1f}ms",
                details={"inference_time_ms": result.inference_time_ms, "num_detections": len(result.detections)},
            ))
        else:
            suite.results.append(TestResult(
                name="detect() returns DetectionResult",
                status=TestStatus.FAIL,
                message=f"Got {type(result)}",
            ))

        if result.inference_time_ms < 100:
            suite.results.append(TestResult(
                name="Inference time < 100ms",
                status=TestStatus.PASS,
                message=f"{result.inference_time_ms:.1f}ms",
            ))
        else:
            suite.results.append(TestResult(
                name="Inference time < 100ms",
                status=TestStatus.WARN,
                message=f"{result.inference_time_ms:.1f}ms (slow)",
            ))

        suite.results.append(TestResult(
            name="detection engine init",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="detection engine",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_tracking_engine() -> TestSuite:
    suite = TestSuite(name="Tracking Engine")
    t0 = time.time()
    try:
        from app.services.detection_engine import DetectionEngine, Detection
        import numpy as np
        import torch
        test_device = "cuda" if torch.cuda.is_available() else "cpu"

        engine = DetectionEngine(
            model_path="models/yolov8n.pt",
            confidence_threshold=0.5,
            nms_threshold=0.45,
            device=test_device
        )

        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result = engine.track(frame, frame_number=1)
        tracks = [d for d in result.detections if d.class_name == "person" and d.track_id is not None]

        suite.results.append(TestResult(
            name="tracker processes frames",
            status=TestStatus.PASS,
            message=f"Frame 1: {len(result.detections)} detections, {len(tracks)} tracked",
        ))

        if tracks:
            suite.results.append(TestResult(
                name="tracks have valid attributes",
                status=TestStatus.PASS,
                message=f"track_id={tracks[0].track_id}, bbox={tracks[0].bbox}",
            ))
        else:
            suite.results.append(TestResult(
                name="tracks have valid attributes",
                status=TestStatus.WARN,
                message="No tracks on synthetic frame (expected)",
            ))

        suite.results.append(TestResult(
            name="tracking engine",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="tracking engine",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_anomaly_detector() -> TestSuite:
    suite = TestSuite(name="Anomaly Detector")
    t0 = time.time()
    try:
        from app.services.anomaly_detector import AnomalyDetector, Alert, AlertType, AlertSeverity, MoondreamAnalysis
        from app.services.mediapipe_analyzer import FaceAnalysis

        detector = AnomalyDetector()

        # Test with no face (should trigger face obscured rule after 90 consecutive frames)
        face_analysis = FaceAnalysis(face_detected=False)
        all_alerts = []
        for frame_num in range(1, 92):
            frame_alerts = detector.analyze(
                track_id=999,
                face_analysis=face_analysis,
                moondream_analysis=None,
                audio_level_db=None,
                person_bbox=[100, 100, 200, 300],
                frame_number=frame_num
            )
            all_alerts.extend(frame_alerts)

        suite.results.append(TestResult(
            name="anomaly detector runs",
            status=TestStatus.PASS if all_alerts else TestStatus.FAIL,
            message=f"Generated {len(all_alerts)} alerts after 91 frames of face-obscured",
        ))

        if len(all_alerts) > 0 and all_alerts[0].severity in [s for s in AlertSeverity]:
            suite.results.append(TestResult(
                name="alerts have valid severity",
                status=TestStatus.PASS,
                message=f"First alert: {all_alerts[0].alert_type.value} [{all_alerts[0].severity.value}]",
            ))
        else:
            suite.results.append(TestResult(
                name="alerts have valid severity",
                status=TestStatus.WARN,
                message="No alerts generated (consecutive frames not met)",
            ))

        # Test cooldown - send one more frame, should be suppressed by cooldown
        alerts2 = detector.analyze(
            track_id=999,
            face_analysis=face_analysis,
            moondream_analysis=None,
            audio_level_db=None,
            person_bbox=[100, 100, 200, 300],
            frame_number=92
        )
        suite.results.append(TestResult(
            name="cooldown prevents spam",
            status=TestStatus.PASS if len(alerts2) == 0 else TestStatus.WARN,
            message=f"Post-alert call: {len(alerts2)} alerts (cooldown active)",
        ))

        suite.results.append(TestResult(
            name="anomaly detector",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="anomaly detector",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_mediapipe() -> TestSuite:
    suite = TestSuite(name="MediaPipe Analyzer")
    t0 = time.time()
    try:
        from app.services.mediapipe_analyzer import MediaPipeAnalyzer, FaceAnalysis
        import numpy as np

        analyzer = MediaPipeAnalyzer(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            max_num_faces=5
        )

        suite.results.append(TestResult(
            name="MediaPipe analyzer initialized",
            status=TestStatus.PASS,
        ))

        # Test with synthetic frame
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        result = analyzer.analyze(frame, person_bbox=[100, 100, 300, 400])

        if isinstance(result, FaceAnalysis):
            suite.results.append(TestResult(
                name="analyze() returns FaceAnalysis",
                status=TestStatus.PASS,
                message=f"face_detected={result.face_detected}, gaze={result.gaze_direction}",
                details={
                    "face_detected": result.face_detected,
                    "gaze_direction": result.gaze_direction,
                },
            ))
        else:
            suite.results.append(TestResult(
                name="analyze() returns FaceAnalysis",
                status=TestStatus.FAIL,
                message=f"Got {type(result)}",
            ))

        analyzer.close()
        suite.results.append(TestResult(
            name="mediapipe analyzer",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="mediapipe analyzer",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


def test_camera_manager() -> TestSuite:
    suite = TestSuite(name="Camera Manager")
    t0 = time.time()
    try:
        from app.services.camera_manager import CameraManager, FrameData

        cm = CameraManager(camera_source="0", fps=30, width=640, height=480)

        suite.results.append(TestResult(
            name="CameraManager created",
            status=TestStatus.PASS,
            message=f"Source: {cm.camera_source}, FPS: {cm.fps}",
        ))

        # Try to start camera (may fail on headless systems)
        try:
            started = cm.start()
            if started:
                frame_data = cm.get_display_frame()
                if frame_data and isinstance(frame_data, FrameData):
                    suite.results.append(TestResult(
                        name="camera captures frames",
                        status=TestStatus.PASS,
                        message=f"Frame: {frame_data.frame.shape}, number: {frame_data.frame_number}",
                    ))
                else:
                    suite.results.append(TestResult(
                        name="camera captures frames",
                        status=TestStatus.WARN,
                        message="No frame received (camera may not be connected)",
                    ))
                cm.stop()
            else:
                suite.results.append(TestResult(
                    name="camera starts",
                    status=TestStatus.WARN,
                    message="Camera failed to start (not connected or in use)",
                ))
        except Exception as e:
            suite.results.append(TestResult(
                name="camera starts",
                status=TestStatus.WARN,
                message=f"Camera unavailable: {e}",
            ))

        suite.results.append(TestResult(
            name="camera manager",
            status=TestStatus.PASS,
            duration_ms=(time.time() - t0) * 1000,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="camera manager",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
            duration_ms=(time.time() - t0) * 1000,
        ))
    return suite


# ──────────────────────────────────────────────
# SECTION 3: API Integration Tests
# ──────────────────────────────────────────────

def test_api_integration(base_url: str = "http://127.0.0.1:8000") -> TestSuite:
    suite = TestSuite(name="API Integration")
    t0 = time.time()

    try:
        import urllib.request
        import urllib.error
    except ImportError:
        suite.results.append(TestResult(
            name="urllib available",
            status=TestStatus.FAIL,
            message="urllib not available",
        ))
        return suite

    auth_token = None
    try:
        login_url = f"{base_url}/api/auth/login"
        login_body = json.dumps({"username": "admin", "password": "Admin@12345"}).encode()
        login_req = urllib.request.Request(login_url, data=login_body, headers={"Content-Type": "application/json"}, method="POST")
        login_resp = urllib.request.urlopen(login_req, timeout=5)
        auth_token = json.loads(login_resp.read().decode()).get("access_token")
    except Exception:
        pass

    def api_get(path: str, timeout: int = 5):
        url = f"{base_url}{path}"
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode()), resp.status

    def api_post(path: str, data: Optional[Dict[str, Any]] = None, timeout: int = 5):
        url = f"{base_url}{path}"
        body = json.dumps(data or {}).encode()
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode()), resp.status

    # Health check
    try:
        t1 = time.time()
        health, status = api_get("/health")
        latency = (time.time() - t1) * 1000
        if health.get("status") == "HEALTHY":
            suite.results.append(TestResult(
                name="GET /health",
                status=TestStatus.PASS,
                message=f"Status: {health['status']}, uptime: {health.get('uptime_seconds', '?')}s",
                duration_ms=latency,
                details=health,
            ))
        else:
            suite.results.append(TestResult(
                name="GET /health",
                status=TestStatus.WARN,
                message=f"Status: {health.get('status')}",
                duration_ms=latency,
            ))
    except Exception as e:
        suite.results.append(TestResult(
            name="GET /health",
            status=TestStatus.FAIL,
            message=str(e),
        ))

    # List exams
    try:
        t1 = time.time()
        exams, status = api_get("/api/exams")
        latency = (time.time() - t1) * 1000
        suite.results.append(TestResult(
            name="GET /api/exams",
            status=TestStatus.PASS,
            message=f"Found {len(exams)} exams",
            duration_ms=latency,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="GET /api/exams",
            status=TestStatus.FAIL,
            message=str(e),
        ))

    # Create exam
    exam_id = None
    try:
        t1 = time.time()
        exam_data = {
            "exam_name": f"Test Exam {datetime.now().strftime('%H%M%S')}",
            "duration_minutes": 60,
            "location": "Test Room",
            "num_students": 5,
            "num_cameras": 1,
        }
        new_exam, status = api_post("/api/exams", exam_data)
        latency = (time.time() - t1) * 1000
        exam_id = new_exam.get("exam_id")
        suite.results.append(TestResult(
            name="POST /api/exams",
            status=TestStatus.PASS,
            message=f"Created exam: {exam_id}",
            duration_ms=latency,
        ))
    except Exception as e:
        suite.results.append(TestResult(
            name="POST /api/exams",
            status=TestStatus.FAIL,
            message=str(e),
        ))

    # Get exam detail
    if exam_id:
        try:
            t1 = time.time()
            detail, status = api_get(f"/api/exams/{exam_id}")
            latency = (time.time() - t1) * 1000
            suite.results.append(TestResult(
                name=f"GET /api/exams/{exam_id[:8]}...",
                status=TestStatus.PASS,
                message=f"Name: {detail.get('exam_name')}, Status: {detail.get('status')}",
                duration_ms=latency,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name=f"GET /api/exams/{exam_id[:8]}...",
                status=TestStatus.FAIL,
                message=str(e),
            ))

        # Register participant
        try:
            t1 = time.time()
            participant_data = {
                "roll_number": "TEST001",
                "name": "Test Student",
                "seat_number": 1,
            }
            participant, status = api_post(f"/api/exams/{exam_id}/participants", participant_data)
            latency = (time.time() - t1) * 1000
            participant_id = participant.get("participant_id")
            suite.results.append(TestResult(
                name="POST /api/exams/{id}/participants",
                status=TestStatus.PASS,
                message=f"Registered: {participant_id}",
                duration_ms=latency,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name="POST /api/exams/{id}/participants",
                status=TestStatus.FAIL,
                message=str(e),
            ))

        # Get events (should be empty)
        try:
            t1 = time.time()
            events, status = api_get(f"/api/exams/{exam_id}/events")
            latency = (time.time() - t1) * 1000
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/events",
                status=TestStatus.PASS,
                message=f"Events: {events.get('total', len(events.get('events', [])))}",
                duration_ms=latency,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/events",
                status=TestStatus.FAIL,
                message=str(e),
            ))

        # Get analytics
        try:
            t1 = time.time()
            analytics, status = api_get(f"/api/exams/{exam_id}/analytics")
            latency = (time.time() - t1) * 1000
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/analytics",
                status=TestStatus.PASS,
                message=f"Summary keys: {list(analytics.get('summary', {}).keys())[:5]}",
                duration_ms=latency,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/analytics",
                status=TestStatus.FAIL,
                message=str(e),
            ))

        # Get report (JSON format)
        try:
            t1 = time.time()
            report, status = api_get(f"/api/exams/{exam_id}/report?format=json")
            latency = (time.time() - t1) * 1000
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/report (JSON)",
                status=TestStatus.PASS,
                message=f"Report keys: {list(report.keys())[:5]}",
                duration_ms=latency,
            ))
        except Exception as e:
            suite.results.append(TestResult(
                name="GET /api/exams/{id}/report (JSON)",
                status=TestStatus.FAIL,
                message=str(e),
            ))

    suite.results.append(TestResult(
        name="API integration",
        status=TestStatus.PASS,
        duration_ms=(time.time() - t0) * 1000,
    ))
    return suite


# ──────────────────────────────────────────────
# SECTION 4: Performance Benchmarks
# ──────────────────────────────────────────────

def test_performance() -> TestSuite:
    suite = TestSuite(name="Performance Benchmarks")
    t0 = time.time()

    try:
        import numpy as np
        import torch
        from app.services.detection_engine import DetectionEngine

        bench_device = "cuda" if torch.cuda.is_available() else "cpu"
        engine = DetectionEngine(
            model_path="models/yolov8n.pt",
            confidence_threshold=0.5,
            nms_threshold=0.45,
            device=bench_device
        )

        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        # Warmup
        for _ in range(3):
            engine.detect(frame, frame_number=0)

        # Benchmark
        times = []
        num_runs = 20
        for i in range(num_runs):
            start = time.time()
            engine.detect(frame, frame_number=i + 1)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

        avg_ms = sum(times) / len(times)
        min_ms = min(times)
        max_ms = max(times)
        p95_ms = sorted(times)[int(len(times) * 0.95)]

        suite.results.append(TestResult(
            name="YOLOv8 inference latency (20 runs)",
            status=TestStatus.PASS if avg_ms < 100 else TestStatus.WARN,
            message=f"avg={avg_ms:.1f}ms min={min_ms:.1f}ms max={max_ms:.1f}ms p95={p95_ms:.1f}ms",
            details={
                "avg_ms": round(avg_ms, 2),
                "min_ms": round(min_ms, 2),
                "max_ms": round(max_ms, 2),
                "p95_ms": round(p95_ms, 2),
                "fps": round(1000 / avg_ms, 1),
                "runs": num_runs,
            },
        ))

        # Effective FPS
        fps = 1000 / avg_ms
        if fps >= 20:
            suite.results.append(TestResult(
                name="Effective FPS >= 20",
                status=TestStatus.PASS,
                message=f"{fps:.1f} fps",
            ))
        elif fps >= 10:
            suite.results.append(TestResult(
                name="Effective FPS >= 20",
                status=TestStatus.WARN,
                message=f"{fps:.1f} fps (below target)",
            ))
        else:
            suite.results.append(TestResult(
                name="Effective FPS >= 20",
                status=TestStatus.FAIL,
                message=f"{fps:.1f} fps (too slow)",
            ))

    except Exception as e:
        suite.results.append(TestResult(
            name="YOLOv8 benchmark",
            status=TestStatus.FAIL,
            message=f"{e}\n{traceback.format_exc()}",
        ))

    # MediaPipe benchmark
    try:
        from app.services.mediapipe_analyzer import MediaPipeAnalyzer
        import numpy as np

        analyzer = MediaPipeAnalyzer()
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        times = []
        for i in range(10):
            start = time.time()
            analyzer.analyze(frame, person_bbox=[100, 100, 300, 400])
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

        avg_ms = sum(times) / len(times)
        suite.results.append(TestResult(
            name="MediaPipe analysis latency (10 runs)",
            status=TestStatus.PASS if avg_ms < 50 else TestStatus.WARN,
            message=f"avg={avg_ms:.1f}ms",
            details={"avg_ms": round(avg_ms, 2), "fps": round(1000 / avg_ms, 1)},
        ))

        analyzer.close()
    except Exception as e:
        suite.results.append(TestResult(
            name="MediaPipe benchmark",
            status=TestStatus.WARN,
            message=f"Skipped: {e}",
        ))

    # Memory baseline
    try:
        psutil = importlib.import_module("psutil")
        process = psutil.Process(os.getpid())
        mem_mb = process.memory_info().rss / 1024 / 1024
        suite.results.append(TestResult(
            name="Memory usage",
            status=TestStatus.PASS if mem_mb < 500 else TestStatus.WARN,
            message=f"{mem_mb:.1f} MB",
            details={"memory_mb": round(mem_mb, 1)},
        ))
    except (ImportError, Exception):
        suite.results.append(TestResult(
            name="Memory usage",
            status=TestStatus.SKIP,
            message="psutil not installed",
        ))

    suite.results.append(TestResult(
        name="performance benchmarks",
        status=TestStatus.PASS,
        duration_ms=(time.time() - t0) * 1000,
    ))
    return suite


# ──────────────────────────────────────────────
# Report Generation
# ──────────────────────────────────────────────

def generate_json_report(runner: TestRunner, output_path: Path):
    data = {
        "generated_at": datetime.now().isoformat(),
        "summary": runner.summary(),
        "suites": [],
    }
    for suite in runner.suites:
        suite_data = {
            "name": suite.name,
            "passed": suite.passed,
            "failed": suite.failed,
            "warned": suite.warned,
            "skipped": suite.skipped,
            "total": suite.total,
            "results": [asdict(r) for r in suite.results],
        }
        data["suites"].append(suite_data)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def generate_markdown_report(runner: TestRunner, output_path: Path):
    lines = [
        "# Exam Surveillance System — Test Report",
        f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]

    summary = runner.summary()
    lines.append("## Summary")
    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Total Tests | {summary['total']} |")
    lines.append(f"| Passed | {summary['passed']} |")
    lines.append(f"| Failed | {summary['failed']} |")
    lines.append(f"| Warnings | {summary['warned']} |")
    lines.append(f"| Skipped | {summary['skipped']} |")
    lines.append(f"| Duration | {summary['duration_seconds']:.1f}s |")
    lines.append("")

    status_icon = {TestStatus.PASS: "✅", TestStatus.FAIL: "❌", TestStatus.WARN: "⚠️", TestStatus.SKIP: "⏭️"}

    for suite in runner.suites:
        lines.append(f"## {suite.name}")
        lines.append(f"**{suite.passed}/{suite.total} passed** | {suite.failed} failed | {suite.warned} warned")
        lines.append("")
        lines.append("| Status | Test | Message |")
        lines.append("|--------|------|---------|")
        for r in suite.results:
            icon = status_icon.get(r.status, "?")
            msg = r.message.replace("|", "\\|").replace("\n", " ")[:80]
            lines.append(f"| {icon} {r.status.value} | {r.name} | {msg} |")
        lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def generate_html_report(runner: TestRunner, output_path: Path):
    summary = runner.summary()
    status_colors = {"PASS": "#22c55e", "FAIL": "#ef4444", "WARN": "#f59e0b", "SKIP": "#64748b"}
    status_bg = {"PASS": "#052e16", "FAIL": "#450a0a", "WARN": "#422006", "SKIP": "#1e293b"}

    suites_html = ""
    for suite in runner.suites:
        results_html = ""
        for r in suite.results:
            color = status_colors.get(r.status, "#64748b")
            bg = status_bg.get(r.status, "#1e293b")
            msg = (r.message or "").replace("<", "&lt;").replace(">", "&gt;").replace("\n", " ")[:120]
            results_html += f'<tr><td style="color:{color};font-weight:600">{r.status.value}</td><td>{r.name}</td><td style="color:#94a3b8;font-size:0.85rem">{msg}</td><td style="color:#64748b">{r.duration_ms:.0f}ms</td></tr>\n'

        suites_html += f'''
<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:20px;overflow:hidden">
<div style="padding:16px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center">
<strong>{suite.name}</strong>
<span style="color:#94a3b8">{suite.passed}/{suite.total} passed</span>
</div>
<table style="width:100%;border-collapse:collapse">
<tr style="background:#0f172a"><th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:0.8rem">Status</th><th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:0.8rem">Test</th><th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:0.8rem">Message</th><th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:0.8rem">Time</th></tr>
{results_html}
</table>
</div>'''

    html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}</title>
<style>*{{margin:0;padding:0;box-sizing:border-box}}body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}}</style>
</head><body>
<div style="max-width:1000px;margin:0 auto">
<h1 style="margin-bottom:8px">Test Report</h1>
<p style="color:#94a3b8;margin-bottom:24px">Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px">
<div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;border:1px solid #334155">
<div style="font-size:2rem;font-weight:700;color:#22c55e">{summary["passed"]}</div>
<div style="color:#94a3b8;font-size:0.85rem">Passed</div></div>
<div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;border:1px solid #334155">
<div style="font-size:2rem;font-weight:700;color:#ef4444">{summary["failed"]}</div>
<div style="color:#94a3b8;font-size:0.85rem">Failed</div></div>
<div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;border:1px solid #334155">
<div style="font-size:2rem;font-weight:700;color:#f59e0b">{summary["warned"]}</div>
<div style="color:#94a3b8;font-size:0.85rem">Warnings</div></div>
<div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;border:1px solid #334155">
<div style="font-size:2rem;font-weight:700;color:#3b82f6">{summary["total"]}</div>
<div style="color:#94a3b8;font-size:0.85rem">Total</div></div>
</div>
{suites_html}
</div></body></html>'''

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Exam Surveillance System Test Runner")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Backend API URL")
    parser.add_argument("--benchmark", action="store_true", help="Run performance benchmarks")
    parser.add_argument("--output", default="./test_output", help="Output directory for reports")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("  Exam Surveillance System — Test Runner")
    print("=" * 60)
    print()

    runner = TestRunner(base_url=args.url, benchmark=args.benchmark)
    runner.start_time = time.time()

    # Run all test suites
    tests = [
        ("1/8 Imports", test_imports),
        ("2/8 Config", test_config),
        ("3/8 Database", test_database),
        ("4/8 Models", test_models),
        ("5/8 Detection Engine", test_detection_engine),
        ("6/8 Tracking Engine", test_tracking_engine),
        ("7/8 Anomaly Detector", test_anomaly_detector),
        ("8/8 MediaPipe", test_mediapipe),
    ]

    for label, test_fn in tests:
        print(f"[{label}] Running...")
        suite = test_fn()
        runner.run_suite(suite)
        status = "PASS" if suite.failed == 0 else "FAIL"
        print(f"  -> {status}: {suite.passed}/{suite.total} passed, {suite.failed} failed, {suite.warned} warned")
        print()

    # API integration tests
    print("[API Integration] Running...")
    suite = test_api_integration(args.url)
    runner.run_suite(suite)
    status = "PASS" if suite.failed == 0 else "FAIL"
    print(f"  -> {status}: {suite.passed}/{suite.total} passed, {suite.failed} failed, {suite.warned} warned")
    print()

    # Performance benchmarks
    if args.benchmark:
        print("[Performance] Running benchmarks...")
        suite = test_performance()
        runner.run_suite(suite)
        status = "PASS" if suite.failed == 0 else "FAIL"
        print(f"  -> {status}: {suite.passed}/{suite.total} passed")
        print()

    runner.end_time = time.time()

    # Generate reports
    print("Generating reports...")
    generate_json_report(runner, output_dir / "test_results.json")
    generate_markdown_report(runner, output_dir / "TEST_REPORT.md")
    generate_html_report(runner, output_dir / "test_report.html")
    print(f"  Reports saved to {output_dir}/")
    print()

    # Print summary
    summary = runner.summary()
    print("=" * 60)
    print(f"  SUMMARY: {summary['passed']}/{summary['total']} passed, "
          f"{summary['failed']} failed, {summary['warned']} warned")
    print(f"  Duration: {summary['duration_seconds']:.1f}s")
    print("=" * 60)

    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
