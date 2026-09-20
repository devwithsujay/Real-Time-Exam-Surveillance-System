import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, Integer, Float, Boolean, ForeignKey, Index, Text, Enum as SQLEnum
)
from sqlalchemy.orm import relationship, declarative_base
import enum

Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExamStatus(str, enum.Enum):
    CREATED = "CREATED"
    IN_PROGRESS = "IN_PROGRESS"
    ENDED = "ENDED"
    ARCHIVED = "ARCHIVED"


class EventSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EventType(str, enum.Enum):
    PHONE_DETECTED = "PHONE_DETECTED"
    CHEAT_SHEET = "CHEAT_SHEET"
    COMMUNICATION = "COMMUNICATION"
    LOOKING_AWAY = "LOOKING_AWAY"
    ABNORMAL_POSTURE = "ABNORMAL_POSTURE"
    FACE_OBSCURED = "FACE_OBSCURED"
    UNAUTHORIZED_ITEM = "UNAUTHORIZED_ITEM"
    AUDIO_ANOMALY = "AUDIO_ANOMALY"
    ID_MISMATCH = "ID_MISMATCH"
    SEAT_VIOLATION = "SEAT_VIOLATION"
    SUSPICIOUS_BEHAVIOR = "SUSPICIOUS_BEHAVIOR"
    PEEKING_NEIGHBOR_PAPER = "PEEKING_NEIGHBOR_PAPER"


class ParticipantStatus(str, enum.Enum):
    REGISTERED = "REGISTERED"
    CHECKED_IN = "CHECKED_IN"
    CHECKED_OUT = "CHECKED_OUT"
    ABSENT = "ABSENT"


class Exam(Base):
    __tablename__ = "exams"

    exam_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_name = Column(String(255), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    location = Column(String(255))
    num_students = Column(Integer, default=0)
    num_cameras = Column(Integer, default=1)
    status = Column(SQLEnum(ExamStatus), default=ExamStatus.CREATED, nullable=False)
    settings = Column(Text)  # JSON string for flexible settings
    created_at = Column(DateTime, default=utcnow)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    participants = relationship("Participant", back_populates="exam", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="exam", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_exam_status", "status"),
        Index("idx_exam_time", "start_time", "end_time"),
    )


class Participant(Base):
    __tablename__ = "participants"

    participant_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String(36), ForeignKey("exams.exam_id"), nullable=False)
    roll_number = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    seat_number = Column(Integer)
    assigned_camera_id = Column(Integer, default=0)
    face_embedding = Column(Text, nullable=True)  # Base64 encoded
    status = Column(SQLEnum(ParticipantStatus), default=ParticipantStatus.REGISTERED, nullable=False)
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    current_track_id = Column(Integer, nullable=True)
    risk_score = Column(Float, default=0.0)
    registration_time = Column(DateTime, default=utcnow)

    exam = relationship("Exam", back_populates="participants")
    events = relationship("Event", back_populates="participant", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_participant_exam", "exam_id"),
        Index("idx_participant_seat", "exam_id", "seat_number"),
        Index("idx_participant_roll", "exam_id", "roll_number"),
    )


class Event(Base):
    __tablename__ = "events"

    event_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String(36), ForeignKey("exams.exam_id"), nullable=False)
    track_id = Column(Integer, nullable=False)
    participant_id = Column(String(36), ForeignKey("participants.participant_id"), nullable=True)
    camera_id = Column(Integer, default=0)
    event_type = Column(SQLEnum(EventType), nullable=False)
    severity = Column(SQLEnum(EventSeverity), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=utcnow)
    description = Column(Text)
    confidence = Column(Float, default=0.0)
    analysis_data = Column(Text)  # JSON string
    evidence_clip_path = Column(String(500), nullable=True)
    evidence_screenshot_path = Column(String(500), nullable=True)
    human_reviewed = Column(Boolean, default=False)
    review_notes = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    exam = relationship("Exam", back_populates="events")
    participant = relationship("Participant", back_populates="events")

    __table_args__ = (
        Index("idx_event_exam_time", "exam_id", "timestamp"),
        Index("idx_event_participant", "participant_id"),
        Index("idx_event_type_severity", "event_type", "severity"),
        Index("idx_event_track", "exam_id", "track_id"),
    )


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    AUDITOR = "AUDITOR"
    PROCTOR = "PROCTOR"


class User(Base):
    __tablename__ = "users"

    user_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.PROCTOR, nullable=False)
    assigned_exam_id = Column(String(36), nullable=True)  # Scopes proctors to a specific exam; null for global
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class ActionStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class PendingAction(Base):
    """Approval queue for high-stakes actions requiring two-person verification."""
    __tablename__ = "pending_actions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    action_type = Column(String(50), nullable=False)  # e.g., "DELETE_EXAM", "DISQUALIFY_STUDENT"
    target_id = Column(String(100), nullable=False)
    payload = Column(Text, nullable=True)  # JSON serialized parameters
    requested_by = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    approved_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)
    status = Column(SQLEnum(ActionStatus), default=ActionStatus.PENDING, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)


class VideoAuditStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class VideoAudit(Base):
    __tablename__ = "video_audits"

    audit_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    video_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, default=0)
    duration_seconds = Column(Float, default=0.0)
    fps = Column(Float, default=0.0)
    total_frames = Column(Integer, default=0)
    processed_frames = Column(Integer, default=0)
    sample_fps = Column(Integer, default=2)
    progress_percent = Column(Float, default=0.0)
    status = Column(SQLEnum(VideoAuditStatus), default=VideoAuditStatus.PENDING, nullable=False)
    risk_score = Column(Float, default=0.0)
    total_violations = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    uploaded_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)
    exam_id = Column(String(36), ForeignKey("exams.exam_id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    incidents = relationship("VideoAuditIncident", back_populates="audit", cascade="all, delete-orphan", order_by="VideoAuditIncident.timestamp_seconds")

    __table_args__ = (
        Index("idx_video_audit_status", "status"),
        Index("idx_video_audit_created", "created_at"),
    )


class VideoAuditIncident(Base):
    __tablename__ = "video_audit_incidents"

    incident_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    audit_id = Column(String(36), ForeignKey("video_audits.audit_id"), nullable=False)
    timestamp_seconds = Column(Float, nullable=False)
    frame_index = Column(Integer, nullable=False)
    event_type = Column(SQLEnum(EventType), nullable=False)
    severity = Column(SQLEnum(EventSeverity), nullable=False)
    confidence = Column(Float, default=0.0)
    description = Column(Text)
    track_id = Column(Integer, default=0)
    bbox = Column(Text, nullable=True)  # JSON [x1, y1, x2, y2]
    snapshot_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    audit = relationship("VideoAudit", back_populates="incidents")

    __table_args__ = (
        Index("idx_incident_audit_time", "audit_id", "timestamp_seconds"),
        Index("idx_incident_type_sev", "event_type", "severity"),
    )
