"""Confidence thresholding, calibration, and safety validation utilities."""

from typing import List
from app.hazards.models import DetectedObject, TrackedHazard


class ConfidenceManager:
    """Filters, calibrates, and thresholds confidence scores."""

    def __init__(self, default_threshold: float = 0.50):
        self.default_threshold = default_threshold

    def filter_detections(
        self,
        detections: List[DetectedObject],
        threshold: float = 0.0,
    ) -> List[DetectedObject]:
        th = threshold if threshold > 0.0 else self.default_threshold
        return [d for d in detections if d.confidence >= th]

    def calibrate_track_confidence(self, track_confidences: List[float]) -> float:
        """Exponential moving average of confidence over recent observations."""
        if not track_confidences:
            return 0.5
        alpha = 0.35
        ema = track_confidences[0]
        for c in track_confidences[1:]:
            ema = alpha * c + (1 - alpha) * ema
        return round(ema, 3)

