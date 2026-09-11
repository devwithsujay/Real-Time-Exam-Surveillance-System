import cv2
import numpy as np
import time
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from ultralytics import YOLO

from app.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class Detection:
    class_name: str
    confidence: float
    bbox: List[int]
    keypoints: Optional[List[List[float]]] = None
    segmentation_mask: Optional[np.ndarray] = None
    track_id: Optional[int] = None

@dataclass
class DetectionResult:
    detections: List[Detection]
    inference_time_ms: float
    frame_number: int
    timestamp: float


class DetectionEngine:
    """YOLOv8-based person detection and pose estimation."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: Optional[float] = None,
        nms_threshold: Optional[float] = None,
        device: Optional[str] = None
    ):
        self.model_path = model_path or settings.YOLOV8_MODEL_PATH
        self.confidence_threshold = confidence_threshold or settings.YOLOV8_CONFIDENCE_THRESHOLD
        self.nms_threshold = nms_threshold or settings.YOLOV8_NMS_THRESHOLD
        self.device = device or ("cuda" if settings.USE_GPU else "cpu")

        self.model: Optional[YOLO] = None
        self._load_model()

        # Class mapping (COCO dataset)
        self.person_class_id = 0  # 'person' in COCO
        self.phone_class_id = 67  # 'cell phone' in COCO
        self.target_classes = [self.person_class_id, self.phone_class_id]

        # Stats
        self.total_inferences = 0
        self.total_inference_time = 0.0

    def _load_model(self):
        """Load YOLOv8 model."""
        try:
            logger.info(f"Loading YOLOv8 model from {self.model_path} on {self.device}")
            self.model = YOLO(self.model_path)
            self.model.to(self.device)
            self.model.fuse()
            logger.info("YOLOv8 model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load YOLOv8 model: {e}")
            raise

    def track(self, frame: np.ndarray, frame_number: int = 0) -> DetectionResult:
        start_time = time.time()
        try:
            results = self.model.track(
                frame,
                conf=self.confidence_threshold,
                iou=self.nms_threshold,
                classes=self.target_classes,
                verbose=False,
                device=self.device,
                persist=True,
                tracker="bytetrack.yaml"
            )
            inference_time = (time.time() - start_time) * 1000
            detections = self._parse_results(results[0])
            self.total_inferences += 1
            self.total_inference_time += inference_time
            return DetectionResult(
                detections=detections,
                inference_time_ms=inference_time,
                frame_number=frame_number,
                timestamp=time.time()
            )
        except Exception as e:
            logger.error(f"Track error: {e}")
            return DetectionResult(
                detections=[],
                inference_time_ms=(time.time() - start_time) * 1000,
                frame_number=frame_number,
                timestamp=time.time()
            )

    def detect(self, frame: np.ndarray, frame_number: int = 0) -> DetectionResult:
        """
        Run detection on a frame.

        Args:
            frame: BGR image (OpenCV format)
            frame_number: Frame sequence number

        Returns:
            DetectionResult with person detections
        """
        start_time = time.time()

        try:
            # Run inference
            results = self.model(
                frame,
                conf=self.confidence_threshold,
                iou=self.nms_threshold,
                classes=self.target_classes,
                verbose=False,
                device=self.device
            )

            inference_time = (time.time() - start_time) * 1000

            # Parse results
            detections = self._parse_results(results[0])

            # Update stats
            self.total_inferences += 1
            self.total_inference_time += inference_time

            return DetectionResult(
                detections=detections,
                inference_time_ms=inference_time,
                frame_number=frame_number,
                timestamp=time.time()
            )

        except Exception as e:
            logger.error(f"Detection error: {e}")
            return DetectionResult(
                detections=[],
                inference_time_ms=(time.time() - start_time) * 1000,
                frame_number=frame_number,
                timestamp=time.time()
            )

    def _parse_results(self, result) -> List[Detection]:
        """Parse YOLO results into Detection objects."""
        detections = []

        if result.boxes is None:
            return detections

        boxes = result.boxes.xyxy.cpu().numpy()
        confidences = result.boxes.conf.cpu().numpy()
        class_ids = result.boxes.cls.cpu().numpy().astype(int)
        track_ids = None
        if result.boxes.id is not None:
            track_ids = result.boxes.id.cpu().numpy().astype(int)

        # Get keypoints if available (pose model)
        keypoints = None
        if hasattr(result, 'keypoints') and result.keypoints is not None:
            keypoints = result.keypoints.xy.cpu().numpy()  # [n, 17, 2]
            keypoint_confs = result.keypoints.conf.cpu().numpy()  # [n, 17]

        # Get segmentation masks if available
        masks = None
        if hasattr(result, 'masks') and result.masks is not None:
            masks = result.masks.data.cpu().numpy()

        for i, (box, conf, cls_id) in enumerate(zip(boxes, confidences, class_ids)):
            # Keep person and phone classes
            if cls_id not in (self.person_class_id, self.phone_class_id):
                continue

            class_name = "person" if cls_id == self.person_class_id else "cell phone"

            # Prepare keypoints (persons only)
            kpts = None
            if cls_id == self.person_class_id and keypoints is not None and i < len(keypoints):
                kpts = []
                for j, (x, y) in enumerate(keypoints[i]):
                    kpt_conf = keypoint_confs[i][j] if keypoint_confs is not None else 1.0
                    kpts.append([float(x), float(y), float(kpt_conf)])

            # Prepare mask
            mask = None
            if masks is not None and i < len(masks):
                mask = masks[i]

            tid = int(track_ids[i]) if track_ids is not None and i < len(track_ids) else None

            detections.append(Detection(
                class_name=class_name,
                confidence=float(conf),
                bbox=[int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                keypoints=kpts,
                segmentation_mask=mask,
                track_id=tid
            ))

        return detections

    def detect_batch(self, frames: List[np.ndarray]) -> List[DetectionResult]:
        """Run detection on multiple frames (batch inference)."""
        if not frames:
            return []

        start_time = time.time()

        try:
            results = self.model(
                frames,
                conf=self.confidence_threshold,
                iou=self.nms_threshold,
                classes=self.target_classes,
                verbose=False,
                device=self.device
            )

            batch_time = (time.time() - start_time) * 1000

            # Parse each result
            results_list = []
            for i, result in enumerate(results):
                detections = self._parse_results(result)
                per_frame_time = batch_time / len(frames)
                results_list.append(DetectionResult(
                    detections=detections,
                    inference_time_ms=per_frame_time,
                    frame_number=i,
                    timestamp=time.time()
                ))

            self.total_inferences += len(frames)
            self.total_inference_time += batch_time

            return results_list

        except Exception as e:
            logger.error(f"Batch detection error: {e}")
            return [DetectionResult(
                detections=[],
                inference_time_ms=0,
                frame_number=i,
                timestamp=time.time()
            ) for i in range(len(frames))]

    def visualize(self, frame: np.ndarray, result: DetectionResult) -> np.ndarray:
        """Draw detections on frame for debugging."""
        vis_frame = frame.copy()

        for det in result.detections:
            x1, y1, x2, y2 = det.bbox
            conf = det.confidence

            # Draw bbox
            cv2.rectangle(vis_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Draw label
            label = f"Person: {conf:.2f}"
            cv2.putText(vis_frame, label, (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            # Draw keypoints if available
            if det.keypoints:
                for kpt in det.keypoints:
                    x, y, kpt_conf = kpt
                    if kpt_conf > 0.5:
                        cv2.circle(vis_frame, (int(x), int(y)), 4, (255, 0, 0), -1)

        # Draw inference time
        cv2.putText(vis_frame, f"Inference: {result.inference_time_ms:.1f}ms",
                   (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        return vis_frame

    def get_stats(self) -> Dict[str, Any]:
        """Get detection engine statistics."""
        avg_time = (self.total_inference_time / self.total_inferences
                   if self.total_inferences > 0 else 0)
        return {
            "total_inferences": self.total_inferences,
            "avg_inference_time_ms": avg_time,
            "model_path": self.model_path,
            "device": self.device,
            "confidence_threshold": self.confidence_threshold
        }

    def warmup(self, frame_shape: tuple = (720, 1280, 3), runs: int = 3):
        """Warm up model with dummy frames."""
        logger.info("Warming up detection model...")
        dummy_frame = np.zeros(frame_shape, dtype=np.uint8)
        for _ in range(runs):
            self.detect(dummy_frame)
        logger.info("Warmup complete")