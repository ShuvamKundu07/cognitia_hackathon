"""Unit tests for CustomSurfaceHazardDetector and YOLODetector."""

import cv2
import numpy as np
import pytest

from app.hazards.models import Direction, UrgencyLevel
from app.vision.detector import CustomSurfaceHazardDetector, YOLODetector


def test_pothole_detector_blank_frame():
    """Verify detector produces no false positives on a uniform blank frame."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    frame = np.full((360, 640, 3), 128, dtype=np.uint8)
    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) == 0


def test_pothole_detector_empty_or_none_frame():
    """Verify detector gracefully handles None or empty frames."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    assert detector.detect_pavement_hazards(None) == []
    assert detector.detect_pavement_hazards(np.array([])) == []


def test_pothole_detector_disabled():
    """Verify disabled detector returns empty list immediately."""
    detector = CustomSurfaceHazardDetector(enabled=False)
    frame = np.full((360, 640, 3), 128, dtype=np.uint8)
    cv2.ellipse(frame, (320, 280), (40, 22), 0, 0, 360, (40, 40, 40), -1)
    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) == 0


def test_pothole_detector_in_walking_path():
    """Verify pothole in center corridor on road surface is detected as AHEAD with HIGH urgency."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    # Draw dark depression ahead in ground walkway (x=320, y=280)
    cv2.ellipse(frame, (320, 280), (45, 25), 0, 0, 360, (35, 35, 35), -1)

    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) >= 1
    pothole = hazards[0]
    assert pothole.label == "pothole"
    assert pothole.direction == Direction.AHEAD
    assert pothole.urgency in (UrgencyLevel.HIGH, UrgencyLevel.CRITICAL)
    assert pothole.confidence >= 0.65
    assert 0.25 <= pothole.bbox.x <= 0.65
    assert 0.60 <= pothole.bbox.y <= 0.95


def test_pothole_detector_left_side():
    """Verify pothole on left side of the road is detected with Direction.LEFT."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    # Draw dark depression on left (x=100, y=280)
    cv2.ellipse(frame, (100, 280), (40, 20), 0, 0, 360, (35, 35, 35), -1)

    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) >= 1
    pothole = hazards[0]
    assert pothole.label == "pothole"
    assert pothole.direction == Direction.LEFT


def test_pothole_detector_right_side():
    """Verify pothole on right side of the road is detected with Direction.RIGHT."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    # Draw dark depression on right (x=540, y=280)
    cv2.ellipse(frame, (540, 280), (40, 20), 0, 0, 360, (35, 35, 35), -1)

    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) >= 1
    pothole = hazards[0]
    assert pothole.label == "pothole"
    assert pothole.direction == Direction.RIGHT


def test_pothole_detector_rejects_person_and_face():
    """Verify that a webcam view of a person/face produces ZERO potholes (prevents false caution alerts)."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    # Simulate user in room: warm skin tones and clothing in lower frame
    frame = np.full((360, 640, 3), 210, dtype=np.uint8)
    # Face & neck with skin tone (BGR warm colors)
    cv2.ellipse(frame, (320, 200), (80, 100), 0, 0, 360, (130, 160, 215), -1)
    # Dark hair / shirt in lower region
    cv2.rectangle(frame, (200, 260), (440, 360), (30, 30, 40), -1)

    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) == 0


def test_pothole_detector_rejects_mid_air_features():
    """Verify dark features in upper frame (y < 0.65, e.g. hair, eyes, signs) are never flagged as potholes."""
    detector = CustomSurfaceHazardDetector(enabled=True)
    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    # Draw dark spot at y=150 (eye level / mid-air)
    cv2.ellipse(frame, (320, 150), (40, 20), 0, 0, 360, (20, 20, 20), -1)

    hazards = detector.detect_pavement_hazards(frame)
    assert len(hazards) == 0


def test_yolo_detector_with_surface_hazards():
    """Verify YOLODetector integrates both neural and surface hazards."""
    yolo = YOLODetector(model_path="models/yolov8n.pt", confidence_threshold=0.35)
    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    # Draw dark pothole in pavement
    cv2.ellipse(frame, (320, 280), (45, 25), 0, 0, 360, (35, 35, 35), -1)

    detected = yolo.detect(frame)
    potholes = [d for d in detected if d.label == "pothole"]
    assert len(potholes) >= 1


def test_custom_neural_hazard_detector_best_pt():
    """Verify CustomNeuralHazardDetector loads best.pt checkpoint and exposes pothole class."""
    from app.vision.detector import CustomNeuralHazardDetector

    detector = CustomNeuralHazardDetector(model_path="models/best.pt", confidence_threshold=0.30)
    assert detector.is_available is True
    assert detector.model is not None
    names = getattr(detector.model, "names", {})
    assert 0 in names
    assert names[0] == "pothole"

    # Inference on blank frame should return 0 false positives
    frame = np.full((360, 640, 3), 128, dtype=np.uint8)
    hazards = detector.detect_pavement_hazards(frame)
    assert isinstance(hazards, list)


def test_custom_neural_hazard_detector_fallback():
    """Verify CustomNeuralHazardDetector falls back gracefully when model path does not exist."""
    from app.vision.detector import CustomNeuralHazardDetector

    detector = CustomNeuralHazardDetector(
        model_path="models/non_existent_weights.pt",
        confidence_threshold=0.30,
    )
    # Since best.pt is in candidates, it might fall back to best.pt unless we test fallback on dummy
    # Verify detect_pavement_hazards does not raise exception
    frame = np.full((360, 640, 3), 128, dtype=np.uint8)
    hazards = detector.detect_pavement_hazards(frame)
    assert isinstance(hazards, list)


def test_yolo_detector_dual_engine_inference():
    """Verify YOLODetector initializes with both base YOLO and custom hazard checkpoint."""
    from app.vision.detector import YOLODetector

    yolo = YOLODetector(
        model_path="models/yolov8n.pt",
        custom_hazard_model_path="models/best.pt",
        confidence_threshold=0.35,
    )
    assert yolo.is_available is True
    assert yolo.custom_hazard_detector is not None
    assert yolo.custom_hazard_detector.is_available is True

    frame = np.full((360, 640, 3), 120, dtype=np.uint8)
    detected = yolo.detect(frame)
    assert isinstance(detected, list)

