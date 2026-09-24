from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status, Body, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List, Dict, Any
import os
import shutil
import uuid
from uuid import UUID
from datetime import datetime, timezone
import asyncio
import json
import base64
import logging
import time
import threading

import cv2
import numpy as np

from app.config import get_settings
from app.database import init_db, get_db, engine
from app.models import (
    Base, Exam, Participant, Event, ExamStatus, ParticipantStatus, EventType, EventSeverity,
    User, UserRole, PendingAction, ActionStatus, VideoAudit, VideoAuditIncident, VideoAuditStatus,
    AnomalyStatus
)
from app.schemas import (
    ExamCreate, ExamUpdate, ExamResponse, ExamStartResponse, ExamEndResponse,
    ExamReanalyzeRequest, ExamReanalyzeResponse,
    ParticipantCreate, ParticipantResponse, ParticipantCheckIn, ParticipantCheckInResponse, ParticipantCheckOutResponse,
    EventResponse, EventReviewRequest, EventReviewResponse, EventStatusUpdateRequest, EventStatusUpdateResponse,
    ExamAnalyticsResponse, ParticipantAnalyticsResponse,
    WSMessageType, WSAlertPayload, WSAnalyticsPayload,
    ConfigResponse, ConfigUpdateRequest,
    UserLogin, TokenResponse, UserResponse, UserCreate, UserUpdate,
    PendingActionResponse, PendingActionApproveRequest,
    VideoAuditListItemResponse, VideoAuditDetailResponse, VideoAuditIncidentResponse,
    VideoAuditVLMVerificationResponse
)
from app.services.video_audit_service import VideoAuditService
from app.services.video_audit_report import generate_video_audit_pdf
from app.services.session_recorder import SessionVideoRecorder
from app.crud import (
    utcnow,
    create_exam, get_exam, get_exams, update_exam, start_exam, end_exam, delete_exam,
    create_participant, get_participant, get_participants_by_exam, get_participants_count,
    checkin_participant, checkout_participant, batch_checkin_participants, seed_exam_participants,
    create_event, get_events, get_events_count, get_event, review_event, update_event_status,
    get_exam_analytics, get_participant_analytics,
    create_user, get_user_by_username, get_user_by_email, get_user_by_id, list_users, update_user,
    create_pending_action, get_pending_action, list_pending_actions, resolve_pending_action
)
from app.services.camera_manager import CameraManager
from app.services.audio_level import audio_level_service
from app.services.detection_engine import DetectionEngine
from app.services.event_logger import EventLogger, EventData, get_event_logger
from app.services.report_generator import generate_pdf_report

from app.services.mediapipe_analyzer import MediaPipeAnalyzer
from app.services.anomaly_detector import AnomalyDetector, Alert, AlertType, AlertSeverity, MoondreamAnalysis as AnomalyMoondreamAnalysis
from app.services.vlm_client import (
    LMStudioVLM, get_vlm_client,
    build_instant_surety_prompt, build_forensic_reanalysis_prompt, build_custom_query_prompt
)
from app.services.redis_client import cache_get, cache_set, get_redis, is_available as redis_available, publish
from app.services.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_current_user_optional,
    require_admin, require_auditor_or_admin, require_proctor, require_roles, require_any_authenticated,
    verify_ws_token, check_exam_access
)

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

_start_time = time.time()

camera_manager: Optional[CameraManager] = None
detection_engine: Optional[DetectionEngine] = None

mediapipe_analyzer: Optional[MediaPipeAnalyzer] = None
anomaly_detector: Optional[AnomalyDetector] = None
event_logger: Optional[EventLogger] = None
vlm: Optional[LMStudioVLM] = None
session_recorder: Optional[SessionVideoRecorder] = None
record_session_active: bool = False

pipeline_running = False
pipeline_task: Optional[asyncio.Task] = None
_latest_vlm_result = None
_vlm_in_flight = False
_vlm_alert_times: Dict[int, float] = {}
_track_face_counters: Dict[int, int] = {}
_track_to_participant: Dict[int, str] = {}
current_exam_id: Optional[UUID] = None


def _resolve_participant_id(exam_id: UUID, track_id: int) -> Optional[str]:
    """Resolve or dynamically bind a YOLO track ID to a registered exam participant."""
    global _track_to_participant
    if track_id in _track_to_participant:
        return _track_to_participant[track_id]

    db = next(get_db())
    try:
        # 1. Check if participant is already mapped to this track
        p = db.query(Participant).filter(
            Participant.exam_id == str(exam_id),
            Participant.current_track_id == track_id
        ).first()
        if p:
            if p.status != ParticipantStatus.CHECKED_IN:
                p.status = ParticipantStatus.CHECKED_IN
                if not p.check_in_time:
                    p.check_in_time = utcnow()
                db.commit()
            _track_to_participant[track_id] = str(p.participant_id)
            return str(p.participant_id)

        # 2. Find first unassigned participant (registered or checked-in) to bind
        p = db.query(Participant).filter(
            Participant.exam_id == str(exam_id),
            Participant.current_track_id == None
        ).first()
        if p:
            p.current_track_id = track_id
            p.status = ParticipantStatus.CHECKED_IN
            if not p.check_in_time:
                p.check_in_time = utcnow()
            db.commit()
            _track_to_participant[track_id] = str(p.participant_id)
            return str(p.participant_id)

        # 3. Create a candidate record if none exist
        new_p = Participant(
            participant_id=str(uuid.uuid4()),
            exam_id=str(exam_id),
            roll_number=f"TRK-{track_id:03d}",
            name=f"Candidate #{track_id}",
            seat_number=track_id,
            assigned_camera_id=0,
            status=ParticipantStatus.CHECKED_IN,
            check_in_time=utcnow(),
            current_track_id=track_id,
            risk_score=0.0
        )
        db.add(new_p)
        db.commit()
        db.refresh(new_p)
        _track_to_participant[track_id] = str(new_p.participant_id)
        return str(new_p.participant_id)
    except Exception as e:
        logger.debug(f"Failed to resolve participant for track {track_id}: {e}")
    finally:
        db.close()
    return None


def _bbox_overlap(bbox_a, bbox_b, threshold=0.3):
    """Check if two bounding boxes overlap by at least threshold (IoU or containment)."""
    ax1, ay1, ax2, ay2 = bbox_a
    bx1, by1, bx2, by2 = bbox_b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return False
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    min_area = min(area_a, area_b)
    if min_area <= 0:
        return False
    return (inter / min_area) >= threshold


def _exam_to_response(db_exam: Exam, **kwargs) -> ExamResponse:
    return ExamResponse(
        exam_id=str(db_exam.exam_id),
        exam_name=db_exam.exam_name,
        status=db_exam.status,
        start_time=db_exam.start_time,
        end_time=db_exam.end_time,
        duration_minutes=db_exam.duration_minutes,
        location=db_exam.location,
        num_students=db_exam.num_students,
        num_cameras=db_exam.num_cameras,
        settings=json.loads(db_exam.settings) if db_exam.settings else None,
        recording_path=getattr(db_exam, 'recording_path', None),
        created_at=db_exam.created_at,
        started_at=db_exam.started_at,
        ended_at=db_exam.ended_at,
        **kwargs
    )


def _event_to_response(e: Event) -> EventResponse:
    return EventResponse(
        event_id=str(e.event_id),
        exam_id=str(e.exam_id),
        track_id=e.track_id,
        participant_id=str(e.participant_id) if e.participant_id else None,
        camera_id=e.camera_id,
        event_type=e.event_type,
        severity=e.severity,
        status=e.status or AnomalyStatus.PRELIMINARY,
        timestamp=e.timestamp,
        description=e.description,
        confidence=e.confidence,
        analysis_data=json.loads(e.analysis_data) if e.analysis_data else None,
        evidence_clip_path=e.evidence_clip_path,
        evidence_screenshot_path=e.evidence_screenshot_path,
        human_reviewed=e.human_reviewed,
        review_notes=e.review_notes,
        reviewed_by=e.reviewed_by,
        reviewed_at=e.reviewed_at
    )


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, exam_id: str):
        await websocket.accept()
        if exam_id not in self.active_connections:
            self.active_connections[exam_id] = []
        self.active_connections[exam_id].append(websocket)
        logger.info(f"WebSocket connected for exam {exam_id}")

    def disconnect(self, websocket: WebSocket, exam_id: str):
        if exam_id in self.active_connections:
            if websocket in self.active_connections[exam_id]:
                self.active_connections[exam_id].remove(websocket)
            if not self.active_connections[exam_id]:
                del self.active_connections[exam_id]
        logger.info(f"WebSocket disconnected for exam {exam_id}")

    async def broadcast(self, exam_id: str, message: dict):
        if exam_id in self.active_connections:
            conns = self.active_connections[exam_id]
            dead = []
            async def _send(ws):
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            await asyncio.gather(*[_send(ws) for ws in conns])
            for ws in dead:
                conns.remove(ws)
            if not conns:
                del self.active_connections[exam_id]
        # Bridge to Redis pub/sub for multi-instance fanout
        await publish(f"exam:{exam_id}", message)

    async def broadcast_bytes(self, exam_id: str, data: bytes):
        if exam_id in self.active_connections:
            conns = self.active_connections[exam_id]
            dead = []
            async def _send(ws):
                try:
                    await ws.send_bytes(data)
                except Exception:
                    dead.append(ws)
            await asyncio.gather(*[_send(ws) for ws in conns])
            for ws in dead:
                conns.remove(ws)
            if not conns:
                del self.active_connections[exam_id]


manager = ConnectionManager()

# Shared state for display/analysis pipeline
latest_analyzed_tracks: List[Dict] = []
_tracks_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global camera_manager, detection_engine
    global mediapipe_analyzer, anomaly_detector, event_logger, vlm

    logger.info("Starting Exam Surveillance System...")
    if settings.SECRET_KEY == "dev-secret-key-change-in-production-12345":
        if settings.ENVIRONMENT != "development":
            logger.error("INSECURE CONFIGURATION: SECRET_KEY is using default dev key in non-development environment!")
        else:
            logger.warning("Using default development SECRET_KEY. Configure SECRET_KEY in .env for production.")

    init_db()
    logger.info("Database initialized")

    # Seed initial staff accounts if user table is empty
    db_seed = next(get_db())
    try:
        if db_seed.query(User).count() == 0:
            logger.info("No users found. Seeding default staff accounts...")
            admin_user = User(
                username="admin",
                email="admin@surveillance.local",
                hashed_password=hash_password("Admin@12345"),
                role=UserRole.ADMIN,
                is_active=True
            )
            auditor_user = User(
                username="auditor1",
                email="auditor1@surveillance.local",
                hashed_password=hash_password("Auditor@12345"),
                role=UserRole.AUDITOR,
                is_active=True
            )
            proctor_user = User(
                username="proctor1",
                email="proctor1@surveillance.local",
                hashed_password=hash_password("Proctor@12345"),
                role=UserRole.PROCTOR,
                is_active=True
            )
            db_seed.add_all([admin_user, auditor_user, proctor_user])
            db_seed.commit()
            logger.info("Default staff accounts seeded successfully (admin, auditor1, proctor1 - Passwords: <Role>@12345)")
    except Exception as e:
        logger.error(f"Failed to seed default accounts: {e}")
    finally:
        db_seed.close()

    camera_manager = CameraManager(
        camera_source=str(settings.CAMERA_0_SOURCE),
        fps=settings.CAMERA_FPS,
        width=settings.CAMERA_RESOLUTION_WIDTH,
        height=settings.CAMERA_RESOLUTION_HEIGHT
    )

    detection_engine = DetectionEngine(
        model_path=settings.YOLOV8_MODEL_PATH,
        confidence_threshold=settings.YOLOV8_CONFIDENCE_THRESHOLD,
        nms_threshold=settings.YOLOV8_NMS_THRESHOLD,
        device="cuda" if settings.USE_GPU else "cpu"
    )

    mediapipe_analyzer = MediaPipeAnalyzer(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        max_num_faces=5
    )

    anomaly_detector = AnomalyDetector()
    event_logger = EventLogger()

    vlm_instance = LMStudioVLM()
    await vlm_instance.initialize()
    vlm = vlm_instance

    if settings.ENABLE_AUDIO_ANALYSIS and audio_level_service.start():
        logger.info("Audio level service started")

    logger.info("All services initialized")

    yield

    logger.info("Shutting down...")
    await stop_pipeline()

    if vlm:
        await vlm.shutdown()

    if mediapipe_analyzer:
        mediapipe_analyzer.close()

    if camera_manager:
        camera_manager.stop()

    audio_level_service.stop()


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    app.mount("/static", StaticFiles(directory="frontend/build"), name="static")
except Exception:
    pass


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    if settings.RATE_LIMIT_ENABLED and request.url.path.startswith("/api"):
        ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{ip}:{request.url.path}"
        try:
            r = get_redis()
            count = r.incr(key)
            if count == 1:
                r.expire(key, 60)
            if count > settings.RATE_LIMIT_REQUESTS_PER_MINUTE:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
        except Exception:
            pass  # fail open if Redis is down
    return await call_next(request)


@app.get("/health")
async def health_check():
    db_ok = True
    try:
        db = next(get_db())
        db.execute(func.count(Event.event_id))
        db.close()
    except Exception:
        db_ok = False

    return {
        "status": "HEALTHY" if db_ok else "DEGRADED",
        "timestamp": datetime.now(timezone.utc),
        "version": settings.API_VERSION,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "database": "CONNECTED" if db_ok else "DISCONNECTED",
        "redis": "CONNECTED" if redis_available() else "DISCONNECTED",
        "gpu": "AVAILABLE" if settings.USE_GPU else "CPU_ONLY",
        "components": {
            "camera_manager": "READY" if camera_manager else "NOT_INITIALIZED",
            "detection_engine": "READY" if detection_engine else "NOT_INITIALIZED",
            "mediapipe_analyzer": "READY" if mediapipe_analyzer else "NOT_INITIALIZED",
            "anomaly_detector": "READY" if anomaly_detector else "NOT_INITIALIZED"
        }
    }


@app.get("/health/cameras")
async def camera_status():
    if not camera_manager:
        raise HTTPException(status_code=503, detail="Camera manager not initialized")

    stats = camera_manager.get_status()
    return {
        "timestamp": datetime.now(timezone.utc),
        "cameras": [stats]
    }


# ==============================================================================
# Authentication & Staff Management Endpoints
# ==============================================================================

@app.post("/api/auth/login", response_model=TokenResponse)
async def login_endpoint(login_data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user credentials and return signed JWT access token."""
    user = get_user_by_username(db, login_data.username)
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    token_payload = {
        "sub": user.user_id,
        "username": user.username,
        "role": user.role.value
    }
    access_token = create_access_token(token_payload)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@app.get("/api/auth/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Retrieve identity and active role of currently authenticated user."""
    return UserResponse.model_validate(current_user)


@app.get("/api/auth/users", response_model=List[UserResponse])
async def list_staff_endpoint(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all registered proctor, auditor, and admin accounts (Admin only)."""
    users = list_users(db, skip=skip, limit=limit)
    return [UserResponse.model_validate(u) for u in users]


@app.post("/api/auth/users", response_model=UserResponse, status_code=201)
async def create_staff_endpoint(
    user_data: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Register a new staff member with designated role and scope (Admin only)."""
    if get_user_by_username(db, user_data.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    if get_user_by_email(db, user_data.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(user_data.password)
    new_user = create_user(db, user_data, hashed)
    return UserResponse.model_validate(new_user)


@app.get("/api/auth/pending-actions", response_model=List[PendingActionResponse])
async def list_pending_actions_endpoint(
    status_filter: Optional[ActionStatus] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Retrieve actions queued for two-person verification (Admin only)."""
    actions = list_pending_actions(db, status=status_filter)
    return [PendingActionResponse.model_validate(a) for a in actions]


@app.post("/api/auth/pending-actions/{action_id}/approve", response_model=PendingActionResponse)
async def approve_pending_action_endpoint(
    action_id: str,
    req: PendingActionApproveRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Second-party administrator sign-off under the Two-Person Rule."""
    action = get_pending_action(db, action_id)
    if not action or action.status != ActionStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending action not found or already processed")

    # Enforce two-person separation of duties
    if action.requested_by == current_user.user_id:
        raise HTTPException(
            status_code=400,
            detail="Two-person rule violation: You cannot approve or reject your own queued action."
        )

    resolved = resolve_pending_action(db, action_id, req.approved, current_user.user_id)
    if not resolved:
        raise HTTPException(status_code=500, detail="Failed to resolve action")

    # Execute approved action
    if req.approved:
        if action.action_type == "DELETE_EXAM":
            try:
                delete_exam(db, action.target_id)
                logger.info(f"Exam {action.target_id} deleted following two-person approval by {current_user.username}")
            except Exception as e:
                logger.error(f"Failed to execute approved exam deletion: {e}")

    return PendingActionResponse.model_validate(resolved)


# ==============================================================================
# Configuration Endpoints
# ==============================================================================

@app.get("/api/config", response_model=ConfigResponse)
async def get_runtime_config():
    """Retrieve currently active runtime detection thresholds."""
    available_vlm = []
    current_vlm = vlm.model if vlm else settings.VLM_MODEL
    if vlm:
        available_vlm = await vlm.get_available_models()

    ad = anomaly_detector
    if ad is not None:
        return ConfigResponse(
            audio_threshold_db=float(ad.audio_threshold_db),
            gaze_deviation_frames=int(ad.gaze_deviation_frames),
            gaze_deviation_angle=int(ad.gaze_deviation_angle),
            head_pose_extreme_angle=int(ad.head_pose_extreme),
            posture_bend_threshold=int(ad.posture_bend_threshold),
            frame_skip_ratio=int(settings.FRAME_SKIP_RATIO),
            vlm_enabled=bool(settings.VLM_ENABLED),
            vlm_model=current_vlm,
            available_vlm_models=available_vlm
        )
    return ConfigResponse(
        audio_threshold_db=float(settings.AUDIO_ANOMALY_THRESHOLD_DB),
        gaze_deviation_frames=int(settings.GAZE_DEVIATION_THRESHOLD_FRAMES),
        gaze_deviation_angle=int(settings.GAZE_DEVIATION_ANGLE),
        head_pose_extreme_angle=int(settings.HEAD_POSE_EXTREME_ANGLE),
        posture_bend_threshold=int(settings.POSTURE_BEND_ANGLE_THRESHOLD),
        frame_skip_ratio=int(settings.FRAME_SKIP_RATIO),
        vlm_enabled=bool(settings.VLM_ENABLED),
        vlm_model=current_vlm,
        available_vlm_models=available_vlm
    )


@app.put("/api/config", response_model=ConfigResponse)
async def update_runtime_config(
    req: ConfigUpdateRequest,
    current_user: User = Depends(require_admin)
):
    """Dynamically update detection thresholds without restarting the server (Admin only)."""
    global vlm
    ad = anomaly_detector
    if ad is not None:
        if req.audio_threshold_db is not None:
            ad.audio_threshold_db = req.audio_threshold_db
        if req.gaze_deviation_frames is not None:
            ad.gaze_deviation_frames = req.gaze_deviation_frames
        if req.gaze_deviation_angle is not None:
            ad.gaze_deviation_angle = req.gaze_deviation_angle
        if req.head_pose_extreme_angle is not None:
            ad.head_pose_extreme = req.head_pose_extreme_angle
        if req.posture_bend_threshold is not None:
            ad.posture_bend_threshold = req.posture_bend_threshold

    if req.audio_threshold_db is not None:
        settings.AUDIO_ANOMALY_THRESHOLD_DB = req.audio_threshold_db
    if req.gaze_deviation_frames is not None:
        settings.GAZE_DEVIATION_THRESHOLD_FRAMES = req.gaze_deviation_frames
    if req.gaze_deviation_angle is not None:
        settings.GAZE_DEVIATION_ANGLE = req.gaze_deviation_angle
    if req.head_pose_extreme_angle is not None:
        settings.HEAD_POSE_EXTREME_ANGLE = req.head_pose_extreme_angle
    if req.posture_bend_threshold is not None:
        settings.POSTURE_BEND_ANGLE_THRESHOLD = req.posture_bend_threshold
    if req.frame_skip_ratio is not None:
        settings.FRAME_SKIP_RATIO = max(1, req.frame_skip_ratio)
    if req.vlm_enabled is not None:
        settings.VLM_ENABLED = req.vlm_enabled
    if req.vlm_model is not None:
        settings.VLM_MODEL = req.vlm_model
        if vlm:
            vlm.set_model(req.vlm_model)

    logger.info(f"Runtime configuration updated by admin {current_user.username}: {req.model_dump(exclude_unset=True)}")
    return await get_runtime_config()


@app.get("/api/exams", response_model=List[ExamResponse])
async def list_exams_endpoint(
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    db_exams = get_exams(db, skip=(page-1)*limit, limit=limit)
    return [_exam_to_response(e) for e in db_exams]


@app.post("/api/exams", response_model=ExamResponse, status_code=201)
async def create_exam_endpoint(
    exam: ExamCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    db_exam = create_exam(db, exam)
    return _exam_to_response(db_exam)


@app.get("/api/exams/{exam_id}", response_model=ExamResponse)
async def get_exam_endpoint(exam_id: UUID, db: Session = Depends(get_db)):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    checked_in = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.status == ParticipantStatus.CHECKED_IN
    ).scalar() or 0

    total_events = db.query(func.count(Event.event_id)).filter(Event.exam_id == exam_id).scalar() or 0
    high_events = db.query(func.count(Event.event_id)).filter(
        Event.exam_id == exam_id, Event.severity == EventSeverity.HIGH
    ).scalar() or 0

    return _exam_to_response(
        db_exam,
        checked_in_students=checked_in,
        active_tracks=checked_in,
        total_events=total_events,
        high_severity_events=high_events
    )


@app.put("/api/exams/{exam_id}", response_model=ExamResponse)
async def update_exam_endpoint(
    exam_id: UUID,
    exam: ExamUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    db_exam = update_exam(db, exam_id, exam)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    return _exam_to_response(db_exam)


@app.delete("/api/exams/{exam_id}")
async def delete_exam_endpoint(
    exam_id: UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete exam. In production, queues for two-person administrator sign-off."""
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if settings.REQUIRE_TWO_PERSON_APPROVAL:
        # Check if already queued
        existing = db.query(PendingAction).filter(
            PendingAction.action_type == "DELETE_EXAM",
            PendingAction.target_id == str(exam_id),
            PendingAction.status == ActionStatus.PENDING
        ).first()
        if existing:
            return JSONResponse(
                status_code=202,
                content={
                    "status": "PENDING_APPROVAL",
                    "action_id": str(existing.id),
                    "message": "Exam deletion is already pending approval from another administrator."
                }
            )

        action = create_pending_action(
            db,
            action_type="DELETE_EXAM",
            target_id=str(exam_id),
            payload=json.dumps({"exam_name": db_exam.exam_name}),
            requested_by=current_user.user_id
        )
        return JSONResponse(
            status_code=202,
            content={
                "status": "PENDING_APPROVAL",
                "action_id": str(action.id),
                "message": "Deletion action queued. Requires a second administrator sign-off under Two-Person Rule."
            }
        )

    # Direct deletion if two-person rule is not required (dev mode)
    success = delete_exam(db, exam_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete exam")

    logger.info(f"Exam {exam_id} deleted by admin {current_user.username}")
    return {"status": "SUCCESS", "message": f"Exam {exam_id} deleted successfully."}


@app.post("/api/exams/{exam_id}/start", response_model=ExamStartResponse)
async def start_exam_endpoint(
    exam_id: UUID,
    record_full_session: Optional[bool] = Query(None, description="Toggle whether to record full-length exam video to disk"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    db_exam = start_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=400, detail="Cannot start exam (not in CREATED state or not found)")

    # Flexible toggle: query param takes precedence; otherwise fallback to settings.RECORD_FULL_SESSION
    should_record = settings.RECORD_FULL_SESSION if record_full_session is None else record_full_session

    global pipeline_running, pipeline_task, current_exam_id, _latest_vlm_result, _track_face_counters, _track_to_participant, record_session_active
    record_session_active = should_record
    if not pipeline_running:
        _latest_vlm_result = None
        _track_face_counters.clear()
        _track_to_participant.clear()
        current_exam_id = exam_id
        pipeline_running = True
        pipeline_task = asyncio.create_task(run_pipeline(exam_id, record_full_session=should_record))

    return ExamStartResponse(
        exam_id=str(db_exam.exam_id),
        status=db_exam.status,
        started_at=db_exam.started_at,
        recording_active=should_record,
        camera_status=[{"camera_id": 0, "status": "ACTIVE", "fps": settings.CAMERA_FPS}]
    )


@app.post("/api/exams/{exam_id}/end", response_model=ExamEndResponse)
async def end_exam_endpoint(
    exam_id: UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    final_recording_path = await stop_pipeline()

    db_exam = end_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=400, detail="Cannot end exam (not in progress or not found)")

    if final_recording_path:
        db_exam.recording_path = final_recording_path
        db.commit()

    total_students = get_participants_count(db, exam_id)
    completed = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == str(exam_id),
        Participant.status == ParticipantStatus.CHECKED_OUT
    ).scalar() or 0

    total_events = db.query(func.count(Event.event_id)).filter(Event.exam_id == str(exam_id)).scalar() or 0
    high_events = db.query(func.count(Event.event_id)).filter(
        Event.exam_id == str(exam_id), Event.severity == EventSeverity.HIGH
    ).scalar() or 0

    flagged = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == str(exam_id),
        Participant.risk_score > 70
    ).scalar() or 0

    return ExamEndResponse(
        exam_id=str(db_exam.exam_id),
        status=db_exam.status,
        ended_at=db_exam.ended_at,
        total_duration_minutes=db_exam.duration_minutes,
        recording_path=db_exam.recording_path,
        summary={
            "total_students": total_students,
            "completed": completed,
            "total_events": total_events,
            "high_severity_events": high_events,
            "flagged_students": flagged
        }
    )


@app.get("/api/exams/{exam_id}/recording")
async def get_exam_recording_endpoint(
    exam_id: UUID,
    request: Request,
    download: bool = Query(False, description="True to force download; False to stream in HTML5 player"),
    db: Session = Depends(get_db)
):
    """Download or stream the archived full session recording for an examination."""
    exam = get_exam(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if not exam.recording_path or not os.path.exists(exam.recording_path):
        raise HTTPException(
            status_code=404,
            detail="No continuous session recording found for this exam (recording may have been disabled at start)."
        )

    if download:
        safe_name = (exam.exam_name or "exam").replace(" ", "_")
        return FileResponse(
            exam.recording_path,
            filename=f"exam_{safe_name}_{exam_id}_session.mp4",
            media_type="video/mp4"
        )
    return _stream_video_range(request, exam.recording_path)


@app.post("/api/exams/{exam_id}/reanalyze", response_model=ExamReanalyzeResponse)
async def reanalyze_exam_endpoint(
    exam_id: UUID,
    body: ExamReanalyzeRequest = Body(default=ExamReanalyzeRequest()),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Trigger a full forensic audit scan on the archived continuous exam recording."""
    exam = get_exam(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if not exam.recording_path or not os.path.exists(exam.recording_path):
        raise HTTPException(
            status_code=400,
            detail="Cannot re-analyze: No full session video recording exists for this exam."
        )

    audit_id = str(uuid.uuid4())
    file_size = os.path.getsize(exam.recording_path)
    title = f"Post-Hoc Re-Analysis: {exam.exam_name}"
    filename = os.path.basename(exam.recording_path)

    audit = VideoAudit(
        audit_id=audit_id,
        title=title,
        filename=filename,
        video_path=exam.recording_path,
        file_size_bytes=file_size,
        sample_fps=body.sample_fps,
        status=VideoAuditStatus.PENDING,
        uploaded_by=current_user.user_id,
        exam_id=str(exam_id)
    )
    db.add(audit)
    db.commit()

    # Launch background audit worker
    VideoAuditService.launch_audit(
        audit_id=audit_id,
        video_path=exam.recording_path,
        sample_fps=body.sample_fps
    )

    return ExamReanalyzeResponse(
        status="AUDIT_STARTED",
        audit_id=audit_id,
        exam_id=str(exam_id),
        message=f"Full exam video forensic re-analysis started with audit ID {audit_id}."
    )


@app.post("/api/exams/{exam_id}/participants", response_model=ParticipantResponse, status_code=201)
async def register_participant(
    exam_id: UUID,
    participant: ParticipantCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    db_participant = create_participant(db, exam_id, participant)
    return ParticipantResponse(
        participant_id=str(db_participant.participant_id),
        exam_id=str(db_participant.exam_id),
        roll_number=db_participant.roll_number,
        name=db_participant.name,
        seat_number=db_participant.seat_number,
        assigned_camera_id=db_participant.assigned_camera_id,
        status=db_participant.status,
        check_in_time=db_participant.check_in_time,
        check_out_time=db_participant.check_out_time,
        current_track_id=db_participant.current_track_id,
        risk_score=0.0,
        event_count=0,
        registration_time=db_participant.registration_time
    )


@app.post("/api/exams/{exam_id}/participants/seed")
async def seed_participants_endpoint(
    exam_id: UUID,
    payload: Dict[str, Any] = Body(default={}),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    count = payload.get("count", None)
    added = seed_exam_participants(db, exam_id, count=count)
    return {"status": "success", "added_count": added}


@app.get("/api/exams/{exam_id}/participants", response_model=List[ParticipantResponse])
async def list_participants(exam_id: UUID, page: int = 1, limit: int = 50, db: Session = Depends(get_db)):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    participants = get_participants_by_exam(db, exam_id, skip=(page-1)*limit, limit=limit)

    result = []
    for p in participants:
        event_count = db.query(func.count(Event.event_id)).filter(Event.participant_id == p.participant_id).scalar() or 0
        result.append(ParticipantResponse(
            participant_id=str(p.participant_id),
            exam_id=str(p.exam_id),
            roll_number=p.roll_number,
            name=p.name,
            seat_number=p.seat_number,
            assigned_camera_id=p.assigned_camera_id,
            status=p.status,
            check_in_time=p.check_in_time,
            check_out_time=p.check_out_time,
            current_track_id=p.current_track_id,
            risk_score=p.risk_score or 0.0,
            event_count=event_count,
            registration_time=p.registration_time
        ))

    return result


@app.post("/api/participants/{participant_id}/checkin", response_model=ParticipantCheckInResponse)
async def checkin_participant_endpoint(
    participant_id: UUID,
    checkin: ParticipantCheckIn,
    current_user: User = Depends(require_proctor),
    db: Session = Depends(get_db)
):
    db_participant = checkin_participant(db, participant_id, checkin)
    if not db_participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    return ParticipantCheckInResponse(
        participant_id=str(db_participant.participant_id),
        status=db_participant.status,
        check_in_time=db_participant.check_in_time,
        identity_verified=True,
        verification_confidence=0.95
    )


@app.post("/api/participants/{participant_id}/checkout", response_model=ParticipantCheckOutResponse)
async def checkout_participant_endpoint(
    participant_id: UUID,
    current_user: User = Depends(require_proctor),
    db: Session = Depends(get_db)
):
    db_participant = checkout_participant(db, participant_id)
    if not db_participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    total_events = db.query(func.count(Event.event_id)).filter(Event.participant_id == participant_id).scalar() or 0
    high_events = db.query(func.count(Event.event_id)).filter(
        Event.participant_id == participant_id, Event.severity == EventSeverity.HIGH
    ).scalar() or 0

    exam_duration = 0.0
    if db_participant.check_in_time and db_participant.check_out_time:
        exam_duration = (db_participant.check_out_time - db_participant.check_in_time).total_seconds() / 60

    return ParticipantCheckOutResponse(
        participant_id=str(db_participant.participant_id),
        status=db_participant.status,
        check_out_time=db_participant.check_out_time,
        exam_duration=exam_duration,
        total_events=total_events,
        high_severity_events=high_events
    )


@app.post("/api/exams/{exam_id}/participants/batch-checkin")
async def batch_checkin_endpoint(
    exam_id: UUID,
    current_user: User = Depends(require_proctor),
    db: Session = Depends(get_db)
):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    count = batch_checkin_participants(db, exam_id)
    return {"status": "success", "checked_in_count": count}


@app.get("/api/exams/{exam_id}/events", response_model=Dict[str, Any])
async def get_exam_events(
    exam_id: UUID,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    participant_id: Optional[UUID] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    severity_list = [EventSeverity(s) for s in severity.split(",")] if severity else None
    type_list = [EventType(t) for t in event_type.split(",")] if event_type else None
    status_list = [AnomalyStatus(s) for s in status.split(",")] if status else None

    events = get_events(
        db,
        exam_id=exam_id,
        participant_id=participant_id,
        severity=severity_list,
        event_type=type_list,
        status=status_list,
        start_time=start_time,
        end_time=end_time,
        skip=(page - 1) * limit,
        limit=limit
    )
    total = get_events_count(
        db,
        exam_id=exam_id,
        participant_id=participant_id,
        severity=severity_list,
        event_type=type_list,
        status=status_list
    )

    # Automatically sweep and verify any unresolved PRELIMINARY events for this exam
    asyncio.create_task(sweep_pending_preliminary_events(str(exam_id)))

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "events": [_event_to_response(e) for e in events]
    }


@app.get("/api/participants/{participant_id}/events", response_model=List[EventResponse])
async def get_participant_events(participant_id: UUID, db: Session = Depends(get_db)):
    db_participant = get_participant(db, participant_id)
    if not db_participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    events = get_events(db, participant_id=participant_id)
    return [_event_to_response(e) for e in events]


@app.get("/api/events/{event_id}", response_model=EventResponse)
async def get_event_endpoint(event_id: str, db: Session = Depends(get_db)):
    event = get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    return _event_to_response(event)


@app.put("/api/events/{event_id}/review", response_model=EventReviewResponse)
async def review_event_endpoint(
    event_id: UUID,
    review: EventReviewRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    reviewer_title = f"{current_user.username} ({current_user.role.value})" if current_user else "proctor (invigilator)"
    event = review_event(db, event_id, review, reviewer_title)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    try:
        await broadcast_event(str(event.exam_id), event)
    except Exception as e:
        logger.warning(f"Failed to broadcast review update for event {event_id}: {e}")

    return EventReviewResponse(
        event_id=str(event.event_id),
        human_reviewed=event.human_reviewed,
        review_notes=event.review_notes,
        reviewed_by=event.reviewed_by,
        reviewed_at=event.reviewed_at
    )


@app.patch("/api/events/{event_id}/status", response_model=EventStatusUpdateResponse)
async def update_event_status_endpoint(
    event_id: str,
    body: EventStatusUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Update lifecycle status of an anomaly event (Phase 1 State Machine)."""
    reviewer_title = f"{current_user.username} ({current_user.role.value})" if current_user else "proctor (invigilator)"
    event = update_event_status(
        db=db,
        event_id=event_id,
        status=body.status,
        reviewer=reviewer_title,
        review_notes=body.review_notes,
        severity_override=body.severity_override
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Broadcast updated event state over WebSocket to all connected proctors
    try:
        await broadcast_event(str(event.exam_id), event)
    except Exception as e:
        logger.warning(f"Failed to broadcast status update for event {event_id}: {e}")

    return EventStatusUpdateResponse(
        event_id=str(event.event_id),
        status=event.status,
        review_notes=event.review_notes,
        reviewed_by=event.reviewed_by,
        reviewed_at=event.reviewed_at
    )


@app.post("/api/events/{event_id}/rerun-analysis", response_model=EventResponse)
async def rerun_event_analysis_endpoint(
    event_id: str,
    custom_prompt: Optional[str] = Body(None, embed=True),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    On-demand single-event VLM forensic re-run (Tier 2 / Proctor Trigger).
    Invokes VLM to re-inspect the event keyframe screenshot and updates the status.
    """
    event = get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.evidence_screenshot_path or not os.path.isfile(event.evidence_screenshot_path):
        raise HTTPException(status_code=400, detail="Event evidence screenshot not available on disk")

    vlm = get_vlm_client()
    if not vlm.enabled:
        raise HTTPException(status_code=503, detail="VLM reasoning is disabled in system configuration")

    if custom_prompt:
        prompt = build_custom_query_prompt(custom_prompt)
    else:
        prompt = build_forensic_reanalysis_prompt(
            event_type=getattr(event.event_type, 'value', str(event.event_type)),
            description=event.description or ""
        )

    clarity = check_image_clarity(event.evidence_screenshot_path)
    if clarity["is_unclear"]:
        new_status = AnomalyStatus.NEEDS_REVIEW
        vlm_reasoning = f"Needs Human Review: {clarity['reason']} — AI vision obscured."
        vlm_conf = 0.0
    else:
        vlm_res = await vlm.analyze_image_file(event.evidence_screenshot_path, prompt=prompt)
        is_unclear_view = (
            vlm_res.visibility in ["obstructed", "unclear", "poor", "partial"] or
            vlm_res.verdict == "INCONCLUSIVE" or
            ("unclear" in (vlm_res.quick_reasoning or "").lower()) or
            ("cannot determine" in (vlm_res.quick_reasoning or "").lower())
        )
        is_confirmed = (
            vlm_res.verdict == "CONFIRMED_VIOLATION" or
            vlm_res.phone_detected or
            vlm_res.cheating_detected or
            vlm_res.peeking_detected or
            vlm_res.earbud_detected or
            vlm_res.talking_detected or
            (vlm_res.plausible is True and vlm_res.confidence >= 0.70)
        )
        if is_unclear_view and not is_confirmed:
            new_status = AnomalyStatus.NEEDS_REVIEW
            vlm_reasoning = f"Needs Human Review: Camera view is occluded or ambiguous ({vlm_res.quick_reasoning or 'AI unable to observe candidate'})."
        elif is_confirmed:
            new_status = AnomalyStatus.AI_CONFIRMED
            vlm_reasoning = vlm_res.description or vlm_res.quick_reasoning or "AI confirmed violation in surveillance keyframe."
        else:
            new_status = AnomalyStatus.AI_CLEARED
            vlm_reasoning = vlm_res.description or vlm_res.quick_reasoning or "AI cleared: Normal candidate behavior observed in clear frame."
        vlm_conf = vlm_res.confidence

    event.status = new_status
    data = {}
    try:
        if event.analysis_data:
            data = json.loads(event.analysis_data) if isinstance(event.analysis_data, str) else dict(event.analysis_data)
    except Exception:
        data = {}

    data["vlm_reasoning"] = vlm_reasoning
    data["vlm_confidence"] = vlm_conf
    data["vlm_status"] = new_status.value
    data["vlm_clarity"] = clarity
    data["vlm_reanalyzed_by"] = current_user.username if current_user else "proctor"
    data["vlm_reanalyzed_at"] = datetime.now(timezone.utc).isoformat()
    event.analysis_data = json.dumps(data)

    db.commit()
    db.refresh(event)

    await broadcast_event(str(event.exam_id), event)
    return _event_to_response(event)


@app.get("/api/events/{event_id}/screenshot")
async def download_event_screenshot(event_id: str, download: bool = False, db: Session = Depends(get_db)):
    event = get_event(db, event_id)
    if not event or not event.evidence_screenshot_path:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    if not os.path.exists(event.evidence_screenshot_path):
        raise HTTPException(status_code=404, detail="Screenshot file missing on disk")

    if download:
        return FileResponse(
            event.evidence_screenshot_path,
            media_type="image/jpeg",
            filename=f"event_{event_id}.jpg"
        )
    return FileResponse(
        event.evidence_screenshot_path,
        media_type="image/jpeg",
        content_disposition_type="inline"
    )


@app.get("/api/events/{event_id}/clip")
async def download_event_clip(event_id: str, download: bool = False, db: Session = Depends(get_db)):
    event = get_event(db, event_id)
    if not event or not event.evidence_clip_path:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not os.path.exists(event.evidence_clip_path):
        raise HTTPException(status_code=404, detail="Clip file missing on disk")

    if download:
        return FileResponse(
            event.evidence_clip_path,
            media_type="video/mp4",
            filename=f"event_{event_id}.mp4"
        )
    return FileResponse(
        event.evidence_clip_path,
        media_type="video/mp4",
        content_disposition_type="inline"
    )


@app.get("/api/exams/{exam_id}/analytics", response_model=ExamAnalyticsResponse)
async def get_exam_analytics_endpoint(exam_id: UUID, db: Session = Depends(get_db)):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    stats = await get_cached_exam_analytics(exam_id)

    events = get_events(db, exam_id=exam_id, limit=1000)
    timeline = {}
    for event in events:
        minute = int((event.timestamp - db_exam.start_time).total_seconds() / 60)
        timeline[minute] = timeline.get(minute, 0) + 1

    event_timeline = [{"minute": m, "events": c} for m, c in sorted(timeline.items())]

    return ExamAnalyticsResponse(
        exam_id=str(exam_id),
        timestamp=datetime.now(timezone.utc),
        summary=stats,
        event_timeline=event_timeline,
        top_violations=stats.get("top_violations", []),
        engagement_distribution=stats.get("engagement_distribution", {}),
        risk_distribution=stats.get("risk_distribution", {})
    )


@app.get("/api/participants/{participant_id}/analytics", response_model=ParticipantAnalyticsResponse)
async def get_participant_analytics_endpoint(participant_id: UUID, db: Session = Depends(get_db)):
    analytics = get_participant_analytics(db, participant_id)
    if not analytics:
        raise HTTPException(status_code=404, detail="Participant not found")

    return ParticipantAnalyticsResponse(
        participant_id=str(participant_id),
        exam_id=analytics.get("exam_id", ""),
        roll_number=analytics.get("roll_number", ""),
        name=analytics.get("name", ""),
        check_in_time=analytics.get("check_in_time"),
        check_out_time=analytics.get("check_out_time"),
        exam_duration_minutes=analytics.get("exam_duration_minutes", 0),
        total_events=analytics.get("total_events", 0),
        high_severity_events=analytics.get("high_severity_events", 0),
        medium_severity_events=analytics.get("medium_severity_events", 0),
        low_severity_events=analytics.get("low_severity_events", 0),
        engagement_score=analytics.get("engagement_score", 0),
        risk_score=analytics.get("risk_score", 0),
        events=analytics.get("events", [])
    )


@app.get("/api/exams/{exam_id}/report")
async def generate_report(
    exam_id: UUID,
    format: str = Query("pdf"),
    db: Session = Depends(get_db),
):
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    stats = get_exam_analytics(db, exam_id)
    participants = get_participants_by_exam(db, exam_id)
    events = get_events(db, exam_id=exam_id, limit=1000, sort_desc=False)

    if format == "pdf":
        pdf_bytes = generate_pdf_report(db_exam, stats, participants, events)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="exam_report_{exam_id}.pdf"'},
        )
    if format != "json":
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'pdf'.")

    return {
        "exam": {
            "exam_id": str(db_exam.exam_id),
            "exam_name": db_exam.exam_name,
            "start_time": db_exam.start_time.isoformat(),
            "end_time": db_exam.end_time.isoformat(),
            "location": db_exam.location,
            "duration_minutes": db_exam.duration_minutes
        },
        "summary": stats,
        "participants": [
            {
                "participant_id": str(p.participant_id),
                "roll_number": p.roll_number,
                "name": p.name,
                "seat_number": p.seat_number,
                "status": p.status.value,
                "risk_score": p.risk_score or 0
            }
            for p in participants
        ]
    }


@app.get("/api/vlm/models")
async def get_vlm_models():
    """List all available models in LM Studio and show currently active model."""
    if not vlm:
        return {"current_model": settings.VLM_MODEL, "available_models": []}
    available = await vlm.get_available_models()
    return {
        "current_model": vlm.model,
        "available_models": available
    }


@app.post("/api/vlm/select")
async def select_vlm_model(
    model_name: str = Query(..., description="Target model ID from LM Studio"),
    current_user: User = Depends(require_admin)
):
    """Switch the active Vision-Language Model on the fly."""
    if not vlm:
        raise HTTPException(status_code=503, detail="VLM client not initialized")
    vlm.set_model(model_name)
    settings.VLM_MODEL = model_name
    return {
        "status": "SUCCESS",
        "active_model": vlm.model,
        "updated_by": current_user.username
    }


# ==============================================================================
# PHASE 6: Forensic Pre-Recorded Exam Video Analysis & Heatmap Timeline Engine
# ==============================================================================

def _stream_video_range(request: Request, file_path: str, content_type: str = "video/mp4"):
    """HTTP Byte-Range partial content streamer for HTML5 video player."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if not range_header:
        def iter_full():
            with open(file_path, "rb") as f:
                while chunk := f.read(64 * 1024):
                    yield chunk
        return StreamingResponse(
            iter_full(),
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Content-Type": content_type
            },
            media_type=content_type
        )

    range_val = range_header.strip().lower()
    if not range_val.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid Range header")

    range_str = range_val[6:]
    parts = range_str.split("-")
    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1

    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    content_length = end - start + 1

    def iter_range():
        with open(file_path, "rb") as f:
            f.seek(start)
            bytes_left = content_length
            while bytes_left > 0:
                read_size = min(64 * 1024, bytes_left)
                data = f.read(read_size)
                if not data:
                    break
                bytes_left -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": content_type,
    }
    return StreamingResponse(iter_range(), status_code=206, headers=headers, media_type=content_type)


@app.post("/api/v1/video-audit/upload", response_model=VideoAuditListItemResponse, status_code=201)
async def upload_video_for_audit(
    video_file: UploadFile = File(...),
    title: str = Form("Pre-Recorded Exam Audit"),
    sample_fps: int = Form(2),
    exam_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Upload an exam recording file and launch forensic AI audit.
    STRICTLY RESTRICTED TO ADMINISTRATORS (require_admin).
    """
    allowed_exts = (".mp4", ".webm", ".avi", ".mov", ".mkv")
    orig_name = video_file.filename or "recording.mp4"
    _, ext = os.path.splitext(orig_name.lower())
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported media format '{ext}'. Allowed: {', '.join(allowed_exts)}"
        )

    audit_id = str(uuid.uuid4())
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "video_audits", audit_id)
    os.makedirs(data_dir, exist_ok=True)

    saved_video_path = os.path.join(data_dir, f"video{ext}")
    file_size = 0
    try:
        with open(saved_video_path, "wb") as buffer:
            while chunk := await video_file.read(1024 * 1024):  # 1MB chunks
                file_size += len(chunk)
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(data_dir):
            shutil.rmtree(data_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save video: {e}")

    try:
        meta = VideoAuditService.extract_metadata(saved_video_path)
    except Exception as e:
        if os.path.exists(data_dir):
            shutil.rmtree(data_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted video file: {e}")

    audit = VideoAudit(
        audit_id=audit_id,
        title=title,
        filename=orig_name,
        video_path=saved_video_path,
        file_size_bytes=file_size,
        duration_seconds=meta["duration_seconds"],
        fps=meta["fps"],
        total_frames=meta["total_frames"],
        sample_fps=max(1, min(10, sample_fps)),
        status=VideoAuditStatus.PENDING,
        uploaded_by=current_user.user_id,
        exam_id=exam_id if exam_id else None,
        created_at=utcnow()
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    # Launch processing in background thread
    VideoAuditService.run_audit_background(audit_id)
    logger.info(f"Video audit {audit_id} created by admin '{current_user.username}'. Processing started.")

    return audit


@app.get("/api/v1/video-audit", response_model=List[VideoAuditListItemResponse])
def list_video_audits(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auditor_or_admin)
):
    """List all pre-recorded video forensic audits. Restricted to Admin and Auditor."""
    return db.query(VideoAudit).order_by(VideoAudit.created_at.desc()).all()


@app.get("/api/v1/video-audit/{audit_id}", response_model=VideoAuditDetailResponse)
def get_video_audit_detail(
    audit_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auditor_or_admin)
):
    """Fetch complete details, timecode heatmap coordinates, and incidents for an audit."""
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Video audit not found")
    return audit


@app.get("/api/v1/video-audit/{audit_id}/stream")
def stream_audit_video(
    audit_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """HTTP Byte-Range partial video stream for HTML5 player seeking."""
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit or not os.path.exists(audit.video_path):
        raise HTTPException(status_code=404, detail="Video source not found")

    ext = os.path.splitext(audit.video_path)[1].lower()
    content_type = "video/mp4" if ext == ".mp4" else "video/webm" if ext == ".webm" else "video/octet-stream"
    return _stream_video_range(request, audit.video_path, content_type)


@app.get("/api/v1/video-audit/{audit_id}/snapshots/{filename}")
def get_audit_snapshot(
    audit_id: str,
    filename: str,
    db: Session = Depends(get_db)
):
    """Serve evidentiary keyframe snapshots captured during video audit."""
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    safe_filename = os.path.basename(filename)
    audit_dir = os.path.dirname(audit.video_path)
    snap_path = os.path.join(audit_dir, "snapshots", safe_filename)

    if not os.path.exists(snap_path):
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return FileResponse(snap_path, media_type="image/jpeg")


@app.get("/api/v1/video-audit/{audit_id}/report")
def download_video_audit_report(
    audit_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auditor_or_admin)
):
    """Generate and download ReportLab PDF forensic compliance dossier for this video audit."""
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    incidents = db.query(VideoAuditIncident).filter(
        VideoAuditIncident.audit_id == audit_id
    ).order_by(VideoAuditIncident.timestamp_seconds).all()

    audit_dir = os.path.dirname(audit.video_path)
    try:
        pdf_bytes = generate_video_audit_pdf(audit, incidents, audit_dir)
        safe_title = "".join(c for c in audit.title if c.isalnum() or c in ("-", "_")).strip() or "video_audit"
        filename = f"ARGUS_Audit_Dossier_{safe_title}_{audit_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.exception(f"Failed to generate video audit PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate audit report: {e}")


@app.post("/api/v1/video-audit/{audit_id}/incidents/{incident_id}/vlm-verify", response_model=VideoAuditVLMVerificationResponse)
async def verify_video_audit_incident_vlm(
    audit_id: str,
    incident_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auditor_or_admin)
):
    """
    On-demand VLM forensic inspection of a specific flagged incident keyframe.
    Accessible to Auditors and Admins.
    """
    try:
        result = await VideoAuditService.verify_incident_vlm(audit_id, incident_id, db)
        return VideoAuditVLMVerificationResponse(**result)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"VLM verification failed for incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail=f"VLM inspection error: {e}")


@app.post("/api/v1/video-audit/{audit_id}/vlm-verify-all")
async def verify_all_video_audit_incidents_vlm(
    audit_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Batch-verifies all flagged incidents in an audit session using VLM.
    Restricted to Admins.
    """
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Video audit not found")

    try:
        result = await VideoAuditService.verify_all_incidents_vlm(audit_id, db)
        return result
    except Exception as e:
        logger.exception(f"Batch VLM verification failed for audit {audit_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Batch VLM error: {e}")


@app.delete("/api/v1/video-audit/{audit_id}")
def delete_video_audit(
    audit_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Delete a video audit record, source video, and evidence snapshots.
    STRICTLY RESTRICTED TO ADMINISTRATORS (require_admin).
    """
    audit = db.query(VideoAudit).filter(VideoAudit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Video audit not found")

    audit_dir = os.path.dirname(audit.video_path)
    db.delete(audit)
    db.commit()

    if os.path.exists(audit_dir):
        try:
            shutil.rmtree(audit_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Could not remove audit directory {audit_dir}: {e}")

    return {"status": "DELETED", "audit_id": audit_id}


@app.websocket("/ws/exam/{exam_id}")
async def websocket_endpoint(websocket: WebSocket, exam_id: str, token: Optional[str] = Query(None)):
    db = next(get_db())
    try:
        is_valid, user, reason = verify_ws_token(token, exam_id, db)
        if not is_valid:
            logger.warning(f"WebSocket access denied for exam {exam_id}: {reason}")
            await websocket.close(code=1008, reason=reason)
            return
    finally:
        db.close()

    await manager.connect(websocket, exam_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, exam_id)


async def broadcast_alert(exam_id: str, alert: Alert):
    message = {
        "type": WSMessageType.ALERT,
        "payload": WSAlertPayload(
            event_id="",
            participant_id=alert.participant_id or "",
            track_id=alert.track_id,
            camera_id=alert.camera_id,
            event_type=EventType(alert.alert_type.value),
            severity=EventSeverity(alert.severity.value),
            timestamp=datetime.fromtimestamp(alert.timestamp),
            description=alert.description,
            confidence=alert.confidence,
            details=alert.details,
            thumbnail=None
        ).model_dump(mode="json"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(exam_id, message)


async def broadcast_event(exam_id: str, event):
    if not event or not event.event_id:
        logger.warning("Skipping broadcast for event with missing event_id")
        return
    ev_status = getattr(event, 'status', AnomalyStatus.PRELIMINARY)
    status_val = ev_status.value if hasattr(ev_status, 'value') else (ev_status or "PRELIMINARY")
    message = {
        "type": "event",
        "payload": {
            "event_id": str(event.event_id),
            "track_id": event.track_id,
            "camera_id": event.camera_id or 0,
            "event_type": event.event_type.value if hasattr(event.event_type, 'value') else event.event_type,
            "severity": event.severity.value if hasattr(event.severity, 'value') else event.severity,
            "status": status_val,
            "timestamp": event.timestamp.isoformat() if hasattr(event.timestamp, 'isoformat') else str(event.timestamp),
            "description": event.description,
            "confidence": event.confidence or 0,
            "analysis_data": event.analysis_data or {},
            "evidence_clip_path": event.evidence_clip_path or None,
            "evidence_screenshot_path": event.evidence_screenshot_path or None,
            "participant_id": event.participant_id or "",
            "human_reviewed": bool(getattr(event, 'human_reviewed', False)),
            "review_notes": getattr(event, 'review_notes', None),
            "reviewed_by": getattr(event, 'reviewed_by', None),
            "reviewed_at": event.reviewed_at.isoformat() if getattr(event, 'reviewed_at', None) else None,
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(exam_id, message)


def check_image_clarity(image_path: str) -> dict:
    """
    Evaluates physical frame clarity and lighting:
    - Laplacian variance for blur (motion blur, defocus)
    - Mean pixel intensity for extreme lighting (pitch black or glare blowout)
    """
    if not image_path or not os.path.isfile(image_path):
        return {"is_unclear": True, "reason": "Missing keyframe file", "blur_score": 0.0, "brightness": 0.0}
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"is_unclear": True, "reason": "Unreadable image file", "blur_score": 0.0, "brightness": 0.0}
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(gray.mean())

        if blur_score < 30.0:
            return {"is_unclear": True, "reason": f"Severe camera blur / motion artifact (sharpness {blur_score:.1f})", "blur_score": blur_score, "brightness": brightness}
        if brightness < 20.0:
            return {"is_unclear": True, "reason": f"Severe underexposure / pitch black feed (brightness {brightness:.1f})", "blur_score": blur_score, "brightness": brightness}
        if brightness > 240.0:
            return {"is_unclear": True, "reason": f"Severe glare / overexposure blowout (brightness {brightness:.1f})", "blur_score": blur_score, "brightness": brightness}

        return {"is_unclear": False, "reason": "Clear frame", "blur_score": blur_score, "brightness": brightness}
    except Exception as e:
        return {"is_unclear": True, "reason": f"Clarity analysis error: {e}", "blur_score": 0.0, "brightness": 0.0}


async def _auto_vlm_verify_event(exam_id: str, event_id: str, screenshot_path: Optional[str], event_type_val: str, description: Optional[str] = ""):
    """
    Automatic background Tier-2 verification pass on preliminary event screenshot.
    Uses multi-provider VLM (LM Studio / Ollama) to automatically confirm violations (AI_CONFIRMED)
    or clear false alarms (AI_CLEARED). Automatically flags NEEDS_REVIEW ONLY when the image is
    unclear, blurry, obstructed, or the VLM cannot determine what is happening.
    Guaranteed idempotent: once an event is marked, it will never be checked or overwritten again.
    """
    # Early bailout: if event is already resolved or marked, do not check again
    db = next(get_db())
    try:
        current_ev = get_event(db, event_id)
        if not current_ev or current_ev.status != AnomalyStatus.PRELIMINARY:
            return
    finally:
        db.close()

    if not screenshot_path or not os.path.isfile(screenshot_path):
        new_status = AnomalyStatus.NEEDS_REVIEW
        reasoning = "Needs Human Review: No keyframe image recorded — visual AI inspection unavailable."
        db = next(get_db())
        try:
            ev = get_event(db, event_id)
            if ev and (ev.status == AnomalyStatus.PRELIMINARY or getattr(ev.status, 'value', None) == "PRELIMINARY"):
                ev.status = new_status
                data = {}
                try:
                    if ev.analysis_data:
                        data = json.loads(ev.analysis_data) if isinstance(ev.analysis_data, str) else dict(ev.analysis_data)
                except Exception:
                    data = {}
                data["vlm_reasoning"] = reasoning
                data["vlm_confidence"] = 0.0
                data["vlm_status"] = new_status.value
                data["vlm_verified_at"] = datetime.now(timezone.utc).isoformat()
                ev.analysis_data = json.dumps(data)
                db.commit()
                db.refresh(ev)
                await broadcast_event(exam_id, ev)
                logger.info(f"Auto-resolved preliminary event {event_id} to NEEDS_REVIEW (missing screenshot)")
        finally:
            db.close()
        return

    # Step 1: Automated Computer Vision physical clarity check
    clarity = check_image_clarity(screenshot_path)
    if clarity["is_unclear"]:
        new_status = AnomalyStatus.NEEDS_REVIEW
        reasoning = f"Needs Human Review: {clarity['reason']} — AI vision obscured."
        db = next(get_db())
        try:
            ev = get_event(db, event_id)
            if ev and ev.status == AnomalyStatus.PRELIMINARY:
                ev.status = new_status
                data = {}
                try:
                    if ev.analysis_data:
                        data = json.loads(ev.analysis_data) if isinstance(ev.analysis_data, str) else dict(ev.analysis_data)
                except Exception:
                    data = {}
                data["vlm_reasoning"] = reasoning
                data["vlm_confidence"] = 0.0
                data["vlm_status"] = new_status.value
                data["vlm_clarity"] = clarity
                data["vlm_verified_at"] = datetime.now(timezone.utc).isoformat()
                ev.analysis_data = json.dumps(data)
                db.commit()
                db.refresh(ev)
                await broadcast_event(exam_id, ev)
                logger.info(f"Auto-VLM flagged event {event_id} as NEEDS_REVIEW due to degraded image quality: {clarity['reason']}")
        finally:
            db.close()
        return

    vlm = get_vlm_client()
    if not vlm.enabled:
        return

    try:
        # Step 2: Instant surety verification prompt
        prompt = build_instant_surety_prompt(candidate_category=event_type_val, cv_confidence=0.85)
        vlm_res = await vlm.analyze_image_file(screenshot_path, prompt=prompt)

        # Fallback to standard check if surety gave no response
        if not vlm_res.raw_response:
            vlm_res = await vlm.analyze_image_file(screenshot_path)

        if not vlm_res.raw_response and vlm_res.inference_time_ms == 0:
            return

        is_unclear_view = (
            vlm_res.visibility in ["obstructed", "unclear", "poor", "partial"] or
            vlm_res.verdict == "INCONCLUSIVE" or
            ("unclear" in (vlm_res.quick_reasoning or "").lower()) or
            ("cannot determine" in (vlm_res.quick_reasoning or "").lower())
        )

        is_confirmed = (
            vlm_res.phone_detected or
            vlm_res.cheating_detected or
            vlm_res.peeking_detected or
            vlm_res.earbud_detected or
            vlm_res.talking_detected or
            vlm_res.verdict == "CONFIRMED_VIOLATION" or
            (vlm_res.plausible is True and vlm_res.confidence >= 0.70)
        )

        # Needs human review ONLY if view is unclear/occluded and no obvious violation is present
        if is_unclear_view and not is_confirmed:
            new_status = AnomalyStatus.NEEDS_REVIEW
            reasoning = f"Needs Human Review: Camera view is occluded or ambiguous ({vlm_res.quick_reasoning or 'AI unable to observe candidate'})."
        elif is_confirmed:
            new_status = AnomalyStatus.AI_CONFIRMED
            reasoning = vlm_res.description or vlm_res.quick_reasoning or "AI confirmed suspicious indicators in surveillance keyframe."
        else:
            new_status = AnomalyStatus.AI_CLEARED
            reasoning = vlm_res.description or vlm_res.quick_reasoning or "AI cleared: Normal candidate behavior observed in clear frame."

        db = next(get_db())
        try:
            ev = get_event(db, event_id)
            if ev and ev.status == AnomalyStatus.PRELIMINARY:
                ev.status = new_status
                data = {}
                try:
                    if ev.analysis_data:
                        data = json.loads(ev.analysis_data) if isinstance(ev.analysis_data, str) else dict(ev.analysis_data)
                except Exception:
                    data = {}
                data["vlm_reasoning"] = reasoning
                data["vlm_confidence"] = vlm_res.confidence
                data["vlm_status"] = new_status.value
                data["vlm_inference_ms"] = vlm_res.inference_time_ms
                data["vlm_clarity"] = clarity
                data["vlm_verified_at"] = datetime.now(timezone.utc).isoformat()
                ev.analysis_data = json.dumps(data)
                db.commit()
                db.refresh(ev)
                await broadcast_event(exam_id, ev)
                logger.info(f"Auto-VLM verified event {event_id}: {new_status.value} (conf={vlm_res.confidence:.2f})")
        finally:
            db.close()

    except Exception as exc:
        logger.warning(f"Auto-VLM background verification failed for event {event_id}: {exc}")



async def _log_and_broadcast(exam_id: str, event_data, frame, overlays):
    if not event_logger:
        return
    el = event_logger
    loop = asyncio.get_event_loop()
    try:
        event = await loop.run_in_executor(None, lambda: el.log_event(event_data, frame, overlays=overlays))
        if event:
            await broadcast_event(exam_id, event)
            # Trigger asynchronous automated VLM verification
            ev_type_str = event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type)
            asyncio.create_task(_auto_vlm_verify_event(exam_id, str(event.event_id), event.evidence_screenshot_path, ev_type_str, event.description))
    except Exception as e:
        logger.error(f"Event log/broadcast error: {e}")


async def sweep_pending_preliminary_events(exam_id: Optional[str] = None):
    """
    Background task that sweeps existing events in PRELIMINARY status
    and automatically routes them to AI_CONFIRMED, AI_CLEARED, or NEEDS_REVIEW.
    Ensures no card is ever left indefinitely in 'Verifying with AI...'.
    """
    db = next(get_db())
    try:
        query = db.query(Event).filter(Event.status == AnomalyStatus.PRELIMINARY)
        if exam_id:
            query = query.filter(Event.exam_id == exam_id)
        pending_events = query.limit(25).all()
        for ev in pending_events:
            ev_type_str = ev.event_type.value if hasattr(ev.event_type, 'value') else str(ev.event_type)
            asyncio.create_task(_auto_vlm_verify_event(
                str(ev.exam_id),
                str(ev.event_id),
                ev.evidence_screenshot_path,
                ev_type_str,
                ev.description or ""
            ))
    except Exception as err:
        logger.warning(f"Error sweeping preliminary events: {err}")
    finally:
        db.close()


def _serialize_tracks(tracks) -> List[Dict]:
    if not tracks:
        return []
    return [
        {
            "track_id": t.track_id,
            "bbox": t.bbox,
            "confidence": t.confidence,
            "gaze_direction": "CENTER",
            "alert": None
        }
        for t in tracks
    ]


async def get_cached_exam_analytics(exam_id) -> Dict:
    key = f"analytics:{exam_id}"
    cached = await cache_get(key)
    if cached is not None:
        return cached
    db = next(get_db())
    try:
        stats = get_exam_analytics(db, exam_id)
    finally:
        db.close()
    await cache_set(key, stats, ttl=3)
    return stats


async def broadcast_analytics(exam_id: str, analytics: Dict):
    message = {
        "type": WSMessageType.ANALYTICS,
        "payload": WSAnalyticsPayload(
            timestamp=datetime.now(timezone.utc),
            total_events=analytics.get("total_events", 0),
            high_severity_events=analytics.get("high_severity_events", 0),
            average_risk_score=analytics.get("average_risk_score", 0),
            events_per_minute=analytics.get("events_per_minute", 0),
            active_students=analytics.get("active_tracks", analytics.get("checked_in", 0)),
            flagged_students=analytics.get("flagged_students", []),
            total_students=analytics.get("total_students", 0),
            checked_in=analytics.get("checked_in", 0),
            flagged_students_count=analytics.get("flagged_students_count", 0)
        ).model_dump(mode="json"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(exam_id, message)


async def run_display_loop(exam_id: UUID):
    """Lightweight display loop: encode latest frame as JPEG, broadcast binary + metadata."""
    global pipeline_running, current_exam_id

    if not camera_manager:
        logger.error("Camera manager not initialized")
        return
    cm = camera_manager

    logger.info("Display loop started")
    loop = asyncio.get_event_loop()
    frame_interval = 1.0 / 30

    while pipeline_running and current_exam_id == exam_id:
        start = time.time()
        frame_data = cm.get_display_frame()
        if frame_data is not None:
            raw_frame = frame_data.frame
            if event_logger:
                event_logger.add_frame(0, raw_frame)
            if session_recorder:
                session_recorder.add_frame(raw_frame)

            jpeg_bytes = await loop.run_in_executor(None, lambda: cv2.imencode(
                '.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 50]
            )[1].tobytes())

            await manager.broadcast_bytes(str(exam_id), jpeg_bytes)

            with _tracks_lock:
                tracks_copy = list(latest_analyzed_tracks)
            await manager.broadcast(str(exam_id), {
                "type": "frame_meta",
                "camera_id": 0,
                "tracks": tracks_copy,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        elapsed = time.time() - start
        await asyncio.sleep(max(0, frame_interval - elapsed))

    logger.info("Display loop stopped")


async def _run_vlm(frame: np.ndarray):
    global _latest_vlm_result, _vlm_in_flight
    if not vlm:
        return
    vlm_client = vlm
    _vlm_in_flight = True
    try:
        _, buf = await asyncio.get_event_loop().run_in_executor(None, lambda: cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60]))
        try:
            result = await vlm_client.analyze_frame(base64.b64encode(buf).decode('utf-8'))
            _latest_vlm_result = result
            if result.phone_detected or result.cheating_detected:
                logger.info(f"VLM: phone={result.phone_detected} cheat={result.cheating_detected} conf={result.confidence:.2f}")
        except Exception as e:
            logger.debug(f"VLM error: {e}")
    finally:
        _vlm_in_flight = False


async def run_analysis_loop(exam_id: UUID):
    """Heavy analysis loop: detection, tracking, mediapipe, alerts, VLM."""
    global pipeline_running, current_exam_id, latest_analyzed_tracks, _vlm_in_flight

    if not camera_manager or not detection_engine or not mediapipe_analyzer or not anomaly_detector:
        logger.error("Analysis loop components not initialized")
        return
    cm = camera_manager
    de = detection_engine
    mp = mediapipe_analyzer
    ad = anomaly_detector

    logger.info("Analysis loop started")
    process_counter = 0
    analytics_counter = 0
    vlm_counter = 0
    tracks = []

    try:
        loop = asyncio.get_event_loop()
        while pipeline_running and current_exam_id == exam_id:
            frame_data = cm.get_display_frame()
            if frame_data is None:
                await asyncio.sleep(0.01)
                continue

            frame = frame_data.frame
            frame_number = frame_data.frame_number

            process_counter += 1
            if process_counter < settings.FRAME_SKIP_RATIO:
                continue
            process_counter = 0

            result = await loop.run_in_executor(None, de.track, frame, frame_number)
            tracks = [d for d in result.detections if d.class_name == "person" and d.track_id is not None]
            phone_detections = [d for d in result.detections if d.class_name == "cell phone"]
            with _tracks_lock:
                latest_analyzed_tracks = _serialize_tracks(tracks)

            # VLM inference: send high-res cropped person region if available, else full frame
            vlm_counter += 1
            if vlm_counter >= 30 and vlm and await vlm.is_available() and not _vlm_in_flight:
                vlm_counter = 0
                vlm_frame = frame
                if tracks:
                    bx1, by1, bx2, by2 = tracks[0].bbox
                    h, w = frame.shape[:2]
                    margin_x = int((bx2 - bx1) * 0.2)
                    margin_y = int((by2 - by1) * 0.2)
                    cx1 = max(0, bx1 - margin_x)
                    cy1 = max(0, by1 - margin_y)
                    cx2 = min(w, bx2 + margin_x)
                    cy2 = min(h, by2 + margin_y)
                    crop = frame[cy1:cy2, cx1:cx2]
                    if crop.size > 0:
                        vlm_frame = crop
                asyncio.create_task(_run_vlm(vlm_frame))

            for track in tracks:
                if track.track_id is None:
                    continue
                tid: int = track.track_id
                resolved_p_id = _resolve_participant_id(exam_id, tid)
                face_count = _track_face_counters.get(tid, 0)
                _track_face_counters[tid] = face_count + 1
                face_analysis = None
                if face_count % 3 == 0:
                    face_analysis = await loop.run_in_executor(None, mp.analyze, frame, track.bbox)

                phone_alert = None
                phone_det = None
                for phone_det_candidate in phone_detections:
                    if _bbox_overlap(track.bbox, phone_det_candidate.bbox, threshold=0.3):
                        phone_det = phone_det_candidate
                        phone_alert = Alert(
                            alert_type=AlertType.PHONE_DETECTED,
                            severity=AlertSeverity.HIGH,
                            track_id=tid,
                            participant_id=resolved_p_id,
                            camera_id=0,
                            timestamp=time.time(),
                            description=f"Mobile phone detected near person (confidence: {phone_det.confidence:.0%})",
                            confidence=phone_det.confidence,
                            details={"phone_bbox": phone_det.bbox, "person_bbox": track.bbox},
                            cooldown_key=f"phone_{tid}"
                        )
                        break

                vlm_result = _latest_vlm_result
                if not phone_alert and vlm_result and vlm_result.confidence >= 0.5:
                    vlm_flag = vlm_result.phone_detected or vlm_result.cheating_detected
                    if vlm_flag and time.time() - _vlm_alert_times.get(tid, 0) >= 30:
                        _vlm_alert_times[tid] = time.time()
                        if vlm_result.phone_detected:
                            phone_alert = Alert(
                                alert_type=AlertType.PHONE_DETECTED,
                                severity=AlertSeverity.HIGH,
                                track_id=tid,
                                participant_id=resolved_p_id,
                                camera_id=0,
                                timestamp=time.time(),
                                description=f"VLM detected phone usage: {vlm_result.description}",
                                confidence=vlm_result.confidence,
                                details={"vlm_response": vlm_result.raw_response, "person_bbox": track.bbox},
                                cooldown_key=f"phone_{tid}"
                            )
                        elif vlm_result.cheating_detected:
                            phone_alert = Alert(
                                alert_type=AlertType.SUSPICIOUS_BEHAVIOR,
                                severity=AlertSeverity.MEDIUM,
                                track_id=tid,
                                participant_id=resolved_p_id,
                                camera_id=0,
                                timestamp=time.time(),
                                description=f"VLM detected suspicious behavior: {vlm_result.description}",
                                confidence=vlm_result.confidence,
                                details={"vlm_response": vlm_result.raw_response, "person_bbox": track.bbox},
                                cooldown_key=f"cheat_{tid}"
                            )

                if phone_alert:
                    event_data = EventData(
                        exam_id=str(exam_id),
                        track_id=phone_alert.track_id,
                        participant_id=resolved_p_id,
                        camera_id=0,
                        event_type=EventType(phone_alert.alert_type.value),
                        severity=EventSeverity(phone_alert.severity.value),
                        timestamp=datetime.fromtimestamp(phone_alert.timestamp),
                        description=phone_alert.description,
                        confidence=phone_alert.confidence,
                        analysis_data=phone_alert.details
                    )
                    overlays = [{'type': 'bbox', 'bbox': track.bbox, 'color': (0, 0, 255)}]
                    if phone_det is not None:
                        overlays.append({'type': 'bbox', 'bbox': phone_det.bbox, 'color': (0, 0, 255)})
                    asyncio.create_task(_log_and_broadcast(str(exam_id), event_data, frame, overlays))
                    await broadcast_alert(str(exam_id), phone_alert)
                    continue

                md_analysis = None
                if _latest_vlm_result:
                    indicators = []
                    if _latest_vlm_result.phone_detected:
                        indicators.append({"type": "PHONE_DETECTED", "description": _latest_vlm_result.description})
                    if _latest_vlm_result.cheating_detected:
                        indicators.append({"type": "CHEAT_SHEET", "description": _latest_vlm_result.description})
                    if _latest_vlm_result.talking_detected:
                        indicators.append({"type": "COMMUNICATION", "description": _latest_vlm_result.description})
                    if _latest_vlm_result.earbud_detected:
                        indicators.append({"type": "EARBUDS", "description": _latest_vlm_result.description})
                    if getattr(_latest_vlm_result, "peeking_detected", False):
                        indicators.append({"type": "PEEKING_NEIGHBOR_PAPER", "description": _latest_vlm_result.description})
                    md_analysis = AnomalyMoondreamAnalysis(
                        suspicious_indicators=indicators,
                        confidence=_latest_vlm_result.confidence,
                        detected_objects=_latest_vlm_result.detected_objects or [],
                        activity="TALKING" if _latest_vlm_result.talking_detected else ""
                    )

                other_tracks = {t.track_id: t.bbox for t in tracks if t.track_id is not None and t.track_id != tid}
                alerts = await loop.run_in_executor(None, lambda: ad.analyze(
                    track_id=tid,
                    face_analysis=face_analysis,
                    moondream_analysis=md_analysis,
                    audio_level_db=audio_level_service.get_level_db(),
                    person_bbox=track.bbox,
                    frame_number=frame_number,
                    other_tracks=other_tracks
                ))

                for alert in alerts:
                    alert.participant_id = resolved_p_id
                    event_data = EventData(
                        exam_id=str(exam_id),
                        track_id=tid,
                        participant_id=resolved_p_id,
                        camera_id=0,
                        event_type=EventType(alert.alert_type.value),
                        severity=EventSeverity(alert.severity.value),
                        timestamp=datetime.fromtimestamp(alert.timestamp),
                        description=alert.description,
                        confidence=alert.confidence,
                        analysis_data=alert.details
                    )
                    overlays = [{'type': 'bbox', 'bbox': track.bbox, 'color': (0, 0, 255) if alert.severity == AlertSeverity.HIGH else (0, 255, 0)}]
                    if track.keypoints:
                        overlays.append({'type': 'keypoints', 'keypoints': track.keypoints})
                    # Tactical arrow overlay pointing towards neighbor desk if peeking
                    if alert.alert_type == AlertType.PEEKING_NEIGHBOR_PAPER:
                        n_bbox = alert.details.get("neighbor_bbox")
                        if n_bbox:
                            c_self = ((track.bbox[0] + track.bbox[2]) // 2, (track.bbox[1] + track.bbox[3]) // 3)
                            c_neigh = ((n_bbox[0] + n_bbox[2]) // 2, (n_bbox[1] + n_bbox[3]) // 3)
                            overlays.append({'type': 'bbox', 'bbox': n_bbox, 'color': (0, 165, 255)})
                            overlays.append({'type': 'arrow', 'start': c_self, 'end': c_neigh, 'color': (0, 0, 255)})
                    asyncio.create_task(_log_and_broadcast(str(exam_id), event_data, frame, overlays))
                    await broadcast_alert(str(exam_id), alert)

            analytics_counter += 1
            if analytics_counter >= 100:
                analytics_counter = 0
                try:
                    stats = await get_cached_exam_analytics(exam_id)
                    await broadcast_analytics(str(exam_id), stats)
                except Exception as e:
                    logger.error(f"Analytics broadcast error: {e}")

    except Exception as e:
        logger.error(f"Analysis loop error: {e}")
    finally:
        logger.info("Analysis loop stopped")


async def run_pipeline(exam_id: UUID, record_full_session: bool = False):
    """Run display + analysis loops concurrently. Auto-restarts analysis on crash."""
    global pipeline_running, session_recorder

    logger.info(f"Starting dual pipeline for exam {exam_id} (record_full_session={record_full_session})")

    if not camera_manager:
        logger.error("Failed to start camera: camera_manager not initialized")
        pipeline_running = False
        return
    cm = camera_manager

    if not cm.start():
        logger.error("Failed to start camera")
        pipeline_running = False
        return

    # Initialize continuous session video recorder if toggled ON
    if record_full_session:
        recorder = SessionVideoRecorder(
            output_dir=settings.VIDEO_STORAGE_PATH,
            exam_id=str(exam_id),
            fps=settings.CAMERA_FPS,
            resolution=(settings.CAMERA_RESOLUTION_WIDTH, settings.CAMERA_RESOLUTION_HEIGHT)
        )
        if recorder.start():
            session_recorder = recorder
            logger.info(f"Full session recording active for exam {exam_id}")
        else:
            session_recorder = None
    else:
        session_recorder = None

    display_task = asyncio.create_task(run_display_loop(exam_id))
    analysis_task = asyncio.create_task(run_analysis_loop(exam_id))

    try:
        while pipeline_running:
            done, _ = await asyncio.wait(
                [display_task, analysis_task],
                return_when=asyncio.FIRST_COMPLETED,
                timeout=1.0
            )
            for task in done:
                if task is analysis_task and task.done() and not task.cancelled():
                    logger.warning("Analysis loop stopped — restarting in 2s")
                    await asyncio.sleep(2)
                    analysis_task = asyncio.create_task(run_analysis_loop(exam_id))
                elif task is display_task and task.done():
                    pipeline_running = False
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
    finally:
        for t in [display_task, analysis_task]:
            if not t.done():
                t.cancel()
        await asyncio.sleep(0)
        cm.stop()
        pipeline_running = False
        logger.info(f"Pipeline stopped for exam {exam_id}")


async def stop_pipeline() -> Optional[str]:
    global pipeline_running, pipeline_task, current_exam_id, session_recorder

    pipeline_running = False
    finalized_video_path = None

    if session_recorder:
        try:
            finalized_video_path = session_recorder.stop()
            logger.info(f"Session recording finalized at: {finalized_video_path}")
        except Exception as e:
            logger.error(f"Error stopping session recorder: {e}")
        session_recorder = None

    if pipeline_task:
        pipeline_task.cancel()
        try:
            await pipeline_task
        except asyncio.CancelledError:
            pass
        pipeline_task = None

    current_exam_id = None
    return finalized_video_path


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
