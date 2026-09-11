"""Unit tests for alert deduplication and re-alerting upon state escalation."""

import pytest
from app.hazards.alerts import AlertGenerator
from app.hazards.models import Direction, MotionType, TrackedHazard, UrgencyLevel


def test_alert_suppression_unchanged_hazard():
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 1000.0

    car = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.9,
        path_intersection_score=0.2,
    )

    # First alert should trigger
    alert1 = generator.generate_alert(car, timestamp=t0)
    assert alert1 is not None
    assert "Vehicle detected on the right" in alert1.message

    # Same hazard remains unchanged 2 seconds later -> MUST be suppressed
    alert2 = generator.generate_alert(car, timestamp=t0 + 2.0)
    assert alert2 is None


def test_alert_re_triggers_on_urgency_escalation():
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 1000.0

    car = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.9,
    )

    alert1 = generator.generate_alert(car, timestamp=t0)
    assert alert1 is not None

    # Urgency escalates to CRITICAL at t0 + 1.5s -> MUST re-alert immediately
    car.urgency = UrgencyLevel.CRITICAL
    alert2 = generator.generate_alert(car, timestamp=t0 + 1.5)
    assert alert2 is not None
    assert alert2.urgency == "CRITICAL"
    assert "Stop" in alert2.message


def test_alert_re_triggers_on_entering_path():
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 1000.0

    car = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.9,
        path_intersection_score=0.1,  # initially off path
    )

    generator.generate_alert(car, timestamp=t0)

    # Object swerves into walking corridor
    car.path_intersection_score = 0.85
    alert_in_path = generator.generate_alert(car, timestamp=t0 + 2.0)
    assert alert_in_path is not None


def test_five_same_alerts_only_one_heard_within_interval():
    """Verify that if 5 same alerts arise, only ONE alert is triggered within the set cooldown interval."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 2000.0

    alerts_received = []

    # 5 same hazards arrive in rapid succession (e.g. 5 consecutive video frames)
    for i in range(5):
        pothole = TrackedHazard(
            hazard_id=f"pothole_{i}",  # Even with shifting detection/tracker IDs
            track_id=str(i),
            hazard_type="surface",
            label="pothole",
            direction=Direction.AHEAD,
            urgency=UrgencyLevel.HIGH,
            confidence=0.88,
            path_intersection_score=0.6,
        )
        alert = generator.generate_alert(pothole, timestamp=t0 + (i * 0.2))  # Arriving every 200ms
        if alert is not None:
            alerts_received.append(alert)

    # Exactly 1 alert must be triggered, the other 4 must be suppressed
    assert len(alerts_received) == 1
    assert "Caution. Pothole detected straight ahead." in alerts_received[0].message

    # After cooldown expires (> 8.0s), the same alert can trigger again
    pothole_later = TrackedHazard(
        hazard_id="pothole_5",
        track_id="5",
        hazard_type="surface",
        label="pothole",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.HIGH,
        confidence=0.88,
        path_intersection_score=0.6,
    )
    alert_after_cooldown = generator.generate_alert(pothole_later, timestamp=t0 + 8.5)
    assert alert_after_cooldown is not None


