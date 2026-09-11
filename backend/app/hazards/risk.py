"""Deterministic risk evaluation engine for pedestrian hazards."""

from typing import Optional
from app.config import SensitivityLevel, settings
from app.hazards.models import MotionType, TrackedHazard, UrgencyLevel

# Base threat weights for obstacle categories
TYPE_BASE_SEVERITY = {
    "vehicle": 0.85,
    "bus": 0.90,
    "truck": 0.90,
    "motorcycle": 0.80,
    "surface": 0.75,   # potholes, curbs, steps
    "pothole": 0.80,
    "curb": 0.70,
    "stairs": 0.75,
    "bicycle": 0.60,
    "pedestrian": 0.45,
    "sign": 0.15,
    "signal": 0.20,
    "crosswalk": 0.10,
    "obstacle": 0.40,
}

# Motion approach multipliers
MOTION_MULTIPLIERS = {
    MotionType.APPROACHING: 1.45,
    MotionType.CROSSING: 1.15,
    MotionType.STATIONARY: 0.85,
    MotionType.MOVING_AWAY: 0.40,
}

# Time-to-conflict weight mapping
TTC_MULTIPLIERS = {
    "critical": 1.60,
    "high": 1.30,
    "medium": 1.00,
    "low": 0.70,
    "very_low": 0.40,
}


class RiskEngine:
    """Computes deterministic risk scores and assigns categorical urgency levels.

    Combines:
    - Obstacle physical severity
    - Detection confidence
    - Relative motion & expansion rate
    - Walking path intersection score
    - Time-to-conflict (TTC)
    - Cross-modal audio confirmation boost
    - Sensitivity multiplier
    """

    def __init__(self, sensitivity: SensitivityLevel | str = SensitivityLevel.NORMAL):
        self.sensitivity = str(sensitivity).upper()

    def set_sensitivity(self, sensitivity: SensitivityLevel | str) -> None:
        self.sensitivity = str(sensitivity).upper()

    def calculate_risk(
        self,
        hazard: TrackedHazard,
        audio_confirmed: bool = False,
    ) -> float:
        """Calculates normalized risk score [0.0, 1.0]."""
        cat = hazard.hazard_type.lower()
        base_sev = TYPE_BASE_SEVERITY.get(cat, TYPE_BASE_SEVERITY.get(hazard.label.lower(), 0.40))

        # Motion factor
        motion_mult = MOTION_MULTIPLIERS.get(hazard.motion, 0.85)

        # Path intersection penalty: objects in path are critically dangerous
        path_factor = 1.0 + (hazard.path_intersection_score * 1.5)

        # Relative conflict severity
        ttc_mult = TTC_MULTIPLIERS.get(hazard.time_to_conflict, 1.0)

        # Confidence weighting: dampens low-confidence false positives
        conf_weight = max(0.5, min(1.0, hazard.confidence))

        # Acoustic confirmation boost (e.g. car horn + visual car)
        audio_boost = 0.20 if audio_confirmed else 0.0

        # Raw score computation
        raw_score = (base_sev * motion_mult * path_factor * ttc_mult * conf_weight) + audio_boost

        # Sensitivity calibration
        sensitivity_mult = settings.get_sensitivity_multiplier(self.sensitivity)
        scaled_score = (raw_score / 3.0) * sensitivity_mult

        return round(min(1.0, max(0.0, scaled_score)), 3)

    def determine_urgency(self, risk_score: float, hazard: TrackedHazard) -> UrgencyLevel:
        """Maps risk score and situational rules to categorical urgency."""
        # Rule overrides for safety:
        # Fast approaching vehicle intersecting walking corridor is ALWAYS critical
        if (
            hazard.hazard_type in ("vehicle", "bus", "truck", "motorcycle")
            and hazard.motion == MotionType.APPROACHING
            and hazard.path_intersection_score > 0.45
            and hazard.confidence > 0.60
        ):
            return UrgencyLevel.CRITICAL

        # Surface defect directly in walking corridor is high caution
        if (
            hazard.hazard_type == "surface"
            and hazard.path_intersection_score > 0.40
        ):
            return UrgencyLevel.HIGH

        # Standard score bands
        if risk_score >= 0.72:
            return UrgencyLevel.CRITICAL
        elif risk_score >= 0.46:
            return UrgencyLevel.HIGH
        elif risk_score >= 0.22:
            return UrgencyLevel.MEDIUM
        return UrgencyLevel.LOW

    def evaluate_hazard(
        self,
        hazard: TrackedHazard,
        audio_confirmed: bool = False,
    ) -> TrackedHazard:
        """Evaluates and updates hazard risk_score and urgency."""
        score = self.calculate_risk(hazard, audio_confirmed=audio_confirmed)
        urgency = self.determine_urgency(score, hazard)

        hazard.risk_score = score
        hazard.urgency = urgency
        return hazard

