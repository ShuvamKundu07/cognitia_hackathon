"""Unit tests for hazard priority ranking and sorting."""

import pytest
from app.hazards.models import BoundingBox, Direction, MotionType, TrackedHazard, UrgencyLevel
from app.hazards.priority import PriorityEngine


def test_priority_urgency_ordering():
    engine = PriorityEngine()

    low_hazard = TrackedHazard(
        hazard_id="sign_1",
        track_id="1",
        hazard_type="sign",
        label="traffic_sign",
        urgency=UrgencyLevel.LOW,
        confidence=0.9,
    )
    med_hazard = TrackedHazard(
        hazard_id="ped_1",
        track_id="2",
        hazard_type="pedestrian",
        label="pedestrian",
        urgency=UrgencyLevel.MEDIUM,
        confidence=0.8,
    )
    high_hazard = TrackedHazard(
        hazard_id="pothole_1",
        track_id="3",
        hazard_type="surface",
        label="pothole",
        urgency=UrgencyLevel.HIGH,
        confidence=0.85,
    )
    crit_hazard = TrackedHazard(
        hazard_id="car_1",
        track_id="4",
        hazard_type="vehicle",
        label="vehicle",
        urgency=UrgencyLevel.CRITICAL,
        confidence=0.95,
    )

    hazards = [low_hazard, crit_hazard, med_hazard, high_hazard]
    sorted_hazards = engine.sort_hazards(hazards)

    assert sorted_hazards[0].urgency == UrgencyLevel.CRITICAL
    assert sorted_hazards[1].urgency == UrgencyLevel.HIGH
    assert sorted_hazards[2].urgency == UrgencyLevel.MEDIUM
    assert sorted_hazards[3].urgency == UrgencyLevel.LOW


def test_priority_path_collision_tiebreak():
    engine = PriorityEngine()

    # Two high-urgency hazards: one directly in walking path, one on the shoulder
    in_path = TrackedHazard(
        hazard_id="pothole_path",
        track_id="1",
        hazard_type="surface",
        label="pothole",
        urgency=UrgencyLevel.HIGH,
        confidence=0.85,
        path_intersection_score=0.90,
    )
    off_path = TrackedHazard(
        hazard_id="curb_shoulder",
        track_id="2",
        hazard_type="surface",
        label="curb",
        urgency=UrgencyLevel.HIGH,
        confidence=0.85,
        path_intersection_score=0.05,
    )

    sorted_hazards = engine.sort_hazards([off_path, in_path])
    assert sorted_hazards[0].hazard_id == "pothole_path"

