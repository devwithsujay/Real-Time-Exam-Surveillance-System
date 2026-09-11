from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import json
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models import (
    Exam, Participant, Event, ExamStatus, ParticipantStatus, EventType, EventSeverity,
    User, UserRole, PendingAction, ActionStatus
)
from app.schemas import (
    ExamCreate, ExamUpdate, ParticipantCreate, ParticipantCheckIn, EventReviewRequest,
    UserCreate, UserUpdate
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_exam(db: Session, exam_id) -> Optional[Exam]:
    return db.query(Exam).filter(Exam.exam_id == str(exam_id)).first()


def get_exams(db: Session, skip: int = 0, limit: int = 100) -> List[Exam]:
    return db.query(Exam).order_by(desc(Exam.created_at)).offset(skip).limit(limit).all()


def create_exam(db: Session, exam: ExamCreate) -> Exam:
    start_time = exam.start_time or utcnow()
    end_time = exam.end_time or (start_time + timedelta(minutes=exam.duration_minutes))
    db_exam = Exam(
        exam_name=exam.exam_name,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=exam.duration_minutes,
        location=exam.location,
        num_students=exam.num_students,
        num_cameras=exam.num_cameras,
        settings=exam.settings.model_dump_json() if exam.settings else None,
        status=ExamStatus.CREATED
    )
    db.add(db_exam)
    db.commit()
    db.refresh(db_exam)
    return db_exam


def update_exam(db: Session, exam_id, exam_update: ExamUpdate) -> Optional[Exam]:
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        return None

    update_data = exam_update.model_dump(exclude_unset=True)
    if 'settings' in update_data and update_data['settings']:
        update_data['settings'] = update_data['settings'].model_dump_json()

    for field, value in update_data.items():
        setattr(db_exam, field, value)

    db.commit()
    db.refresh(db_exam)
    return db_exam


def delete_exam(db: Session, exam_id) -> bool:
    db_exam = get_exam(db, exam_id)
    if not db_exam:
        return False
    db.delete(db_exam)
    db.commit()
    return True


def start_exam(db: Session, exam_id) -> Optional[Exam]:
    db_exam = get_exam(db, exam_id)
    if not db_exam or db_exam.status != ExamStatus.CREATED:
        return None

    db_exam.status = ExamStatus.IN_PROGRESS
    db_exam.started_at = utcnow()
    db.commit()
    db.refresh(db_exam)
    return db_exam


def end_exam(db: Session, exam_id) -> Optional[Exam]:
    db_exam = get_exam(db, exam_id)
    if not db_exam or db_exam.status != ExamStatus.IN_PROGRESS:
        return None

    db_exam.status = ExamStatus.ENDED
    db_exam.ended_at = utcnow()
    db.commit()
    db.refresh(db_exam)
    return db_exam


# Participant CRUD
def get_participant(db: Session, participant_id) -> Optional[Participant]:
    return db.query(Participant).filter(Participant.participant_id == str(participant_id)).first()


def ensure_exam_participants_seeded(db: Session, exam_id) -> int:
    """Ensure an exam with num_students has a registered cohort in the database."""
    exam_id_str = str(exam_id)
    db_exam = get_exam(db, exam_id_str)
    if not db_exam:
        return 0
    count = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id_str
    ).scalar() or 0
    target_count = db_exam.num_students if (db_exam.num_students and db_exam.num_students > 0) else 5
    if count < target_count:
        needed = min(target_count, 100) - count
        max_seat = db.query(func.max(Participant.seat_number)).filter(Participant.exam_id == exam_id_str).scalar() or 0
        cohort = []
        for i in range(1, needed + 1):
            seat = max_seat + i
            cohort.append(Participant(
                participant_id=str(uuid.uuid4()),
                exam_id=exam_id_str,
                roll_number=f"REG-{2024000 + seat}",
                name=f"Candidate {seat:02d}",
                seat_number=seat,
                assigned_camera_id=0,
                status=ParticipantStatus.REGISTERED,
                risk_score=0.0
            ))
        db.add_all(cohort)
        db.commit()
        return count + needed
    return count


def seed_exam_participants(db: Session, exam_id, count: Optional[int] = None) -> int:
    """Explicitly seed additional or remaining participant desks for an exam."""
    exam_id_str = str(exam_id)
    db_exam = get_exam(db, exam_id_str)
    if not db_exam:
        return 0
    current_count = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id_str
    ).scalar() or 0
    if count is not None and count > 0:
        needed = count
    else:
        target = db_exam.num_students if (db_exam.num_students and db_exam.num_students > 0) else 5
        needed = max(1, target - current_count)
    
    max_seat = db.query(func.max(Participant.seat_number)).filter(Participant.exam_id == exam_id_str).scalar() or 0
    cohort = []
    for i in range(1, needed + 1):
        seat = max_seat + i
        cohort.append(Participant(
            participant_id=str(uuid.uuid4()),
            exam_id=exam_id_str,
            roll_number=f"REG-{2024000 + seat}",
            name=f"Candidate {seat:02d}",
            seat_number=seat,
            assigned_camera_id=0,
            status=ParticipantStatus.REGISTERED,
            risk_score=0.0
        ))
    db.add_all(cohort)
    db.commit()
    return needed


def get_participants_by_exam(db: Session, exam_id, skip: int = 0, limit: int = 100) -> List[Participant]:
    ensure_exam_participants_seeded(db, str(exam_id))
    return db.query(Participant).filter(Participant.exam_id == str(exam_id)).offset(skip).limit(limit).all()


def get_participants_count(db: Session, exam_id) -> int:
    ensure_exam_participants_seeded(db, str(exam_id))
    return db.query(Participant).filter(Participant.exam_id == str(exam_id)).count()


def create_participant(db: Session, exam_id, participant: ParticipantCreate) -> Participant:
    db_participant = Participant(
        exam_id=str(exam_id),
        roll_number=participant.roll_number,
        name=participant.name,
        seat_number=participant.seat_number,
        assigned_camera_id=participant.assigned_camera_id,
        face_embedding=participant.face_image_base64,
        status=ParticipantStatus.REGISTERED
    )
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant


def checkin_participant(
    db: Session,
    participant_id,
    checkin: ParticipantCheckIn
) -> Optional[Participant]:
    db_participant = get_participant(db, participant_id)
    if not db_participant:
        return None

    db_participant.status = ParticipantStatus.CHECKED_IN
    if not db_participant.check_in_time:
        db_participant.check_in_time = utcnow()
    if checkin.face_image_base64:
        db_participant.face_embedding = checkin.face_image_base64
    if checkin.current_track_id is not None:
        db_participant.current_track_id = checkin.current_track_id

    db.commit()
    db.refresh(db_participant)
    return db_participant


def batch_checkin_participants(db: Session, exam_id) -> int:
    """Mark all registered participants in an exam as checked in."""
    ensure_exam_participants_seeded(db, str(exam_id))
    participants = db.query(Participant).filter(
        Participant.exam_id == str(exam_id),
        Participant.status == ParticipantStatus.REGISTERED
    ).all()
    now = utcnow()
    count = 0
    for p in participants:
        p.status = ParticipantStatus.CHECKED_IN
        p.check_in_time = now
        count += 1
    if count > 0:
        db.commit()
    return count


def checkout_participant(db: Session, participant_id) -> Optional[Participant]:
    db_participant = get_participant(db, participant_id)
    if not db_participant:
        return None

    db_participant.status = ParticipantStatus.CHECKED_OUT
    db_participant.check_out_time = utcnow()
    db_participant.current_track_id = None
    db.commit()
    db.refresh(db_participant)
    return db_participant


# Event CRUD
def create_event(
    db: Session,
    exam_id,
    track_id: int,
    participant_id,
    camera_id: int,
    event_type: EventType,
    severity: EventSeverity,
    timestamp: datetime,
    description: str,
    confidence: float,
    analysis_data: Optional[Dict[str, Any]] = None,
    evidence_clip_path: Optional[str] = None,
    evidence_screenshot_path: Optional[str] = None
) -> Event:
    p_id_str = str(participant_id) if participant_id else None
    event = Event(
        exam_id=str(exam_id),
        track_id=track_id,
        participant_id=p_id_str,
        camera_id=camera_id,
        event_type=event_type,
        severity=severity,
        timestamp=timestamp,
        description=description,
        confidence=confidence,
        analysis_data=json.dumps(analysis_data) if analysis_data else None,
        evidence_clip_path=evidence_clip_path,
        evidence_screenshot_path=evidence_screenshot_path
    )
    db.add(event)

    # Automatically update participant risk score
    if p_id_str:
        participant = db.query(Participant).filter(Participant.participant_id == p_id_str).first()
        if participant:
            weight = 30.0 if severity == EventSeverity.CRITICAL else (20.0 if severity == EventSeverity.HIGH else (10.0 if severity == EventSeverity.MEDIUM else 2.0))
            current_risk = participant.risk_score or 0.0
            participant.risk_score = min(100.0, current_risk + weight)

    db.commit()
    db.refresh(event)
    return event


def get_events(
    db: Session,
    exam_id=None,
    participant_id=None,
    severity: Optional[List[EventSeverity]] = None,
    event_type: Optional[List[EventType]] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 50,
    sort_desc: bool = True
) -> List[Event]:
    query = db.query(Event)

    if exam_id:
        query = query.filter(Event.exam_id == str(exam_id))
    if participant_id:
        query = query.filter(Event.participant_id == str(participant_id))
    if severity:
        query = query.filter(Event.severity.in_(severity))
    if event_type:
        query = query.filter(Event.event_type.in_(event_type))
    if start_time:
        query = query.filter(Event.timestamp >= start_time)
    if end_time:
        query = query.filter(Event.timestamp <= end_time)

    if sort_desc:
        query = query.order_by(desc(Event.timestamp))
    else:
        query = query.order_by(Event.timestamp)

    return query.offset(skip).limit(limit).all()


def get_events_count(
    db: Session,
    exam_id=None,
    participant_id=None,
    severity: Optional[List[EventSeverity]] = None,
    event_type: Optional[List[EventType]] = None
) -> int:
    query = db.query(func.count(Event.event_id))

    if exam_id:
        query = query.filter(Event.exam_id == str(exam_id))
    if participant_id:
        query = query.filter(Event.participant_id == str(participant_id))
    if severity:
        query = query.filter(Event.severity.in_(severity))
    if event_type:
        query = query.filter(Event.event_type.in_(event_type))

    return query.scalar()


def get_event(db: Session, event_id) -> Optional[Event]:
    return db.query(Event).filter(Event.event_id == str(event_id)).first()


def review_event(db: Session, event_id, review: EventReviewRequest, reviewer: str) -> Optional[Event]:
    event = get_event(db, event_id)
    if not event:
        return None

    event.human_reviewed = review.reviewed
    event.review_notes = review.review_notes
    event.reviewed_by = reviewer
    event.reviewed_at = utcnow()

    if review.severity_override:
        event.severity = review.severity_override

    db.commit()
    db.refresh(event)
    return event


def get_exam_analytics(db: Session, exam_id) -> Dict[str, Any]:
    """Get computed analytics for an exam."""
    exam_id = str(exam_id)
    ensure_exam_participants_seeded(db, exam_id)
    db_exam = get_exam(db, exam_id)

    # Summary stats
    enrolled_count = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id
    ).scalar() or 0
    total_students = max(enrolled_count, db_exam.num_students if db_exam else 0)

    checked_in = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.status == ParticipantStatus.CHECKED_IN
    ).scalar() or 0

    active_tracks = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.current_track_id != None
    ).scalar() or 0

    if checked_in > total_students:
        total_students = checked_in
    if active_tracks == 0 and checked_in > 0:
        active_tracks = checked_in

    total_events = db.query(func.count(Event.event_id)).filter(Event.exam_id == exam_id).scalar()
    high_severity = db.query(func.count(Event.event_id)).filter(
        Event.exam_id == exam_id, Event.severity == EventSeverity.HIGH
    ).scalar()
    medium_severity = db.query(func.count(Event.event_id)).filter(
        Event.exam_id == exam_id, Event.severity == EventSeverity.MEDIUM
    ).scalar()
    low_severity = db.query(func.count(Event.event_id)).filter(
        Event.exam_id == exam_id, Event.severity == EventSeverity.LOW
    ).scalar()

    # Top violations
    violation_stats = db.query(
        Event.event_type,
        func.count(Event.event_id).label('count')
    ).filter(Event.exam_id == exam_id).group_by(Event.event_type).all()

    top_violations = [
        {"type": vt.value, "count": count, "percentage": round(count/total_events*100, 1) if total_events > 0 else 0}
        for vt, count in violation_stats
    ]

    # Flagged students (high risk)
    flagged = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.risk_score > 70
    ).scalar() or 0

    # Risk distribution
    risk_low = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.risk_score <= 30
    ).scalar() or 0
    risk_medium = db.query(func.count(Participant.participant_id)).filter(
        Participant.exam_id == exam_id,
        Participant.risk_score > 30,
        Participant.risk_score <= 70
    ).scalar() or 0

    # Engagement distribution (based on events per participant)
    participant_event_counts = db.query(
        Event.participant_id,
        func.count(Event.event_id).label('event_count')
    ).filter(Event.exam_id == exam_id).group_by(Event.participant_id).all()

    engagement_high = sum(1 for _, count in participant_event_counts if count <= 3)
    engagement_medium = sum(1 for _, count in participant_event_counts if 4 <= count <= 10)
    engagement_low = sum(1 for _, count in participant_event_counts if count > 10)

    return {
        "total_students": total_students or 0,
        "checked_in": checked_in or 0,
        "active_tracks": checked_in or 0,
        "total_events": total_events or 0,
        "high_severity_events": high_severity or 0,
        "medium_severity_events": medium_severity or 0,
        "low_severity_events": low_severity or 0,
        "flagged_students_count": flagged,
        "top_violations": top_violations,
        "engagement_distribution": {
            "high": engagement_high,
            "medium": engagement_medium,
            "low": engagement_low
        },
        "risk_distribution": {
            "low": risk_low,
            "medium": risk_medium,
            "high": flagged
        }
    }


def get_participant_analytics(db: Session, participant_id) -> Optional[Dict[str, Any]]:
    participant = get_participant(db, participant_id)
    if not participant:
        return None

    events = db.query(Event).filter(Event.participant_id == str(participant_id)).all()

    total = len(events)
    high = sum(1 for e in events if e.severity == EventSeverity.HIGH)
    medium = sum(1 for e in events if e.severity == EventSeverity.MEDIUM)
    low = sum(1 for e in events if e.severity == EventSeverity.LOW)

    engagement = max(0, 100 - (high * 20 + medium * 10 + low * 2))
    risk = min(100, high * 20 + medium * 10 + low * 2)

    exam_duration = 0.0
    if participant.check_in_time and participant.check_out_time:
        exam_duration = (participant.check_out_time - participant.check_in_time).total_seconds() / 60

    return {
        "exam_id": str(participant.exam_id),
        "roll_number": participant.roll_number,
        "name": participant.name,
        "check_in_time": participant.check_in_time,
        "check_out_time": participant.check_out_time,
        "exam_duration_minutes": exam_duration,
        "total_events": total,
        "high_severity_events": high,
        "medium_severity_events": medium,
        "low_severity_events": low,
        "engagement_score": engagement,
        "risk_score": risk,
        "events": [
            {
                "event_id": str(e.event_id),
                "event_type": e.event_type.value,
                "severity": e.severity.value,
                "timestamp": e.timestamp,
                "description": e.description
            }
            for e in events
        ]
    }


# --- User & Authentication CRUD ---

def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.user_id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, user: UserCreate, hashed_password: str) -> User:
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=user.role,
        assigned_exam_id=user.assigned_exam_id,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def list_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).order_by(desc(User.created_at)).offset(skip).limit(limit).all()


def update_user(
    db: Session,
    user_id: str,
    user_update: UserUpdate,
    hashed_password: Optional[str] = None
) -> Optional[User]:
    user = get_user_by_id(db, user_id)
    if not user:
        return None

    if user_update.email is not None:
        user.email = user_update.email
    if user_update.role is not None:
        user.role = user_update.role
    if user_update.assigned_exam_id is not None:
        user.assigned_exam_id = user_update.assigned_exam_id
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if hashed_password is not None:
        user.hashed_password = hashed_password

    db.commit()
    db.refresh(user)
    return user


# --- Pending High-Stakes Action CRUD ---

def create_pending_action(
    db: Session,
    action_type: str,
    target_id: str,
    payload: Optional[str],
    requested_by: str
) -> PendingAction:
    action = PendingAction(
        action_type=action_type,
        target_id=target_id,
        payload=payload,
        requested_by=requested_by,
        status=ActionStatus.PENDING
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


def get_pending_action(db: Session, action_id: str) -> Optional[PendingAction]:
    return db.query(PendingAction).filter(PendingAction.id == action_id).first()


def list_pending_actions(db: Session, status: Optional[ActionStatus] = None) -> List[PendingAction]:
    query = db.query(PendingAction)
    if status is not None:
        query = query.filter(PendingAction.status == status)
    return query.order_by(desc(PendingAction.created_at)).all()


def resolve_pending_action(
    db: Session,
    action_id: str,
    approved: bool,
    approved_by: str
) -> Optional[PendingAction]:
    action = get_pending_action(db, action_id)
    if not action or action.status != ActionStatus.PENDING:
        return None

    action.status = ActionStatus.APPROVED if approved else ActionStatus.REJECTED
    action.approved_by = approved_by
    action.resolved_at = utcnow()
    db.commit()
    db.refresh(action)
    return action