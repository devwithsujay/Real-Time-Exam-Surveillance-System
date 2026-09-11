# Exam Surveillance System — Test Report

Generated: 2026-09-06 11:52:03

## Summary
| Metric | Value |
|--------|-------|
| Total Tests | 66 |
| Passed | 65 |
| Failed | 0 |
| Warnings | 1 |
| Skipped | 0 |
| Duration | 8.9s |

## Import Validation
**25/25 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | import fastapi | FastAPI web framework v0.135.1 |
| ✅ PASS | import uvicorn | ASGI server v0.42.0 |
| ✅ PASS | import cv2 | OpenCV v5.0.0 |
| ✅ PASS | import numpy | NumPy v2.5.1 |
| ✅ PASS | import sqlalchemy | SQLAlchemy ORM v2.0.49 |
| ✅ PASS | import pydantic | Pydantic schemas v2.12.5 |
| ✅ PASS | import pydantic_settings | Pydantic settings v2.13.1 |
| ✅ PASS | import ultralytics | YOLOv8 (ultralytics) v8.4.46 |
| ✅ PASS | import mediapipe | MediaPipe v0.10.35 |
| ✅ PASS | import torch | PyTorch v2.11.0+cu128 |
| ✅ PASS | import PIL | Pillow v12.3.0 |
| ✅ PASS | import app.config | Configuration loaded |
| ✅ PASS | import app.database | Database engine loaded |
| ✅ PASS | import app.models | ORM models loaded |
| ✅ PASS | import app.schemas | Pydantic schemas loaded |
| ✅ PASS | import app.crud | CRUD operations loaded |
| ✅ PASS | import app.services.camera_manager | Camera manager loaded |
| ✅ PASS | import app.services.detection_engine | Detection engine (YOLOv8 + ByteTrack) loaded |
| ✅ PASS | import app.services.mediapipe_analyzer | MediaPipe analyzer loaded |
| ✅ PASS | import app.services.anomaly_detector | Anomaly detector loaded |
| ✅ PASS | import app.services.event_logger | Event logger loaded |
| ✅ PASS | import app.services.auth | JWT Auth & RBAC loaded |
| ✅ PASS | import app.services.audio_level | Audio Level Service loaded |
| ✅ PASS | import app.services.vlm_client | LM Studio VLM Client loaded |
| ✅ PASS | import app.services.report_generator | Forensic PDF Report Generator loaded |

## Configuration
**7/7 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | config.API_PORT == 8000 | Got 8000 |
| ✅ PASS | config.CAMERA_FPS == 30 | Got 30 |
| ✅ PASS | config.CAMERA_RESOLUTION_WIDTH == 1280 | Got 1280 |
| ✅ PASS | config.CAMERA_RESOLUTION_HEIGHT == 720 | Got 720 |
| ✅ PASS | config.YOLOV8_CONFIDENCE_THRESHOLD == 0.5 | Got 0.5 |
| ✅ PASS | config.WEBSOCKET_FRAME_RATE == 2 | Got 2 |
| ✅ PASS | config singleton | get_settings() returns cached singleton |

## Database
**5/5 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | table 'exams' exists |  |
| ✅ PASS | table 'participants' exists |  |
| ✅ PASS | table 'events' exists |  |
| ✅ PASS | DB session query | Exam count: 42 |
| ✅ PASS | database init | Engine: sqlite:///C:/Users/sujay/Downloads/Real Time ESS/data/exam_surveillance. |

## ORM Models
**6/6 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | enum ExamStatus | 4 values: CREATED, IN_PROGRESS, ENDED, ARCHIVED... |
| ✅ PASS | enum ParticipantStatus | 4 values: REGISTERED, CHECKED_IN, CHECKED_OUT, ABSENT... |
| ✅ PASS | enum EventSeverity | 4 values: LOW, MEDIUM, HIGH, CRITICAL... |
| ✅ PASS | enum EventType | 11 values: PHONE_DETECTED, CHEAT_SHEET, COMMUNICATION, LOOKING_AWAY... |
| ✅ PASS | Exam model columns | 13 columns: exam_id, exam_name, start_time, end_time, duration_minutes... |
| ✅ PASS | models validation |  |

## Detection Engine (YOLOv8)
**4/4 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | YOLOv8 model loaded | Model: models/yolov8n.pt |
| ✅ PASS | detect() returns DetectionResult | 0 detections, 8.6ms |
| ✅ PASS | Inference time < 100ms | 8.6ms |
| ✅ PASS | detection engine init |  |

## Tracking Engine
**2/3 passed** | 0 failed | 1 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | tracker processes frames | Frame 1: 0 detections, 0 tracked |
| ⚠️ WARN | tracks have valid attributes | No tracks on synthetic frame (expected) |
| ✅ PASS | tracking engine |  |

## Anomaly Detector
**4/4 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | anomaly detector runs | Generated 1 alerts after 91 frames of face-obscured |
| ✅ PASS | alerts have valid severity | First alert: FACE_OBSCURED [HIGH] |
| ✅ PASS | cooldown prevents spam | Post-alert call: 0 alerts (cooldown active) |
| ✅ PASS | anomaly detector |  |

## MediaPipe Analyzer
**3/3 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | MediaPipe analyzer initialized |  |
| ✅ PASS | analyze() returns FaceAnalysis | face_detected=False, gaze=CENTER |
| ✅ PASS | mediapipe analyzer |  |

## API Integration
**9/9 passed** | 0 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | GET /health | Status: HEALTHY, uptime: 27.6s |
| ✅ PASS | GET /api/exams | Found 42 exams |
| ✅ PASS | POST /api/exams | Created exam: 4bf0ac55-5f2e-49c3-95da-5f528bfdf543 |
| ✅ PASS | GET /api/exams/4bf0ac55... | Name: Test Exam 115203, Status: CREATED |
| ✅ PASS | POST /api/exams/{id}/participants | Registered: 20026ef4-c061-43f0-85e6-379895325b3b |
| ✅ PASS | GET /api/exams/{id}/events | Events: 0 |
| ✅ PASS | GET /api/exams/{id}/analytics | Summary keys: ['total_students', 'checked_in', 'active_tracks', 'total_events',  |
| ✅ PASS | GET /api/exams/{id}/report (JSON) | Report keys: ['exam', 'summary', 'participants'] |
| ✅ PASS | API integration |  |
