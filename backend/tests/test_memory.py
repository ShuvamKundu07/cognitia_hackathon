"""Unit tests for temporal hazard memory, grace-period retention, and resolution."""

import time
import pytest
from app.hazards.memory import HazardMemory
from app.hazards.models import Direction, MotionType, TrackedHazard, UrgencyLevel


def test_hazard_memory_grace_period_retention():
    memory = HazardMemory(grace_period_seconds=1.5)
    t0 = 100.0

    car_hazard = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="car",
        first_seen=t0,
        last_seen=t0,
        urgency=UrgencyLevel.HIGH,
    )

    # Frame 1: Detected
    active, resolved = memory.update([car_hazard], timestamp=t0)
    assert len(active) == 1
    assert len(resolved) == 0

    # Frame 2: Missing at t0 + 0.5s (within 1.5s grace period)
    active, resolved = memory.update([], timestamp=t0 + 0.5)
    assert len(active) == 1
    assert active[0].hazard_id == "car_17"
    assert len(resolved) == 0

    # Frame 3: Re-detected at t0 + 1.0s
    car_hazard.last_seen = t0 + 1.0
    active, resolved = memory.update([car_hazard], timestamp=t0 + 1.0)
    assert len(active) == 1
    assert len(resolved) == 0

    # Frame 4: Missing past grace period at t0 + 3.0s (delta 2.0s > 1.5s)
    active, resolved = memory.update([], timestamp=t0 + 3.0)
    assert len(active) == 0
    assert len(resolved) == 1
    assert resolved[0] == "car_17"

