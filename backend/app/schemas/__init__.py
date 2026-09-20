from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

from app.models import (
    ExamStatus, EventSeverity, EventType, ParticipantStatus, UserRole, ActionStatus, VideoAuditStatus
)


# Exam Schemas
class ExamCreate(BaseModel):
    exam_name: str = Field(..., min_length=1, max_length=255)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: int = Field(..., gt=0)
    location: Optional[str] = None
    num_students: int = Field(default=0, ge=0)
    num_cameras: int = Field(default=1, ge=1)
    settings: Optional[Dict[str, Any]] = None


class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    num_students: Optional[int] = None
    num_cameras: Optional[int] = None
    settings: Optional[Dict[str, Any]] = None


class ExamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    exam_id: str
    exam_name: str
    status: ExamStatus
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    location: Optional[str]
    num_students: int
    num_cameras: int
    settings: Optional[Dict[str, Any]]
    created_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]

    checked_in_students: Optional[int] = 0
    active_tracks: Optional[int] = 0
    total_events: Optional[int] = 0
    high_severity_events: Optional[int] = 0


class ExamStartResponse(BaseModel):
    exam_id: str
    status: ExamStatus
    started_at: datetime
    camera_status: List[Dict[str, Any]]


class ExamEndResponse(BaseModel):
    exam_id: str
    status: ExamStatus
    ended_at: datetime
    total_duration_minutes: float
    summary: Dict[str, Any]


# Participant Schemas
class ParticipantCreate(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    seat_number: int = Field(..., ge=1)
    assigned_camera_id: int = Field(default=0, ge=0)
    face_image_base64: Optional[str] = None


class ParticipantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: str
    exam_id: str
    roll_number: str
    name: str
    seat_number: int
    assigned_camera_id: int
    status: ParticipantStatus
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime]
    current_track_id: Optional[int]
    risk_score: Optional[float] = 0.0
    event_count: Optional[int] = 0
    registration_time: datetime


class ParticipantCheckIn(BaseModel):
    face_image_base64: Optional[str] = None
    current_track_id: Optional[int] = None


class ParticipantCheckInResponse(BaseModel):
    participant_id: str
    status: ParticipantStatus
    check_in_time: datetime
    identity_verified: bool
    verification_confidence: Optional[float] = None


class ParticipantCheckOutResponse(BaseModel):
    participant_id: str
    status: ParticipantStatus
    check_out_time: datetime
    exam_duration: float
    total_events: int
    high_severity_events: int


# Event Schemas
class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
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
    evidence_clip_path: Optional[str] = None
    evidence_screenshot_path: Optional[str] = None
    human_reviewed: bool
    review_notes: Optional[str]
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]


class EventReviewRequest(BaseModel):
    reviewed: bool = True
    review_notes: Optional[str] = None
    severity_override: Optional[EventSeverity] = None


class EventReviewResponse(BaseModel):
    event_id: str
    human_reviewed: bool
    review_notes: Optional[str]
    reviewed_by: str
    reviewed_at: datetime


# Analytics Schemas
class ExamAnalyticsResponse(BaseModel):
    exam_id: str
    timestamp: datetime
    summary: Dict[str, Any]
    event_timeline: List[Dict[str, Any]]
    top_violations: List[Dict[str, Any]]
    engagement_distribution: Dict[str, int]
    risk_distribution: Dict[str, int]


class ParticipantAnalyticsResponse(BaseModel):
    participant_id: str
    exam_id: str
    roll_number: str
    name: str
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime]
    exam_duration_minutes: float
    total_events: int
    high_severity_events: int
    medium_severity_events: int
    low_severity_events: int
    engagement_score: float
    risk_score: float
    events: List[Dict[str, Any]]


# WebSocket Messages
class WSMessageType(str):
    ALERT = "alert"
    FRAME = "frame"
    ANALYTICS = "analytics"
    STATUS = "status"
    ERROR = "error"


class WSAlertPayload(BaseModel):
    event_id: str
    participant_id: str
    track_id: int
    camera_id: int
    event_type: EventType
    severity: EventSeverity
    timestamp: datetime
    description: str
    confidence: float = 0.0
    details: Optional[Dict[str, Any]] = None
    thumbnail: Optional[str] = None


class WSFramePayload(BaseModel):
    camera_id: int
    frame_data: str
    timestamp: datetime
    tracks: List[Dict[str, Any]]


class WSAnalyticsPayload(BaseModel):
    timestamp: datetime
    total_events: int
    high_severity_events: int
    average_risk_score: float
    events_per_minute: float
    active_students: int
    flagged_students: List[Dict[str, Any]]
    total_students: int = 0
    checked_in: int = 0
    flagged_students_count: int = 0


# Runtime Configuration Schemas
class ConfigResponse(BaseModel):
    audio_threshold_db: float
    gaze_deviation_frames: int
    gaze_deviation_angle: int
    head_pose_extreme_angle: int
    posture_bend_threshold: int
    frame_skip_ratio: int
    vlm_enabled: bool
    vlm_model: Optional[str] = None
    available_vlm_models: List[str] = []


class ConfigUpdateRequest(BaseModel):
    audio_threshold_db: Optional[float] = None
    gaze_deviation_frames: Optional[int] = None
    gaze_deviation_angle: Optional[int] = None
    head_pose_extreme_angle: Optional[int] = None
    posture_bend_threshold: Optional[int] = None
    frame_skip_ratio: Optional[int] = None
    vlm_enabled: Optional[bool] = None
    vlm_model: Optional[str] = None


# Authentication & RBAC Schemas
class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    role: UserRole
    assigned_exam_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=100)
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.PROCTOR
    assigned_exam_id: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None
    assigned_exam_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class PendingActionResponse(BaseModel):
    id: str
    action_type: str
    target_id: str
    payload: Optional[str] = None
    requested_by: str
    approved_by: Optional[str] = None
    status: ActionStatus
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PendingActionApproveRequest(BaseModel):
    approved: bool  # True to execute, False to reject


# Video Audit Schemas (Phase 6)
class VideoAuditIncidentResponse(BaseModel):
    incident_id: str
    audit_id: str
    timestamp_seconds: float
    frame_index: int
    event_type: EventType
    severity: EventSeverity
    confidence: float
    description: Optional[str] = None
    track_id: int = 0
    bbox: Optional[str] = None
    snapshot_path: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VideoAuditListItemResponse(BaseModel):
    audit_id: str
    title: str
    filename: str
    file_size_bytes: int
    duration_seconds: float
    fps: float
    total_frames: int
    processed_frames: int
    sample_fps: int
    progress_percent: float
    status: VideoAuditStatus
    risk_score: float
    total_violations: int
    error_message: Optional[str] = None
    uploaded_by: Optional[str] = None
    exam_id: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class VideoAuditDetailResponse(VideoAuditListItemResponse):
    incidents: List[VideoAuditIncidentResponse] = []
