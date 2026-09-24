import cv2
import numpy as np
import time
import logging
import os
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

try:
    import mediapipe as mp
    from mediapipe import Image, ImageFormat
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logger.warning("MediaPipe tasks not available")


@dataclass
class FaceAnalysis:
    face_detected: bool = False
    bbox: Optional[List[int]] = None
    landmarks: Optional[List[List[float]]] = None
    landmarks_3d: Optional[List[List[float]]] = None
    gaze_direction: str = "CENTER"
    gaze_screen_x: float = 50.0
    gaze_screen_y: float = 50.0
    gaze_confidence: float = 0.0
    gaze_yaw: float = 0.0
    gaze_pitch: float = 0.0
    gaze_vector_3d: Optional[Tuple[float, float, float]] = None
    head_pose: Dict[str, Any] = field(default_factory=dict)
    left_eye_landmarks: Optional[List[List[float]]] = None
    right_eye_landmarks: Optional[List[List[float]]] = None
    left_iris_center: Optional[Tuple[float, float]] = None
    right_iris_center: Optional[Tuple[float, float]] = None


class MediaPipeAnalyzer:
    LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
    RIGHT_EYE_INDICES = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
    LEFT_IRIS_INDICES = [474, 475, 476, 477]
    RIGHT_IRIS_INDICES = [469, 470, 471, 472]
    NOSE_TIP = 1
    CHIN = 152
    LEFT_EYE_LEFT = 33
    LEFT_EYE_RIGHT = 133
    RIGHT_EYE_LEFT = 362
    RIGHT_EYE_RIGHT = 263
    LEFT_MOUTH = 61
    RIGHT_MOUTH = 291
    FACE_MESH_CONNECTIONS = [
        (10, 33), (33, 61), (61, 199), (199, 433), (433, 58), (58, 10),
        (61, 146), (146, 91), (91, 181), (181, 84), (84, 17), (17, 314),
        (314, 405), (405, 321), (321, 375), (375, 288), (288, 397), (397, 365),
        (365, 379), (379, 378), (378, 400), (400, 377), (377, 152), (152, 148),
        (148, 176), (176, 149), (149, 150), (150, 136), (136, 172), (172, 58),
        (136, 168), (168, 169), (169, 160), (160, 161), (161, 164), (164, 267),
        (267, 269), (269, 270), (270, 291), (291, 308), (308, 282), (282, 276),
        (276, 283), (283, 284), (284, 300), (300, 293), (293, 333), (333, 340),
        (340, 349), (349, 356), (356, 282), (282, 294), (294, 306), (306, 297),
        (297, 288), (288, 298), (298, 305), (305, 304), (304, 283), (304, 284),
        (284, 342), (342, 250), (250, 382), (382, 381), (381, 380), (380, 374),
        (374, 373), (373, 390), (390, 249), (249, 263), (263, 466), (466, 388),
        (388, 387), (387, 386), (386, 385), (385, 398), (398, 466),
    ]

    def __init__(
        self,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        max_num_faces: int = 5
    ):
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence
        self.max_num_faces = max_num_faces
        self.face_landmarker = None
        self.face_detector = None
        self.running_mode = vision.RunningMode.VIDEO
        if MEDIAPIPE_AVAILABLE:
            self._initialize_models()

    def _initialize_models(self):
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            model_path = os.path.join(base_dir, "models", "face_landmarker.task")
            face_landmarker_options = vision.FaceLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=model_path),
                running_mode=self.running_mode,
                num_faces=self.max_num_faces,
                min_face_detection_confidence=self.min_detection_confidence,
                min_tracking_confidence=self.min_tracking_confidence,
            )
            self.face_landmarker = vision.FaceLandmarker.create_from_options(face_landmarker_options)
            logger.info("MediaPipe FaceLandmarker initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize MediaPipe face models: {e}")
            self.face_landmarker = None

    MODEL_POINTS_3D = np.array([
        (0.0, 0.0, 0.0),             # Nose tip (index 1)
        (0.0, -330.0, -65.0),        # Chin (index 152)
        (-225.0, 170.0, -135.0),     # Left eye left corner (index 33)
        (225.0, 170.0, -135.0),      # Right eye right corner (index 263)
        (-150.0, -150.0, -125.0),    # Left Mouth corner (index 61)
        (150.0, -150.0, -125.0)      # Right mouth corner (index 291)
    ], dtype=np.float64)

    def analyze(
        self,
        frame: np.ndarray,
        person_bbox: Optional[List[int]] = None
    ) -> FaceAnalysis:
        if not MEDIAPIPE_AVAILABLE or self.face_landmarker is None:
            return FaceAnalysis(face_detected=False)

        h, w = frame.shape[:2]

        # Crop to person region with margin (avoids face-landmarker on full frame)
        if person_bbox:
            bx1, by1, bx2, by2 = person_bbox
            margin_x = int((bx2 - bx1) * 0.3)
            margin_y = int((by2 - by1) * 0.4)
            cx1 = max(0, bx1 - margin_x)
            cy1 = max(0, by1 - margin_y)
            cx2 = min(w, bx2 + margin_x)
            cy2 = min(h, by2 + margin_y)
            crop = frame[cy1:cy2, cx1:cx2]
            rgb_frame = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            offset_x, offset_y = cx1, cy1
            crop_h, crop_w = crop.shape[:2]
        else:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            offset_x, offset_y = 0, 0
            crop_w, crop_h = w, h

        mp_image = Image(image_format=ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = int(time.time() * 1000)
        try:
            results = self.face_landmarker.detect_for_video(mp_image, timestamp_ms)
        except Exception as e:
            logger.debug(f"Face detection failed: {e}")
            return FaceAnalysis(face_detected=False)

        if not results.face_landmarks:
            return FaceAnalysis(face_detected=False)

        face_landmarks = results.face_landmarks[0]
        landmarks = []
        landmarks_3d = []
        for lm in face_landmarks:
            landmarks.append([lm.x * crop_w + offset_x, lm.y * crop_h + offset_y])
            landmarks_3d.append([lm.x * crop_w + offset_x, lm.y * crop_h + offset_y, lm.z * crop_w])
        landmarks = np.array(landmarks)
        landmarks_3d = np.array(landmarks_3d)
        x_min, y_min = landmarks[:, 0].min(), landmarks[:, 1].min()
        x_max, y_max = landmarks[:, 0].max(), landmarks[:, 1].max()
        face_bbox = [int(x_min), int(y_min), int(x_max), int(y_max)]
        gaze = self._estimate_gaze(landmarks, landmarks_3d, w, h)
        head_pose = self._estimate_head_pose(landmarks, w, h)
        return FaceAnalysis(
            face_detected=True,
            bbox=face_bbox,
            landmarks=landmarks.tolist(),
            landmarks_3d=landmarks_3d.tolist(),
            gaze_direction=gaze["direction"],
            gaze_screen_x=gaze["screen_x"],
            gaze_screen_y=gaze["screen_y"],
            gaze_confidence=gaze["confidence"],
            gaze_yaw=gaze.get("yaw", 0.0),
            gaze_pitch=gaze.get("pitch", 0.0),
            gaze_vector_3d=gaze.get("gaze_vector_3d"),
            head_pose=head_pose,
            left_eye_landmarks=[landmarks[i].tolist() for i in self.LEFT_EYE_INDICES],
            right_eye_landmarks=[landmarks[i].tolist() for i in self.RIGHT_EYE_INDICES],
            left_iris_center=gaze.get("left_iris"),
            right_iris_center=gaze.get("right_iris"),
        )

    def _estimate_head_pose(
        self,
        landmarks: np.ndarray,
        frame_w: int,
        frame_h: int
    ) -> Dict[str, Any]:
        """Estimate 3D head pose (yaw, pitch, roll) using solvePnP."""
        try:
            image_points = np.array([
                landmarks[self.NOSE_TIP],
                landmarks[self.CHIN],
                landmarks[self.LEFT_EYE_LEFT],
                landmarks[self.RIGHT_EYE_RIGHT],
                landmarks[self.LEFT_MOUTH],
                landmarks[self.RIGHT_MOUTH]
            ], dtype=np.float64)

            focal_length = frame_w
            center = (frame_w / 2, frame_h / 2)
            camera_matrix = np.array([
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1]
            ], dtype=np.float64)
            dist_coeffs = np.zeros((4, 1))

            success, rvec, tvec = cv2.solvePnP(
                self.MODEL_POINTS_3D,
                image_points,
                camera_matrix,
                dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            if not success:
                return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "direction": "FORWARD"}

            rmat, _ = cv2.Rodrigues(rvec)
            angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
            pitch = float(angles[0])
            yaw = float(angles[1])
            roll = float(angles[2])

            if yaw > 25:
                direction = "RIGHT"
            elif yaw < -25:
                direction = "LEFT"
            elif pitch > 25:
                direction = "DOWN"
            elif pitch < -25:
                direction = "UP"
            else:
                direction = "FORWARD"

            return {
                "yaw": round(yaw, 2),
                "pitch": round(pitch, 2),
                "roll": round(roll, 2),
                "direction": direction
            }
        except Exception as e:
            logger.debug(f"Head pose estimation error: {e}")
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "direction": "FORWARD"}

    def _estimate_gaze(
        self,
        landmarks: np.ndarray,
        landmarks_3d: Optional[np.ndarray] = None,
        frame_w: int = 1280,
        frame_h: int = 720
    ) -> Dict[str, Any]:
        left_iris = landmarks[self.LEFT_IRIS_INDICES]
        right_iris = landmarks[self.RIGHT_IRIS_INDICES]
        left_iris_center = left_iris.mean(axis=0)
        right_iris_center = right_iris.mean(axis=0)
        left_eye_left = landmarks[self.LEFT_EYE_LEFT]
        left_eye_right = landmarks[self.LEFT_EYE_RIGHT]
        right_eye_left = landmarks[self.RIGHT_EYE_LEFT]
        right_eye_right = landmarks[self.RIGHT_EYE_RIGHT]
        def eye_gaze(iris_center, eye_left, eye_right):
            eye_width = np.linalg.norm(eye_right - eye_left)
            if eye_width < 1:
                return 0.5, 0.5
            to_iris = iris_center - eye_left
            eye_vector = eye_right - eye_left
            x_rel = np.dot(to_iris, eye_vector) / (eye_width ** 2 + 1e-6)
            eye_center = (eye_left + eye_right) / 2
            y_rel = (iris_center[1] - eye_center[1]) / (eye_width * 0.5 + 1e-6)
            return x_rel, y_rel
        left_x, left_y = eye_gaze(left_iris_center, left_eye_left, left_eye_right)
        right_x, right_y = eye_gaze(right_iris_center, right_eye_left, right_eye_right)
        avg_x = (left_x + right_x) / 2
        avg_y = (left_y + right_y) / 2
        screen_x = float(np.clip(avg_x * 100, 0, 100))
        screen_y = float(np.clip(avg_y * 100 + 50, 0, 100))
        if screen_x < 35:
            direction = "LEFT"
        elif screen_x > 65:
            direction = "RIGHT"
        elif screen_y > 70:
            direction = "DOWN"
        elif screen_y < 30:
            direction = "UP"
        else:
            direction = "CENTER"
        confidence = min(1.0, (left_x > 0) + (right_x > 0)) / 2

        # 3D Calibrated Eye Gaze Vector Computation
        yaw_deg = 0.0
        pitch_deg = 0.0
        gaze_vector_3d = (0.0, 0.0, -1.0)
        if landmarks_3d is not None and len(landmarks_3d) > max(self.RIGHT_IRIS_INDICES):
            try:
                # 1. Approximate 3D eyeball centers from inner/outer canthi + anatomical depth offset
                left_3d_corner_l = landmarks_3d[self.LEFT_EYE_LEFT]
                left_3d_corner_r = landmarks_3d[self.LEFT_EYE_RIGHT]
                left_eye_width_3d = np.linalg.norm(left_3d_corner_r - left_3d_corner_l)
                left_eyeball_center = (left_3d_corner_l + left_3d_corner_r) / 2.0
                # MediaPipe z is normalized; offset center slightly inward (+z in camera relative frame)
                left_eyeball_center = left_eyeball_center.copy()
                left_eyeball_center[2] += 0.35 * max(left_eye_width_3d, 1.0)

                right_3d_corner_l = landmarks_3d[self.RIGHT_EYE_LEFT]
                right_3d_corner_r = landmarks_3d[self.RIGHT_EYE_RIGHT]
                right_eye_width_3d = np.linalg.norm(right_3d_corner_r - right_3d_corner_l)
                right_eyeball_center = (right_3d_corner_l + right_3d_corner_r) / 2.0
                right_eyeball_center = right_eyeball_center.copy()
                right_eyeball_center[2] += 0.35 * max(right_eye_width_3d, 1.0)

                # 2. 3D Iris centers
                left_iris_3d = landmarks_3d[self.LEFT_IRIS_INDICES].mean(axis=0)
                right_iris_3d = landmarks_3d[self.RIGHT_IRIS_INDICES].mean(axis=0)

                # 3. Gaze optical vectors: g = p_iris - p_eye_center
                g_left = left_iris_3d - left_eyeball_center
                g_right = right_iris_3d - right_eyeball_center
                g_combined = (g_left + g_right) / 2.0
                norm = np.linalg.norm(g_combined)
                if norm > 1e-6:
                    g_unit = g_combined / norm
                else:
                    g_unit = np.array([0.0, 0.0, -1.0])

                # 4. Gaze pitch and yaw in degrees
                gx, gy, gz = float(g_unit[0]), float(g_unit[1]), float(g_unit[2])
                pitch_deg = float(np.degrees(np.arctan2(-gy, np.sqrt(gx**2 + gz**2))))
                yaw_deg = float(np.degrees(np.arctan2(gx, -gz)))
                gaze_vector_3d = (round(gx, 4), round(gy, 4), round(gz, 4))
            except Exception as e:
                logger.debug(f"3D gaze calculation error: {e}")

        return {
            "direction": direction,
            "screen_x": screen_x,
            "screen_y": screen_y,
            "confidence": confidence,
            "left_iris": tuple(left_iris_center.tolist()),
            "right_iris": tuple(right_iris_center.tolist()),
            "yaw": round(yaw_deg, 2),
            "pitch": round(pitch_deg, 2),
            "gaze_vector_3d": gaze_vector_3d,
        }

    def draw_visualization(
        self,
        frame: np.ndarray,
        analysis: FaceAnalysis,
        show_gaze: bool = True,
        show_head_pose: bool = True,
        show_landmarks: bool = False
    ) -> np.ndarray:
        vis = frame.copy()
        if not analysis.face_detected or analysis.landmarks is None:
            return vis
        landmarks = np.array(analysis.landmarks, dtype=np.int32)
        if show_landmarks:
            for lm in landmarks:
                cv2.circle(vis, tuple(lm), 1, (0, 255, 0), -1)
        if analysis.bbox:
            x1, y1, x2, y2 = analysis.bbox
            cv2.rectangle(vis, (x1, y1), (x2, y2), (255, 0, 0), 2)
        if show_gaze and analysis.left_iris_center and analysis.right_iris_center:
            left_iris = tuple(map(int, analysis.left_iris_center))
            right_iris = tuple(map(int, analysis.right_iris_center))
            cv2.circle(vis, left_iris, 4, (0, 0, 255), -1)
            cv2.circle(vis, right_iris, 4, (0, 0, 255), -1)
            center_x = (left_iris[0] + right_iris[0]) // 2
            center_y = (left_iris[1] + right_iris[1]) // 2
            if analysis.gaze_direction == "LEFT":
                end = (center_x - 50, center_y)
            elif analysis.gaze_direction == "RIGHT":
                end = (center_x + 50, center_y)
            elif analysis.gaze_direction == "UP":
                end = (center_x, center_y - 50)
            elif analysis.gaze_direction == "DOWN":
                end = (center_x, center_y + 50)
            else:
                end = (center_x, center_y)
            if end != (center_x, center_y):
                cv2.arrowedLine(vis, (center_x, center_y), end, (0, 255, 255), 3)
            cv2.putText(vis, f"Gaze: {analysis.gaze_direction} ({analysis.gaze_confidence:.2f}) [Y:{analysis.gaze_yaw:+.1f} P:{analysis.gaze_pitch:+.1f}]",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        if show_head_pose and analysis.head_pose:
            hp = analysis.head_pose
            cv2.putText(vis, f"Head: {hp.get('direction', 'FORWARD')}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
        return vis

    def close(self):
        if self.face_landmarker:
            self.face_landmarker.close()
            self.face_landmarker = None