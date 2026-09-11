import time
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from collections import defaultdict
from enum import Enum

from app.services.mediapipe_analyzer import FaceAnalysis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class MoondreamAnalysis:
    suspicious_indicators: List[Any] = field(default_factory=list)
    confidence: float = 0.0
    activity: str = ""
    detected_objects: List[str] = field(default_factory=list)


def _indicator_matches(ind: Any, target_types: List[str]) -> bool:
    """Safely check if an indicator matches target types whether ind is dict, str, or object."""
    if isinstance(ind, dict):
        return ind.get('type') in target_types
    if isinstance(ind, str):
        return ind in target_types
    if hasattr(ind, 'type'):
        return getattr(ind, 'type') in target_types
    return False


def _indicator_desc(ind: Any) -> str:
    """Safely extract description from indicator."""
    if isinstance(ind, dict):
        return str(ind.get('description', ''))
    if hasattr(ind, 'description'):
        return str(getattr(ind, 'description', ''))
    return ''


class AlertSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlertType(str, Enum):
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


@dataclass
class Alert:
    alert_type: AlertType
    severity: AlertSeverity
    track_id: int
    participant_id: Optional[str]
    camera_id: int
    timestamp: float
    description: str
    confidence: float
    details: Dict[str, Any] = field(default_factory=dict)
    cooldown_key: str = ""


@dataclass
class ViolationState:
    """Track violation state for cooldown and escalation."""
    count: int = 0
    first_seen: float = 0
    last_alerted: float = 0
    consecutive_frames: int = 0
    max_consecutive: int = 0
    escalated: bool = False


class AnomalyDetector:
    """
    Rule-based anomaly detection engine combining:
    - MediaPipe gaze/pose analysis
    - Moondream VLM behavior analysis
    - Audio anomaly detection
    - Statistical outlier detection
    """

    def __init__(self):
        self.violation_history: Dict[int, Dict[str, ViolationState]] = defaultdict(dict)
        self.alert_cooldown = 30.0  # seconds
        self.frame_history_size = 30  # frames for temporal analysis

        # Thresholds from config
        self.gaze_deviation_frames = settings.GAZE_DEVIATION_THRESHOLD_FRAMES
        self.gaze_deviation_angle = settings.GAZE_DEVIATION_ANGLE
        self.hand_face_proximity = settings.HAND_FACE_PROXIMITY_THRESHOLD
        self.hand_face_consecutive = settings.HAND_FACE_CONSECUTIVE_FRAMES
        self.head_pose_extreme = settings.HEAD_POSE_EXTREME_ANGLE
        self.head_pose_duration = settings.HEAD_POSE_FRAME_DURATION
        self.posture_bend_threshold = settings.POSTURE_BEND_ANGLE_THRESHOLD
        self.posture_duration = settings.POSTURE_DURATION_THRESHOLD
        self.audio_threshold_db = settings.AUDIO_ANOMALY_THRESHOLD_DB
        self.audio_duration = settings.AUDIO_ANOMALY_DURATION_SECONDS

        # Track baselines for adaptive thresholds
        self.baselines: Dict[int, Dict[str, float]] = {}

    def analyze(
        self,
        track_id: int,
        face_analysis: Optional[FaceAnalysis],
        moondream_analysis: Optional[MoondreamAnalysis],
        audio_level_db: Optional[float] = None,
        person_bbox: Optional[List[int]] = None,
        frame_number: int = 0,
        other_tracks: Optional[Dict[int, List[int]]] = None
    ) -> List[Alert]:
        """
        Run all anomaly detection rules and return alerts.

        Args:
            track_id: Unique track identifier
            face_analysis: MediaPipe face analysis results
            moondream_analysis: VLM behavior analysis
            audio_level_db: Current audio level in dB
            person_bbox: Person bounding box
            frame_number: Current frame number
            other_tracks: Mapping of other track IDs to their bounding boxes for spatial correlation

        Returns:
            List of generated alerts
        """
        alerts = []
        current_time = time.time()

        # Initialize track state
        if track_id not in self.violation_history:
            self.violation_history[track_id] = {}

        track_state = self.violation_history[track_id]

        # Rule 1: Phone Detection (hand near face + downward gaze + VLM)
        phone_alert = self._check_phone_detection(
            track_id, track_state, face_analysis, moondream_analysis,
            person_bbox, current_time
        )
        if phone_alert:
            alerts.append(phone_alert)

        # Rule 2: Cheat Sheet (looking away + hand movement + VLM)
        cheat_alert = self._check_cheat_sheet(
            track_id, track_state, face_analysis, moondream_analysis,
            current_time
        )
        if cheat_alert:
            alerts.append(cheat_alert)

        # Rule 3: Communication (head turned + mouth movement)
        comm_alert = self._check_communication(
            track_id, track_state, face_analysis, moondream_analysis,
            current_time
        )
        if comm_alert:
            alerts.append(comm_alert)

        # Rule 4a: Spatial Neighbor Peeking (Rubbernecking towards adjacent candidate's desk/paper)
        peeking_alert = self._check_neighbor_peeking(
            track_id, track_state, face_analysis, moondream_analysis,
            person_bbox, other_tracks, current_time
        )
        if peeking_alert:
            alerts.append(peeking_alert)

        # Rule 4b: Sustained Gaze Away (general gaze away, only if not already flagged for specific neighbor peeking)
        if not peeking_alert:
            gaze_alert = self._check_sustained_gaze_away(
                track_id, track_state, face_analysis, current_time
            )
            if gaze_alert:
                alerts.append(gaze_alert)

        # Rule 5: Abnormal Posture (torso bend > threshold)
        posture_alert = self._check_abnormal_posture(
            track_id, track_state, face_analysis, person_bbox,
            current_time
        )
        if posture_alert:
            alerts.append(posture_alert)

        # Rule 6: Face Obscured (no face detected)
        face_alert = self._check_face_obscured(
            track_id, track_state, face_analysis, current_time
        )
        if face_alert:
            alerts.append(face_alert)

        # Rule 7: Audio Anomaly
        audio_alert = self._check_audio_anomaly(
            track_id, track_state, audio_level_db, current_time
        )
        if audio_alert:
            alerts.append(audio_alert)

        # Rule 8: Unauthorized Items (from VLM)
        item_alert = self._check_unauthorized_items(
            track_id, track_state, moondream_analysis, current_time
        )
        if item_alert:
            alerts.append(item_alert)

        # Update violation states
        self._update_violation_states(track_id, track_state, alerts, current_time)

        return alerts

    def _check_phone_detection(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        moondream_analysis: Optional[MoondreamAnalysis],
        person_bbox: Optional[List[int]],
        current_time: float
    ) -> Optional[Alert]:
        """Detect phone usage: hand near face + downward gaze + VLM confirmation."""
        state = track_state.get("phone", ViolationState())

        phone_detected = False
        confidence = 0.0
        details = {}

        # Check VLM for phone
        vlm_phone = False
        if moondream_analysis:
            for ind in moondream_analysis.suspicious_indicators:
                if _indicator_matches(ind, ['PHONE_DETECTED', 'PHONE_USE']):
                    vlm_phone = True
                    confidence = max(confidence, moondream_analysis.confidence)
                    details['vlm_reasoning'] = _indicator_desc(ind)

        # Check gaze direction
        gaze_down = False
        if face_analysis and face_analysis.gaze_direction == "DOWN":
            gaze_down = True
            confidence = max(confidence, face_analysis.gaze_confidence)

        # Check hand position (simplified - would need hand landmarks)
        hand_near_face = False
        # This would need MediaPipe hands integration

        # Combined logic: VLM phone detection OR (gaze down + hand near face for N frames)
        if vlm_phone:
            phone_detected = True
            state.consecutive_frames += 1
        elif gaze_down and hand_near_face:
            state.consecutive_frames += 1
            if state.consecutive_frames >= self.hand_face_consecutive:
                phone_detected = True
        else:
            state.consecutive_frames = 0

        if phone_detected and self._should_alert(track_id, "phone", state, current_time):
            alert = Alert(
                alert_type=AlertType.PHONE_DETECTED,
                severity=AlertSeverity.HIGH,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description="Phone usage detected: hand near face with downward gaze",
                confidence=confidence,
                details=details,
                cooldown_key=f"phone_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            return alert

        track_state["phone"] = state
        return None

    def _check_cheat_sheet(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        moondream_analysis: Optional[MoondreamAnalysis],
        current_time: float
    ) -> Optional[Alert]:
        """Detect cheat sheet: looking away from exam + hand movement + VLM."""
        state = track_state.get("cheat_sheet", ViolationState())

        cheat_detected = False
        confidence = 0.0
        details = {}

        # VLM detection
        vlm_cheat = False
        if moondream_analysis:
            for ind in moondream_analysis.suspicious_indicators:
                if _indicator_matches(ind, ['CHEAT_SHEET', 'UNAUTHORIZED_MATERIAL']):
                    vlm_cheat = True
                    confidence = max(confidence, moondream_analysis.confidence)
                    details['vlm_reasoning'] = _indicator_desc(ind)

        # Gaze away from desk
        gaze_away = False
        if face_analysis and face_analysis.gaze_direction in ["LEFT", "RIGHT", "UP"]:
            gaze_away = True
            confidence = max(confidence, face_analysis.gaze_confidence)

        # Head pose extreme
        head_extreme = False
        if face_analysis and face_analysis.head_pose:
            yaw = abs(face_analysis.head_pose.get('yaw', 0))
            if yaw > self.head_pose_extreme:
                head_extreme = True

        if vlm_cheat or (gaze_away and head_extreme):
            cheat_detected = True
            state.consecutive_frames += 1
        else:
            state.consecutive_frames = 0

        if cheat_detected and self._should_alert(track_id, "cheat_sheet", state, current_time):
            alert = Alert(
                alert_type=AlertType.CHEAT_SHEET,
                severity=AlertSeverity.HIGH,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description="Cheat sheet or unauthorized material detected",
                confidence=confidence,
                details=details,
                cooldown_key=f"cheat_sheet_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            return alert

        track_state["cheat_sheet"] = state
        return None

    def _check_communication(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        moondream_analysis: Optional[MoondreamAnalysis],
        current_time: float
    ) -> Optional[Alert]:
        """Detect communication: head turned + mouth movement."""
        state = track_state.get("communication", ViolationState())

        comm_detected = False
        confidence = 0.0
        details = {}

        # VLM detection
        vlm_comm = False
        if moondream_analysis:
            for ind in moondream_analysis.suspicious_indicators:
                if _indicator_matches(ind, ['COMMUNICATION', 'TALKING']):
                    vlm_comm = True
                    confidence = max(confidence, moondream_analysis.confidence)

        # Head turned significantly
        head_turned = False
        if face_analysis and face_analysis.head_pose:
            yaw = abs(face_analysis.head_pose.get('yaw', 0))
            if yaw > 30:  # Lower threshold for communication
                head_turned = True

        # Mouth movement would need face mesh analysis
        # Simplified: if head turned and VLM says talking
        if vlm_comm or (head_turned and moondream_analysis and moondream_analysis.activity == "TALKING"):
            comm_detected = True
            state.consecutive_frames += 1
        else:
            state.consecutive_frames = 0

        if comm_detected and self._should_alert(track_id, "communication", state, current_time):
            alert = Alert(
                alert_type=AlertType.COMMUNICATION,
                severity=AlertSeverity.MEDIUM,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description="Possible communication detected: head turned with mouth movement",
                confidence=confidence,
                details=details,
                cooldown_key=f"communication_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            return alert

        track_state["communication"] = state
        return None

    def _check_sustained_gaze_away(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        current_time: float
    ) -> Optional[Alert]:
        """Detect sustained gaze away from exam materials."""
        state = track_state.get("gaze_away", ViolationState())

        gaze_away = False
        # DOWN is looking down at exam paper/desk; only LEFT, RIGHT, UP or extreme yaw is looking away
        if face_analysis:
            yaw = abs(face_analysis.head_pose.get('yaw', 0)) if face_analysis.head_pose else 0
            if face_analysis.gaze_direction in ["LEFT", "RIGHT", "UP"] or yaw > 30:
                gaze_away = True
                state.consecutive_frames += 1
            else:
                state.consecutive_frames = 0
        else:
            state.consecutive_frames = 0

        # Alert if gaze away for > threshold frames (~10 seconds at 30fps = 300 frames)
        if gaze_away and state.consecutive_frames >= self.gaze_deviation_frames:
            if self._should_alert(track_id, "gaze_away", state, current_time):
                alert = Alert(
                    alert_type=AlertType.LOOKING_AWAY,
                    severity=AlertSeverity.MEDIUM,
                    track_id=track_id,
                    participant_id=None,
                    camera_id=0,
                    timestamp=current_time,
                    description=f"Sustained gaze away from exam for {state.consecutive_frames/30:.1f}s",
                    confidence=face_analysis.gaze_confidence if face_analysis else 0.5,
                    details={
                        "gaze_direction": face_analysis.gaze_direction if face_analysis else "UNKNOWN",
                        "duration_frames": state.consecutive_frames
                    },
                    cooldown_key=f"gaze_away_{track_id}"
                )
                state.last_alerted = current_time
                if state.first_seen == 0:
                    state.first_seen = current_time
                return alert

        track_state["gaze_away"] = state
        return None

    def _check_neighbor_peeking(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        moondream_analysis: Optional[MoondreamAnalysis],
        person_bbox: Optional[List[int]],
        other_tracks: Optional[Dict[int, List[int]]],
        current_time: float
    ) -> Optional[Alert]:
        """
        Detect directional neighbor peeking (rubbernecking onto adjacent desk/paper).
        Correlates candidate head yaw and gaze vector towards neighboring desk positions,
        with optional VLM confirmation.
        """
        state = track_state.get("neighbor_peeking", ViolationState())

        if not face_analysis or not person_bbox or not other_tracks:
            state.consecutive_frames = 0
            track_state["neighbor_peeking"] = state
            return None

        # Candidate centroid & geometry
        c_x = (person_bbox[0] + person_bbox[2]) / 2.0
        c_y = (person_bbox[1] + person_bbox[3]) / 2.0
        c_w = max(person_bbox[2] - person_bbox[0], 1)

        yaw = face_analysis.head_pose.get('yaw', 0.0) if face_analysis.head_pose else 0.0
        pitch = face_analysis.head_pose.get('pitch', 0.0) if face_analysis.head_pose else 0.0
        gaze = face_analysis.gaze_direction

        # Plausible neighbor distance in exam halls: up to 3.5x person bounding box width
        max_dist = c_w * 3.5

        target_neighbor_id = None
        target_neighbor_bbox = None
        peeking_direction = None
        aligned_yaw = 0.0

        for n_id, n_bbox in other_tracks.items():
            n_x = (n_bbox[0] + n_bbox[2]) / 2.0
            n_y = (n_bbox[1] + n_bbox[3]) / 2.0
            dx = n_x - c_x
            dy = abs(n_y - c_y)

            # Check if neighbor is roughly in the same or adjacent row
            if dy > (person_bbox[3] - person_bbox[1]):
                continue

            dist = abs(dx)
            if dist > max_dist:
                continue

            # Neighbor is to the RIGHT (dx > 0)
            if dx > 0 and (yaw > 22.0 or gaze == "RIGHT"):
                target_neighbor_id = n_id
                target_neighbor_bbox = n_bbox
                peeking_direction = "RIGHT"
                aligned_yaw = yaw
                break

            # Neighbor is to the LEFT (dx < 0)
            elif dx < 0 and (yaw < -22.0 or gaze == "LEFT"):
                target_neighbor_id = n_id
                target_neighbor_bbox = n_bbox
                peeking_direction = "LEFT"
                aligned_yaw = abs(yaw)
                break

        # Check VLM peeking confirmation
        vlm_peeking = False
        vlm_reasoning = ""
        vlm_confidence = 0.0
        if moondream_analysis:
            for ind in moondream_analysis.suspicious_indicators:
                if _indicator_matches(ind, ['PEEKING_NEIGHBOR_PAPER', 'PEEKING', 'CHEAT_SHEET']):
                    vlm_peeking = True
                    vlm_reasoning = _indicator_desc(ind)
                    vlm_confidence = max(vlm_confidence, moondream_analysis.confidence)

        # Candidate is flagged if:
        # 1. Head/gaze aligned toward neighbor desk for >= 16 consecutive frames (~1.6s)
        # 2. OR VLM confirms peeking alongside directional alignment
        is_peeking = False
        if target_neighbor_id is not None:
            state.consecutive_frames += 1
            if vlm_peeking:
                is_peeking = True
            elif state.consecutive_frames >= 16:
                is_peeking = True
        else:
            state.consecutive_frames = 0

        if is_peeking and self._should_alert(track_id, "neighbor_peeking", state, current_time):
            confidence = max(0.78, vlm_confidence if vlm_peeking else 0.85)
            desc = f"Candidate turned head {aligned_yaw:.0f}° {peeking_direction} peeking at neighbor's desk (Track #{target_neighbor_id})"
            if vlm_reasoning:
                desc += f" [VLM Verified: {vlm_reasoning}]"

            alert = Alert(
                alert_type=AlertType.PEEKING_NEIGHBOR_PAPER,
                severity=AlertSeverity.HIGH if (vlm_peeking or aligned_yaw > 35.0) else AlertSeverity.MEDIUM,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description=desc,
                confidence=confidence,
                details={
                    "neighbor_track_id": target_neighbor_id,
                    "neighbor_bbox": target_neighbor_bbox,
                    "direction": peeking_direction,
                    "yaw_angle": round(aligned_yaw, 1),
                    "pitch_angle": round(pitch, 1),
                    "vlm_confirmed": vlm_peeking,
                    "vlm_reasoning": vlm_reasoning,
                    "person_bbox": person_bbox
                },
                cooldown_key=f"neighbor_peeking_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            track_state["neighbor_peeking"] = state
            return alert

        track_state["neighbor_peeking"] = state
        return None

    def _check_abnormal_posture(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        person_bbox: Optional[List[int]],
        current_time: float
    ) -> Optional[Alert]:
        """Detect abnormal posture: excessive torso bend."""
        state = track_state.get("posture", ViolationState())

        # Simplified: use head pitch as proxy for posture
        # Real implementation would need full body pose
        posture_violation = False
        confidence = 0.0
        details = {}

        if face_analysis and face_analysis.head_pose:
            pitch = face_analysis.head_pose.get('pitch', 0)
            if abs(pitch) > self.posture_bend_threshold:
                posture_violation = True
                confidence = min(1.0, abs(pitch) / 90.0)
                state.consecutive_frames += 1
                details['pitch'] = pitch
            else:
                state.consecutive_frames = 0

        if posture_violation and state.consecutive_frames >= self.posture_duration:
            if self._should_alert(track_id, "posture", state, current_time):
                alert = Alert(
                    alert_type=AlertType.ABNORMAL_POSTURE,
                    severity=AlertSeverity.LOW,
                    track_id=track_id,
                    participant_id=None,
                    camera_id=0,
                    timestamp=current_time,
                    description=f"Abnormal posture detected: head pitch {details.get('pitch', 0):.1f}°",
                    confidence=confidence,
                    details=details,
                    cooldown_key=f"posture_{track_id}"
                )
                state.last_alerted = current_time
                if state.first_seen == 0:
                    state.first_seen = current_time
                return alert

        track_state["posture"] = state
        return None

    def _check_face_obscured(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        face_analysis: Optional[FaceAnalysis],
        current_time: float
    ) -> Optional[Alert]:
        """Detect face obscured: no face detected for >3 seconds."""
        state = track_state.get("face_obscured", ViolationState())

        face_missing = face_analysis is None or not face_analysis.face_detected

        if face_missing:
            state.consecutive_frames += 1
        else:
            state.consecutive_frames = 0

        # Alert if face missing for > 3 seconds (90 frames at 30fps)
        if face_missing and state.consecutive_frames >= 90:
            if self._should_alert(track_id, "face_obscured", state, current_time):
                alert = Alert(
                    alert_type=AlertType.FACE_OBSCURED,
                    severity=AlertSeverity.HIGH,
                    track_id=track_id,
                    participant_id=None,
                    camera_id=0,
                    timestamp=current_time,
                    description=f"Face not detected for {state.consecutive_frames/30:.1f}s",
                    confidence=0.9,
                    details={"missing_frames": state.consecutive_frames},
                    cooldown_key=f"face_obscured_{track_id}"
                )
                state.last_alerted = current_time
                if state.first_seen == 0:
                    state.first_seen = current_time
                return alert

        track_state["face_obscured"] = state
        return None

    def _check_audio_anomaly(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        audio_level_db: Optional[float],
        current_time: float
    ) -> Optional[Alert]:
        """Detect audio anomalies: sustained loud noise."""
        state = track_state.get("audio", ViolationState())

        if audio_level_db is None:
            return None

        anomaly = False
        if audio_level_db > self.audio_threshold_db:
            state.consecutive_frames += 1
            # Duration check: frames * frame_time >= audio_duration
            frame_time = 1/30  # 30 FPS
            if state.consecutive_frames * frame_time >= self.audio_duration:
                anomaly = True
        else:
            state.consecutive_frames = 0

        if anomaly and self._should_alert(track_id, "audio", state, current_time):
            alert = Alert(
                alert_type=AlertType.AUDIO_ANOMALY,
                severity=AlertSeverity.MEDIUM,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description=f"Audio anomaly: sustained {audio_level_db:.1f}dB for {state.consecutive_frames/30:.1f}s",
                confidence=min(1.0, audio_level_db / 100.0),
                details={"audio_level_db": audio_level_db, "duration_frames": state.consecutive_frames},
                cooldown_key=f"audio_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            return alert

        track_state["audio"] = state
        return None

    def _check_unauthorized_items(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        moondream_analysis: Optional[MoondreamAnalysis],
        current_time: float
    ) -> Optional[Alert]:
        """Detect unauthorized items from VLM."""
        state = track_state.get("unauthorized_item", ViolationState())

        item_detected = False
        confidence = 0.0
        details: Dict[str, Any] = {}

        if moondream_analysis:
            allowed_items = {"pen", "pencil", "paper", "exam_paper", "calculator", "eraser", "ruler", "desk", "chair"}
            detected = set(moondream_analysis.detected_objects)
            unauthorized = detected - allowed_items

            # VLM indicator path (works when detected_objects is empty, e.g. keyword fallback)
            for ind in moondream_analysis.suspicious_indicators:
                if _indicator_matches(ind, ['EARBUDS', 'HEADPHONE', 'EARPHONE', 'HEADSET']):
                    unauthorized.add('earbuds/headphones')
                    details['earbuds'] = True

            if unauthorized:
                item_detected = True
                confidence = moondream_analysis.confidence
                details['unauthorized_items'] = list(unauthorized)
                details['all_items'] = list(detected)

        if item_detected and self._should_alert(track_id, "unauthorized_item", state, current_time):
            items_found = details.get('unauthorized_items')
            items_str = ', '.join(items_found) if isinstance(items_found, list) else str(items_found or "")
            alert = Alert(
                alert_type=AlertType.UNAUTHORIZED_ITEM,
                severity=AlertSeverity.HIGH,
                track_id=track_id,
                participant_id=None,
                camera_id=0,
                timestamp=current_time,
                description=f"Unauthorized item detected: {items_str}",
                confidence=confidence,
                details=details,
                cooldown_key=f"unauthorized_item_{track_id}"
            )
            state.last_alerted = current_time
            if state.first_seen == 0:
                state.first_seen = current_time
            return alert

        track_state["unauthorized_item"] = state
        return None

    def _should_alert(
        self,
        track_id: int,
        rule_name: str,
        state: ViolationState,
        current_time: float
    ) -> bool:
        """Check if alert should be fired (cooldown + escalation)."""
        # Cooldown check
        if state.last_alerted > 0:
            if current_time - state.last_alerted < self.alert_cooldown:
                return False

        # Escalation: increase severity on repeated violations
        if state.count > 0:
            state.escalated = True

        state.count += 1
        return True

    def _update_violation_states(
        self,
        track_id: int,
        track_state: Dict[str, ViolationState],
        alerts: List[Alert],
        current_time: float
    ):
        """Update violation states after alert generation."""
        # Reset consecutive frames for rules that didn't trigger
        for rule_name, state in track_state.items():
            alerted = any(a.cooldown_key.startswith(f"{rule_name}_") for a in alerts)
            if not alerted and state.consecutive_frames > 0:
                # Decay consecutive frames if not alerting
                pass  # Keep counting for sustained violations

    def get_track_stats(self, track_id: int) -> Dict[str, Any]:
        """Get violation statistics for a track."""
        if track_id not in self.violation_history:
            return {}

        stats = {}
        for rule_name, state in self.violation_history[track_id].items():
            stats[rule_name] = {
                "total_violations": state.count,
                "consecutive_frames": state.consecutive_frames,
                "first_seen": state.first_seen,
                "last_alerted": state.last_alerted,
                "escalated": state.escalated
            }
        return stats

    def reset_track(self, track_id: int):
        """Reset violation history for a track."""
        if track_id in self.violation_history:
            del self.violation_history[track_id]