# Exam Surveillance System — Test Report

Generated: 2026-09-06 11:34:49

## Summary
| Metric | Value |
|--------|-------|
| Total Tests | 33 |
| Passed | 3 |
| Failed | 30 |
| Warnings | 0 |
| Skipped | 0 |
| Duration | 0.1s |

## Import Validation
**0/22 passed** | 22 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | import fastapi | FastAPI web framework not installed: No module named 'fastapi' |
| ❌ FAIL | import uvicorn | ASGI server not installed: No module named 'uvicorn' |
| ❌ FAIL | import cv2 | OpenCV not installed: No module named 'cv2' |
| ❌ FAIL | import numpy | NumPy not installed: No module named 'numpy' |
| ❌ FAIL | import sqlalchemy | SQLAlchemy ORM not installed: No module named 'sqlalchemy' |
| ❌ FAIL | import pydantic | Pydantic schemas not installed: No module named 'pydantic' |
| ❌ FAIL | import pydantic_settings | Pydantic settings not installed: No module named 'pydantic_settings' |
| ❌ FAIL | import ultralytics | YOLOv8 (ultralytics) not installed: No module named 'ultralytics' |
| ❌ FAIL | import mediapipe | MediaPipe not installed: No module named 'mediapipe' |
| ❌ FAIL | import torch | PyTorch not installed: No module named 'torch' |
| ❌ FAIL | import PIL | Pillow not installed: No module named 'PIL' |
| ❌ FAIL | import app.config | Configuration failed: No module named 'pydantic_settings' |
| ❌ FAIL | import app.database | Database engine failed: No module named 'sqlalchemy' |
| ❌ FAIL | import app.models | ORM models failed: No module named 'sqlalchemy' |
| ❌ FAIL | import app.schemas | Pydantic schemas failed: No module named 'pydantic' |
| ❌ FAIL | import app.crud | CRUD operations failed: No module named 'sqlalchemy' |
| ❌ FAIL | import app.services.camera_manager | Camera manager failed: No module named 'cv2' |
| ❌ FAIL | import app.services.detection_engine | Detection engine failed: No module named 'cv2' |
| ❌ FAIL | import app.services.tracking_engine | Tracking engine failed: No module named 'app.services.tracking_engine' |
| ❌ FAIL | import app.services.mediapipe_analyzer | MediaPipe analyzer failed: No module named 'cv2' |
| ❌ FAIL | import app.services.anomaly_detector | Anomaly detector failed: No module named 'cv2' |
| ❌ FAIL | import app.services.event_logger | Event logger failed: No module named 'cv2' |

## Configuration
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | config load | No module named 'pydantic_settings' |

## Database
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | database | No module named 'sqlalchemy' Traceback (most recent call last):   File "C:\Users |

## ORM Models
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | models | No module named 'sqlalchemy' Traceback (most recent call last):   File "C:\Users |

## Detection Engine (YOLOv8)
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | detection engine | No module named 'cv2' Traceback (most recent call last):   File "C:\Users\sujay\ |

## Tracking Engine
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | tracking engine | No module named 'cv2' Traceback (most recent call last):   File "C:\Users\sujay\ |

## Anomaly Detector
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | anomaly detector | No module named 'cv2' Traceback (most recent call last):   File "C:\Users\sujay\ |

## MediaPipe Analyzer
**0/1 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ❌ FAIL | mediapipe analyzer | No module named 'cv2' Traceback (most recent call last):   File "C:\Users\sujay\ |

## API Integration
**3/4 passed** | 1 failed | 0 warned

| Status | Test | Message |
|--------|------|---------|
| ✅ PASS | GET /health | Status: HEALTHY, uptime: 785.0s |
| ✅ PASS | GET /api/exams | Found 40 exams |
| ❌ FAIL | POST /api/exams | HTTP Error 401: Unauthorized |
| ✅ PASS | API integration |  |
