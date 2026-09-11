"""Unit tests for deterministic conversational reference resolution."""

import pytest
from app.assistant.reference_resolution import ReferenceResolver
from app.assistant.scene_memory import SceneMemory
from app.hazards.models import BoundingBox, DetectedObject, Direction, MotionType, TrackedHazard, UrgencyLevel


def test_reference_resolution_that_sign():
    resolver = ReferenceResolver()
    memory = SceneMemory()

    # Register a sign in scene memory
    sign = DetectedObject(
        id="sign_street_4",
        label="traffic_sign",
        confidence=0.92,
        bbox=BoundingBox(x=0.72, y=0.18, width=0.10, height=0.14),
        direction=Direction.RIGHT,
    )
    memory.update_from_detections([sign], timestamp=100.0)

    res = resolver.resolve_reference(
        query="What does that sign say?",
        scene_memory=memory,
        active_hazards=[],
    )

    assert res["intent"] == "READ_SIGN"
    assert res["resolved"] is True
    assert res["target_object_id"] == "sign_street_4"


def test_reference_resolution_safe_to_cross_with_approaching_vehicle():
    resolver = ReferenceResolver()
    memory = SceneMemory()

    approaching_car = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        urgency=UrgencyLevel.CRITICAL,
    )

    res = resolver.resolve_reference(
        query="Is it safe to cross the street right now?",
        scene_memory=memory,
        active_hazards=[approaching_car],
    )

    assert res["intent"] == "CHECK_CROSSING"
    assert res["resolved"] is True
    assert res["is_safe"] is False
    assert "Do not cross" in res["response"]


def test_reference_resolution_safe_to_cross_clear():
    resolver = ReferenceResolver()
    memory = SceneMemory()

    res = resolver.resolve_reference(
        query="Is it safe to cross?",
        scene_memory=memory,
        active_hazards=[],
    )

    assert res["intent"] == "CHECK_CROSSING"
    assert res["is_safe"] is True

