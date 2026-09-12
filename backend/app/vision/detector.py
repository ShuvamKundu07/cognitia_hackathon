"""Object and pedestrian hazard detector interface and implementations."""

from abc import ABC, abstractmethod
import logging
import math
import os
import time
from typing import Any, Dict, List, Optional
import numpy as np

from app.config import settings
from app.hazards.models import BoundingBox, DetectedObject, Direction, UrgencyLevel

logger = logging.getLogger("vision.detector")

import cv2

# Pedestrian-relevant class mapping from generic COCO
COCO_HAZARD_MAP = {
    # Pedestrians & Living Hazards
    "person": "pedestrian",
    "dog": "obstacle",
    "cat": "obstacle",
    "horse": "obstacle",
    "cow": "obstacle",
    "sheep": "obstacle",
    # Vehicles & Transit
    "bicycle": "bicycle",
    "car": "vehicle",
    "motorcycle": "motorcycle",
    "bus": "vehicle",
    "truck": "vehicle",
    "train": "vehicle",
    # Street Infrastructure
    "traffic light": "traffic_light",
    "stop sign": "traffic_sign",
    "fire hydrant": "obstacle",
    "parking meter": "obstacle",
    "bench": "obstacle",
    # Everyday Obstacles (Furniture & Tripping hazards)
    "chair": "obstacle",
    "couch": "obstacle",
    "dining table": "obstacle",
    "bed": "obstacle",
    "potted plant": "obstacle",
    "backpack": "obstacle",
    "suitcase": "obstacle",
    "handbag": "obstacle",
    "umbrella": "obstacle",
    "bottle": "obstacle",
    "tv": "obstacle",
    "laptop": "obstacle",
    "refrigerator": "obstacle",
    "sink": "obstacle",
    "toilet": "obstacle",
}


class BaseObjectDetector(ABC):
    """Abstract interface for hazard detectors."""

    @abstractmethod
    def detect(self, frame: np.ndarray, timestamp: float = 0.0) -> List[DetectedObject]:
        """Runs inference on frame and returns normalized detected hazards."""
        pass


class CustomSurfaceHazardDetector:
    """Real-time computer vision detector for road surface hazards (potholes, pavement depressions).

    Operates on the walking corridor and lower ground plane of forward-facing pedestrian camera frames.
    Uses localized background luminance subtraction, morphological cavity filtering, gradient boundary analysis,
    and geometric contour validation to isolate physical depressions and holes in the pavement.
    Strict ground-plane and road-surface verification prevents false positives on people, indoor scenes, or mid-air objects:
    1. Ground-Plane ROI: Only inspects the bottom 35% of the frame (y >= 0.65) where the walking surface physically exists.
    2. Road Surface Validation: Verifies that the ground plane has low color saturation (asphalt/concrete). Rejects skin tones, indoor carpets, and clothes.
    3. Geometric Constraints: Potholes on the road plane project as horizontal ellipses (aspect ratio >= 0.80).
    4. Contrast & Rim Depth: Cavities must be significantly darker than the local road median/background.
    5. Non-Maximum Suppression: Clusters overlapping candidates and limits to max 2 legitimate potholes.
    """

    def __init__(
        self,
        enabled: bool = True,
        min_area: float = 0.002,
        max_area: float = 0.15,
        min_contrast: float = 22.0,
        min_confidence: float = 0.65,
    ):
        self.enabled = enabled
        self.min_area = min_area
        self.max_area = max_area
        self.min_contrast = min_contrast
        self.min_confidence = min_confidence

    def _is_pavement_surface(self, roi_bgr: np.ndarray) -> bool:
        """Verifies whether the ground ROI resembles road asphalt or concrete (low saturation, not skin/clothes)."""
        if roi_bgr is None or roi_bgr.size == 0:
            return False

        hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1]
        hue = hsv[:, :, 0]

        # Pavement is neutral/gray: average saturation should be low (< 50)
        mean_sat = float(np.mean(sat))
        if mean_sat > 50.0:
            return False

        # Check for skin tones (Hue 0-25 or 160-180 with saturation > 35)
        skin_mask = (
            ((hue <= 25) | (hue >= 160)) &
            (sat > 35)
        )
        skin_ratio = float(np.sum(skin_mask)) / float(roi_bgr.shape[0] * roi_bgr.shape[1])
        if skin_ratio > 0.08:
            return False  # Likely a person/body part in ROI

        return True

    def detect_pavement_hazards(
        self,
        frame: np.ndarray,
        timestamp: float = 0.0,
        exclude_bboxes: Optional[List[BoundingBox]] = None,
    ) -> List[DetectedObject]:
        if not self.enabled or frame is None or frame.size == 0:
            return []
        if timestamp <= 0.0:
            timestamp = time.time()

        h, w = frame.shape[:2]
        total_frame_area = float(h * w)

        # STRICT GROUND PLANE: Potholes physically only exist on the walking surface at the pedestrian's feet
        # Lower 35% of camera frame (y >= 0.65)
        roi_top = int(h * 0.65)
        roi = frame[roi_top:, :]
        roi_h, roi_w = roi.shape[:2]

        if roi_h < 20 or roi_w < 40:
            return []

        # Validate that the surface is actually road/pavement
        if not self._is_pavement_surface(roi):
            return []

        # Convert to grayscale
        if len(roi.shape) == 3:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi.copy()

        # Gaussian blur to suppress micro-grain asphalt noise while preserving cavity contours
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)

        # Use road median to identify genuine dark depressions
        road_median = float(np.median(blurred))
        if road_median < 40:  # Entire ground is nearly pitch black
            return []

        # Potholes are localized depressions significantly darker than the surrounding pavement
        diff = np.maximum(0, road_median - blurred).astype(np.uint8)

        # Threshold difference - must be significantly darker than pavement
        _, thresh = cv2.threshold(diff, int(self.min_contrast), 255, cv2.THRESH_BINARY)

        # Morphological closing with elliptical structuring element
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        # Find external contours
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        raw_candidates = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            area_frac = area / total_frame_area
            if area_frac < self.min_area or area_frac > self.max_area:
                continue

            bx, by, bw, bh = cv2.boundingRect(cnt)
            aspect = bw / float(bh) if bh > 0 else 0
            # Ground projection: a pothole on the ground is an ellipse wider than it is tall
            if aspect < 0.80 or aspect > 3.5:
                continue

            # Check solidity: contour area / convex hull area
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            solidity = area / hull_area if hull_area > 0 else 0
            if solidity < 0.45:
                continue

            # Compute normalized coordinates
            norm_x = max(0.0, min(1.0, bx / float(w)))
            norm_y = max(0.0, min(1.0, (by + roi_top) / float(h)))
            norm_w = max(0.03, min(1.0 - norm_x, bw / float(w)))
            norm_h = max(0.03, min(1.0 - norm_y, bh / float(h)))

            cand_bbox = BoundingBox(x=norm_x, y=norm_y, width=norm_w, height=norm_h)

            # Exclude if overlaps with any detected person or vehicle
            if exclude_bboxes:
                if any(cand_bbox.iou(eb) > 0.05 for eb in exclude_bboxes):
                    continue

            # Contrast measurement
            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.drawContours(mask, [cnt], -1, 255, -1)
            mean_inside = cv2.mean(gray, mask=mask)[0]

            dilated = cv2.dilate(mask, kernel, iterations=2)
            ring_mask = cv2.subtract(dilated, mask)
            mean_surround = cv2.mean(gray, mask=ring_mask)[0]
            contrast = mean_surround - mean_inside

            if contrast < self.min_contrast:
                continue

            raw_candidates.append({
                "bbox": cand_bbox,
                "norm_x": norm_x,
                "norm_y": norm_y,
                "norm_w": norm_w,
                "contrast": contrast,
            })

        # NMS: merge overlapping candidates
        raw_candidates.sort(key=lambda c: c["contrast"], reverse=True)
        final_potholes: List[DetectedObject] = []

        for cand in raw_candidates:
            # Check if overlaps with an already accepted candidate
            if any(cand["bbox"].iou(fp.bbox) > 0.15 for fp in final_potholes):
                continue

            # Direction based on centroid
            cx = cand["bbox"].center_x
            if cx < 0.35:
                direction = Direction.LEFT
            elif cx > 0.65:
                direction = Direction.RIGHT
            else:
                direction = Direction.AHEAD

            # Walking corridor intersection: x: 0.30-0.70
            in_corridor = (
                (cand["norm_x"] + cand["norm_w"] > 0.30) and
                (cand["norm_x"] < 0.70)
            )

            urgency = UrgencyLevel.HIGH if in_corridor else UrgencyLevel.MEDIUM
            conf = min(0.92, max(self.min_confidence, 0.65 + (cand["contrast"] / 100.0) * 0.20))

            final_potholes.append(
                DetectedObject(
                    id=f"pothole_{len(final_potholes)}",
                    label="pothole",
                    confidence=round(conf, 2),
                    bbox=cand["bbox"],
                    direction=direction,
                    urgency=urgency,
                    timestamp=timestamp,
                )
            )
            if len(final_potholes) >= 2:
                break

        return final_potholes


class CustomNeuralHazardDetector:
    """Neural object detector for custom trained hazard checkpoints (e.g. potholes, surface defects, curbs).

    Wraps an Ultralytics YOLO checkpoint trained on pedestrian ground hazards, running inference to isolate
    pavement hazards in real-time, compute spatial walking corridor metrics, and fall back to heuristic
    pavement cavity detection if weights are missing.
    """

    def __init__(
        self,
        model_path: str = "models/best.pt",
        confidence_threshold: float = 0.30,
        fallback_detector: Optional[CustomSurfaceHazardDetector] = None,
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.fallback_detector = fallback_detector or CustomSurfaceHazardDetector()
        self.model = None
        self.is_available = False

        self._initialize_model()

    def _initialize_model(self) -> None:
        if getattr(settings, "mock_mode", False):
            logger.info("Running in MOCK MODE: CustomNeuralHazardDetector bypassed to save RAM.")
            self.is_available = False
            return

        try:
            from ultralytics import YOLO  # type: ignore

            backend_models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models"))
            candidates = [
                self.model_path,
                os.path.join(backend_models_dir, "best.pt") if backend_models_dir else None,
                os.path.join(backend_models_dir, "potholes_curbs.pt") if backend_models_dir else None,
                "backend/models/best.pt",
                "models/best.pt",
                "backend/models/potholes_curbs.pt",
                "models/potholes_curbs.pt",
                "best.pt",
                "potholes_curbs.pt",
            ]
            for path in candidates:
                if not path or not os.path.exists(path):
                    continue
                try:
                    logger.info("Attempting to load custom hazard YOLO model from %s...", path)
                    self.model = YOLO(path)
                    self.model_path = path
                    self.is_available = True
                    logger.info(
                        "Custom hazard YOLO model initialized from %s with classes: %s",
                        path,
                        getattr(self.model, "names", {}),
                    )
                    return
                except Exception as ex:
                    logger.debug("Could not load custom hazard model from %s: %s", path, ex)

            self.is_available = False
            logger.info("Custom hazard model weights not found at candidates.")
        except ImportError:
            logger.warning("Ultralytics library not installed. Custom hazard model falling back.")
            self.is_available = False
        except Exception as e:
            logger.warning("Error initializing custom hazard model: %s", e)
            self.is_available = False

    def detect_pavement_hazards(
        self,
        frame: np.ndarray,
        timestamp: float = 0.0,
        exclude_bboxes: Optional[List[BoundingBox]] = None,
    ) -> List[DetectedObject]:
        """Detects road surface hazards using the trained neural model, with fallback to computer vision heuristics."""
        if timestamp <= 0.0:
            timestamp = time.time()

        if frame is None or frame.size == 0:
            return []

        # 1. Neural hazard detection via trained YOLO checkpoint (e.g. best.pt for potholes)
        if self.is_available and self.model is not None:
            try:
                h, w = frame.shape[:2]
                results = self.model(frame, conf=self.confidence_threshold, verbose=False)
                neural_hazards: List[DetectedObject] = []

                for res in results:
                    boxes = res.boxes
                    if boxes is None:
                        continue
                    for i, box in enumerate(boxes):
                        cls_id = int(box.cls[0].item())
                        cls_name = self.model.names.get(cls_id, "pothole")
                        conf = float(box.conf[0].item())

                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = xyxy

                        norm_x = max(0.0, min(1.0, x1 / float(w)))
                        norm_y = max(0.0, min(1.0, y1 / float(h)))
                        norm_w = max(0.01, min(1.0 - norm_x, (x2 - x1) / float(w)))
                        norm_h = max(0.01, min(1.0 - norm_y, (y2 - y1) / float(h)))

                        cand_bbox = BoundingBox(x=norm_x, y=norm_y, width=norm_w, height=norm_h)

                        # Exclude candidate if it overlaps significantly with an already detected pedestrian or vehicle
                        if exclude_bboxes and any(cand_bbox.iou(eb) > 0.15 for eb in exclude_bboxes):
                            continue

                        cx = cand_bbox.center_x
                        if cx < 0.35:
                            direction = Direction.LEFT
                        elif cx > 0.65:
                            direction = Direction.RIGHT
                        else:
                            direction = Direction.AHEAD

                        # Walking corridor intersection (x: 0.30-0.70)
                        in_corridor = (norm_x + norm_w > 0.30) and (norm_x < 0.70)
                        urgency = UrgencyLevel.HIGH if (in_corridor and norm_y > 0.40) else UrgencyLevel.MEDIUM

                        neural_hazards.append(
                            DetectedObject(
                                id=f"{cls_name}_{i}_{int(timestamp * 10) % 10000}",
                                label=cls_name,
                                confidence=round(conf, 3),
                                bbox=cand_bbox,
                                direction=direction,
                                urgency=urgency,
                                timestamp=timestamp,
                            )
                        )

                # Return neural hazards directly. If neural model found 0 potholes, the ground is clear!
                return neural_hazards
            except Exception as e:
                logger.error("Error running custom neural hazard inference: %s", e)

        # 2. Fallback to heuristic pavement hazard detector ONLY if neural model is unavailable
        # AND heuristic detection is explicitly enabled in config
        if getattr(settings, "enable_heuristic_pavement_detector", False) and self.fallback_detector:
            return self.fallback_detector.detect_pavement_hazards(
                frame,
                timestamp=timestamp,
                exclude_bboxes=exclude_bboxes,
            )
        return []


class YOLODetector(BaseObjectDetector):
    """Dual-engine YOLO detector combining general pedestrian hazard detection with custom hazard checkpoint inference."""

    def __init__(
        self,
        model_path: str = "models/yolov8n.pt",
        confidence_threshold: float = 0.35,
        custom_hazard_detector: Optional[Any] = None,
        custom_hazard_model_path: Optional[str] = None,
        custom_hazard_confidence_threshold: Optional[float] = None,
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold

        if custom_hazard_detector is not None:
            self.custom_hazard_detector = custom_hazard_detector
        else:
            ch_path = custom_hazard_model_path or getattr(settings, "custom_hazard_model_path", "models/best.pt")
            ch_conf = custom_hazard_confidence_threshold or getattr(settings, "custom_hazard_confidence_threshold", 0.30)
            self.custom_hazard_detector = CustomNeuralHazardDetector(
                model_path=ch_path,
                confidence_threshold=ch_conf,
            )

        self.model = None
        self.is_available = False

        self._initialize_model()

    def _initialize_model(self) -> None:
        if getattr(settings, "mock_mode", False):
            logger.info("Running in MOCK MODE: YOLODetector bypassed to save RAM.")
            self.is_available = False
            return

        try:
            from ultralytics import YOLO  # type: ignore

            backend_models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models"))
            candidates = [
                self.model_path,
                os.path.join(backend_models_dir, "yolov8n.pt") if backend_models_dir else None,
                "backend/models/yolov8n.pt",
                "models/yolov8n.pt",
                "yolov8n.pt",
            ]
            for path in candidates:
                if not path or not os.path.exists(path):
                    continue
                try:
                    logger.info("Loading YOLO model from %s...", path)
                    self.model = YOLO(path)
                    self.model_path = path
                    self.is_available = True
                    logger.info("YOLO model successfully initialized from %s.", path)
                    return
                except Exception as ex:
                    logger.debug("Could not load from candidate %s: %s", path, ex)

            # Auto-download fallback if candidate file path wasn't found on disk
            try:
                logger.info("Local yolov8n.pt file not found. Attempting to load official yolov8n.pt via ultralytics...")
                self.model = YOLO("yolov8n.pt")
                self.model_path = "yolov8n.pt"
                self.is_available = True
                logger.info("YOLO model successfully initialized via ultralytics auto-download.")
                return
            except Exception as ex:
                logger.warning("Could not auto-download or load official yolov8n.pt: %s", ex)

            # If all failed, mark unavailable
            self.is_available = False
            logger.warning("Could not load YOLO model from candidate paths. Falling back.")
        except ImportError:
            logger.warning("Ultralytics library not installed. YOLODetector falling back.")
            self.is_available = False
        except Exception as e:
            logger.warning("Could not load YOLO model at %s (%s). Falling back.", self.model_path, e)
            self.is_available = False

    def detect(self, frame: np.ndarray, timestamp: float = 0.0) -> List[DetectedObject]:
        if timestamp <= 0.0:
            timestamp = time.time()

        if frame is None or frame.size == 0:
            return []

        h, w = frame.shape[:2]
        detected: List[DetectedObject] = []

        # 1. Neural object detection via YOLO (people, vehicles, obstacles)
        if self.is_available and self.model is not None:
            try:
                results = self.model(frame, conf=self.confidence_threshold, verbose=False)
                for res in results:
                    boxes = res.boxes
                    if boxes is None:
                        continue
                    for i, box in enumerate(boxes):
                        cls_id = int(box.cls[0].item())
                        cls_name = self.model.names.get(cls_id, "unknown")
                        conf = float(box.conf[0].item())

                        # Filter for pedestrian safety hazards
                        hazard_type = COCO_HAZARD_MAP.get(cls_name.lower())
                        if not hazard_type:
                            continue

                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = xyxy
                        # Normalize coordinates
                        norm_x = max(0.0, min(1.0, x1 / w))
                        norm_y = max(0.0, min(1.0, y1 / h))
                        norm_w = max(0.01, min(1.0 - norm_x, (x2 - x1) / w))
                        norm_h = max(0.01, min(1.0 - norm_y, (y2 - y1) / h))

                        bbox = BoundingBox(x=norm_x, y=norm_y, width=norm_w, height=norm_h)

                        # Direction based on centroid
                        cx = bbox.center_x
                        if cx < 0.35:
                            direction = Direction.LEFT
                        elif cx > 0.65:
                            direction = Direction.RIGHT
                        else:
                            direction = Direction.AHEAD

                        # Urgency heuristic
                        in_corridor = (norm_x + norm_w > 0.30) and (norm_x < 0.70)
                        if hazard_type == "vehicle":
                            urgency = UrgencyLevel.CRITICAL if (in_corridor and norm_y > 0.40) else UrgencyLevel.HIGH
                        elif hazard_type == "pedestrian":
                            urgency = UrgencyLevel.HIGH if (in_corridor and norm_y > 0.45) else UrgencyLevel.MEDIUM
                        else:
                            urgency = UrgencyLevel.MEDIUM if in_corridor else UrgencyLevel.LOW

                        # Preserve specific object label for everyday obstacles (e.g. "chair", "table", "backpack")
                        det_label = cls_name.lower().replace("_", " ") if hazard_type == "obstacle" else hazard_type

                        detected.append(
                            DetectedObject(
                                id=f"{cls_name.lower().replace(' ', '_')}_{i}_{int(timestamp * 10) % 10000}",
                                label=det_label,
                                confidence=round(conf, 3),
                                bbox=bbox,
                                direction=direction,
                                urgency=urgency,
                                timestamp=timestamp,
                            )
                        )
            except Exception as e:
                logger.error("Inference exception in YOLODetector: %s", e)

        # 2. Integrate pavement surface hazards (potholes, cracks), strictly excluding any region with people/vehicles/obstacles
        if self.custom_hazard_detector:
            try:
                obstacle_bboxes = [d.bbox for d in detected if d.label != "pothole"]
                surface_hazards = self.custom_hazard_detector.detect_pavement_hazards(
                    frame,
                    timestamp=timestamp,
                    exclude_bboxes=obstacle_bboxes,
                )
                detected.extend(surface_hazards)
            except Exception as e:
                logger.error("Error running surface hazard detector: %s", e)

        return detected


class MockDetector(BaseObjectDetector):
    """High-fidelity deterministic mock detector for development, testing, and offline mode.

    Simulates realistic urban pedestrian hazards: approaching vehicle,
    pothole ahead in walking corridor, pedestrian on the left, and crosswalk.
    """

    def __init__(self):
        self.frame_count = 0

    def detect(self, frame: np.ndarray, timestamp: float = 0.0) -> List[DetectedObject]:
        if timestamp <= 0.0:
            timestamp = time.time()
        self.frame_count += 1
        objects: List[DetectedObject] = []

        # 1. Pothole / surface obstacle directly ahead in walking corridor
        objects.append(
            DetectedObject(
                id="pothole_3",
                label="pothole",
                confidence=0.89,
                bbox=BoundingBox(x=0.42, y=0.65, width=0.16, height=0.12),
                direction=Direction.AHEAD,
                urgency=UrgencyLevel.HIGH,
                timestamp=timestamp,
            )
        )

        # 2. Pedestrian on left moving gradually
        ped_y = 0.35 + math.sin(self.frame_count * 0.1) * 0.04
        objects.append(
            DetectedObject(
                id="ped_12",
                label="pedestrian",
                confidence=0.85,
                bbox=BoundingBox(x=0.15, y=ped_y, width=0.12, height=0.30),
                direction=Direction.LEFT,
                urgency=UrgencyLevel.MEDIUM,
                timestamp=timestamp,
            )
        )

        # 3. Approaching car from right side (dynamic approach simulation)
        cycle = self.frame_count % 30
        if 8 < cycle < 25:
            # Car approaches from right toward center walking path and expands
            car_x = 0.75 - (cycle - 8) * 0.022
            car_w = 0.20 + (cycle - 8) * 0.008
            car_h = 0.18 + (cycle - 8) * 0.006
            car_urgency = UrgencyLevel.CRITICAL if car_x < 0.60 else UrgencyLevel.HIGH

            objects.append(
                DetectedObject(
                    id="car_17",
                    label="vehicle",
                    confidence=0.94,
                    bbox=BoundingBox(x=car_x, y=0.32, width=car_w, height=car_h),
                    direction=Direction.RIGHT,
                    urgency=car_urgency,
                    timestamp=timestamp,
                )
            )

        # 4. Occasional crosswalk or traffic sign in background
        if (self.frame_count // 20) % 2 == 0:
            objects.append(
                DetectedObject(
                    id="sign_street_4",
                    label="traffic_sign",
                    confidence=0.91,
                    bbox=BoundingBox(x=0.72, y=0.18, width=0.10, height=0.14),
                    direction=Direction.RIGHT,
                    urgency=UrgencyLevel.LOW,
                    timestamp=timestamp,
                )
            )

        return objects


def get_detector(mock_mode: bool = False) -> BaseObjectDetector:
    """Factory function returning the configured object detector."""
    if mock_mode or settings.mock_mode:
        logger.info("Initializing MockDetector (Mock Mode explicitly active)")
        return MockDetector()

    # In live mode, return the neural detector. Never silently inject MockDetector phantom hazards!
    return YOLODetector(
        model_path=settings.model_path,
        confidence_threshold=settings.confidence_threshold,
        custom_hazard_model_path=settings.custom_hazard_model_path,
        custom_hazard_confidence_threshold=settings.custom_hazard_confidence_threshold,
    )
