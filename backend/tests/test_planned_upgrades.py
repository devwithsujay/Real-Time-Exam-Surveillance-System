import os
import sys
import numpy as np
import pytest

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import get_settings
from app.database import init_db, get_db_session
from app.models import Event, EventType, EventSeverity, AnomalyStatus, Exam, ExamStatus
from app.crud import create_event, update_event_status, get_events, get_events_count
from app.services.event_logger import VideoClipWriter
from app.services.audio_level import audio_level_service
from app.services.mediapipe_analyzer import MediaPipeAnalyzer, FaceAnalysis
from app.services.vlm_client import LMStudioVLM, UnifiedVLMClient, get_vlm_client
from datetime import datetime, timezone
import uuid


def test_phase1_anomaly_state_machine():
    init_db()
    db = get_db_session()
    try:
        # Verify AnomalyStatus Enum
        assert AnomalyStatus.PRELIMINARY.value == "PRELIMINARY"
        assert AnomalyStatus.AI_CONFIRMED.value == "AI_CONFIRMED"
        assert AnomalyStatus.AI_CLEARED.value == "AI_CLEARED"
        assert AnomalyStatus.NEEDS_REVIEW.value == "NEEDS_REVIEW"
        assert AnomalyStatus.HUMAN_RESOLVED.value == "HUMAN_RESOLVED"

        # Create dummy exam
        test_exam_id = str(uuid.uuid4())
        exam = Exam(
            exam_id=test_exam_id,
            exam_name="Test Anomaly Exam",
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            duration_minutes=60,
            status=ExamStatus.IN_PROGRESS
        )
        db.add(exam)
        db.commit()

        # 1. Create Event with default PRELIMINARY status
        event = create_event(
            db=db,
            exam_id=test_exam_id,
            track_id=1,
            participant_id=None,
            camera_id=0,
            event_type=EventType.LOOKING_AWAY,
            severity=EventSeverity.MEDIUM,
            timestamp=datetime.now(timezone.utc),
            description="Looking away from monitor",
            confidence=0.85
        )
        assert event.status == AnomalyStatus.PRELIMINARY
        assert event.human_reviewed is False

        # 2. Transition state machine to AI_CONFIRMED
        updated_event = update_event_status(
            db=db,
            event_id=event.event_id,
            status=AnomalyStatus.AI_CONFIRMED,
            reviewer="VLM_Engine",
            review_notes="VLM verified candidate looking sideways"
        )
        assert updated_event.status == AnomalyStatus.AI_CONFIRMED
        assert updated_event.reviewed_by == "VLM_Engine"

        # 3. Transition to HUMAN_RESOLVED
        resolved_event = update_event_status(
            db=db,
            event_id=event.event_id,
            status=AnomalyStatus.HUMAN_RESOLVED,
            reviewer="Proctor John Doe",
            review_notes="Cleared by proctor after discussion"
        )
        assert resolved_event.status == AnomalyStatus.HUMAN_RESOLVED
        assert resolved_event.human_reviewed is True

        # 4. Query events by status filter
        resolved_events = get_events(db, exam_id=test_exam_id, status=[AnomalyStatus.HUMAN_RESOLVED])
        assert len(resolved_events) >= 1
        assert resolved_events[0].event_id == event.event_id

    finally:
        db.close()


def test_phase3_jpeg_ring_buffer(tmp_path):
    settings = get_settings()
    assert settings.BUFFER_DURATION_SECONDS == 45
    assert settings.BUFFER_JPEG_QUALITY == 80
    assert settings.EVENT_CLIP_DURATION_SECONDS == 15.0

    writer = VideoClipWriter(storage_path=str(tmp_path), fps=30)
    assert writer.buffer_size == 45 * 30

    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    dummy_frame[:, :] = [100, 150, 200]

    for _ in range(5):
        writer.add_frame(0, dummy_frame)

    assert 0 in writer.camera_buffers
    assert len(writer.camera_buffers[0]) == 5
    ts, encoded = writer.camera_buffers[0][0]
    assert isinstance(encoded, np.ndarray) or isinstance(encoded, bytes)
    # JPEG size should be a fraction of raw uncompressed bytes
    assert len(encoded) < dummy_frame.nbytes * 0.15


def test_phase4_audio_sampling_config():
    settings = get_settings()
    assert settings.AUDIO_BLOCK_SECONDS == 0.1
    assert settings.AUDIO_SAMPLE_RATE == 16000

    assert audio_level_service.sample_rate == 16000
    assert audio_level_service.block_seconds == 0.1
    assert audio_level_service.block_size == int(16000 * 0.1)


def test_phase5_3d_gaze_angles():
    analyzer = MediaPipeAnalyzer()

    landmarks_2d = np.zeros((478, 2), dtype=np.float64)
    landmarks_3d = np.zeros((478, 3), dtype=np.float64)

    # Left eye: corners 33, 133
    landmarks_2d[33] = [300, 200]
    landmarks_2d[133] = [360, 200]
    landmarks_3d[33] = [300, 200, 0]
    landmarks_3d[133] = [360, 200, 0]

    # Right eye: corners 362, 263
    landmarks_2d[362] = [400, 200]
    landmarks_2d[263] = [460, 200]
    landmarks_3d[362] = [400, 200, 0]
    landmarks_3d[263] = [460, 200, 0]

    # Irises shifted
    for idx in analyzer.LEFT_IRIS_INDICES:
        landmarks_2d[idx] = [345, 200]
        landmarks_3d[idx] = [345, 200, -3]

    for idx in analyzer.RIGHT_IRIS_INDICES:
        landmarks_2d[idx] = [445, 200]
        landmarks_3d[idx] = [445, 200, -3]

    gaze = analyzer._estimate_gaze(landmarks_2d, landmarks_3d, 1280, 720)
    assert "yaw" in gaze
    assert "pitch" in gaze
    assert "gaze_vector_3d" in gaze
    assert isinstance(gaze["yaw"], float)
    assert isinstance(gaze["pitch"], float)

    fa = FaceAnalysis(
        face_detected=True,
        gaze_yaw=gaze["yaw"],
        gaze_pitch=gaze["pitch"],
        gaze_vector_3d=gaze["gaze_vector_3d"],
        landmarks_3d=landmarks_3d.tolist()
    )
    assert fa.gaze_yaw == gaze["yaw"]
    assert fa.gaze_pitch == gaze["pitch"]


def test_phase6_multi_vlm_provider():
    settings = get_settings()
    assert settings.VLM_PROVIDER in ["lmstudio", "ollama"]

    client = LMStudioVLM()
    client.set_provider("ollama")
    assert client.provider == "ollama"
    assert "11434" in client.base_url

    client.set_provider("lmstudio")
    assert client.provider == "lmstudio"

    # Test parser
    sample_json = '{"phone_detected": true, "cheating_detected": false, "talking_detected": false, "earbud_detected": false, "peeking_detected": false, "detected_objects": ["cell phone"], "description": "holding phone", "confidence": 0.9}'
    res = client._parse_response(sample_json, 50.0)
    assert res.phone_detected is True
    assert res.confidence == 0.9
    assert UnifiedVLMClient is LMStudioVLM
    assert get_vlm_client() is not None


def test_continuous_session_recording_and_reanalyze(tmp_path):
    from app.services.session_recorder import SessionVideoRecorder
    import cv2

    init_db()
    db = get_db_session()

    try:
        exam_id = str(uuid.uuid4())
        recorder = SessionVideoRecorder(
            output_dir=str(tmp_path),
            exam_id=exam_id,
            fps=15,
            resolution=(640, 480)
        )

        assert recorder.start() is True
        assert recorder.is_recording is True

        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        dummy_frame[:, :] = [50, 100, 150]

        # Feed 15 frames
        for _ in range(15):
            recorder.add_frame(dummy_frame)

        # Allow worker thread to flush
        import time
        time.sleep(0.3)

        output_path = recorder.stop()
        assert output_path is not None
        assert os.path.isfile(output_path)
        assert os.path.getsize(output_path) > 0

        # Verify video file can be opened and decoded
        cap = cv2.VideoCapture(output_path)
        assert cap.isOpened()
        ret, read_frame = cap.read()
        assert ret is True
        assert read_frame.shape == (480, 640, 3)
        cap.release()

        # Verify Database Exam model recording_path column
        exam = Exam(
            exam_id=exam_id,
            exam_name="Full Recording Exam",
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            duration_minutes=30,
            status=ExamStatus.ENDED,
            recording_path=output_path
        )
        db.add(exam)
        db.commit()

        queried = db.query(Exam).filter(Exam.exam_id == exam_id).first()
        assert queried is not None
        assert queried.recording_path == output_path

    finally:
        db.close()


def test_automated_vlm_prompts_and_surety():
    from app.services.vlm_client import (
        build_instant_surety_prompt, build_forensic_reanalysis_prompt,
        build_custom_query_prompt, LMStudioVLM
    )

    p1 = build_instant_surety_prompt("PHONE_DETECTED", cv_confidence=0.9, bbox={"x": 0.2, "y": 0.3, "w": 0.4, "h": 0.5})
    assert "PHONE_DETECTED" in p1
    assert "quick_reasoning" in p1
    assert "plausible" in p1

    p2 = build_forensic_reanalysis_prompt("CHEAT_SHEET", "Student concealing slip")
    assert "CHEAT_SHEET" in p2
    assert "CONFIRMED_VIOLATION" in p2

    p3 = build_custom_query_prompt("Is the student looking at a book?")
    assert "Is the student looking at a book?" in p3

    # Test parser with surety check JSON
    client = LMStudioVLM()
    test_json = '{"plausible": false, "confidence": 0.95, "visibility": "clear", "quick_reasoning": "Holding black pen, not a phone."}'
    parsed = client._parse_response(test_json, 120.0)
    assert parsed.plausible is False
    assert parsed.phone_detected is False
    assert parsed.quick_reasoning == "Holding black pen, not a phone."

