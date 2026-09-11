"""Unit tests for deterministic risk scoring and urgency calculations."""

import pytest
from app.config import SensitivityLevel
from app.hazards.models import Direction, MotionType, TrackedHazard, UrgencyLevel
from app.hazards.risk import RiskEngine


def test_approaching_vehicle_in_path_is_critical():
    engine = RiskEngine()

    car = TrackedHazard(
        hazard_id="car_1",
        track_id="1",
        hazard_type="vehicle",
        label="car",
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        path_intersection_score=0.85,
        time_to_conflict="critical",
        confidence=0.92,
        relative_speed=0.8,
    )

    evaluated = engine.evaluate_hazard(car)
    assert evaluated.urgency == UrgencyLevel.CRITICAL
    assert evaluated.risk_score >= 0.70


def test_surface_pothole_in_path_is_high():
    engine = RiskEngine()

    pothole = TrackedHazard(
        hazard_id="pothole_1",
        track_id="2",
        hazard_type="surface",
        label="pothole",
        direction=Direction.AHEAD,
        motion=MotionType.STATIONARY,
        path_intersection_score=0.75,
        time_to_conflict="high",
        confidence=0.88,
    )

    evaluated = engine.evaluate_hazard(pothole)
    assert evaluated.urgency == UrgencyLevel.HIGH


def test_pedestrian_moving_away_is_medium_or_low():
    engine = RiskEngine()

    ped = TrackedHazard(
        hazard_id="ped_1",
        track_id="3",
        hazard_type="pedestrian",
        label="pedestrian",
        direction=Direction.LEFT,
        motion=MotionType.MOVING_AWAY,
        path_intersection_score=0.10,
        time_to_conflict="very_low",
        confidence=0.80,
    )

    evaluated = engine.evaluate_hazard(ped)
    assert evaluated.urgency in (UrgencyLevel.LOW, UrgencyLevel.MEDIUM)

