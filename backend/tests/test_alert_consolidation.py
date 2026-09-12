"""Unit tests for multi-hazard alert consolidation, grouping, and intelligent cooldown."""

import pytest
from app.hazards.alerts import AlertGenerator
from app.hazards.models import BoundingBox, Direction, MotionType, TrackedHazard, UrgencyLevel


def test_consolidates_four_cars_into_single_alert():
    """Verify 4 simultaneous cars produce ONE consolidated alert, not 4 separate alerts."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 1000.0

    cars = [
        TrackedHazard(
            hazard_id=f"car_{i}",
            track_id=str(i),
            hazard_type="vehicle",
            label="car",
            direction=Direction.AHEAD,
            urgency=UrgencyLevel.HIGH,
            confidence=0.92,
            path_intersection_score=0.4,
        )
        for i in range(4)
    ]

    alert = generator.generate_consolidated_alert(cars, timestamp=t0)
    assert alert is not None
    assert "Multiple cars detected ahead" in alert.message or "multiple vehicles" in alert.message.lower()

    # Next frame with same 4 cars arrives 500ms later -> MUST be suppressed by cooldown
    alert2 = generator.generate_consolidated_alert(cars, timestamp=t0 + 0.5)
    assert alert2 is None


def test_consolidates_five_pedestrians_into_single_alert():
    """Verify 5 simultaneous pedestrians produce ONE consolidated alert."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 2000.0

    pedestrians = [
        TrackedHazard(
            hazard_id=f"ped_{i}",
            track_id=str(i),
            hazard_type="pedestrian",
            label="pedestrian",
            direction=Direction.AHEAD,
            urgency=UrgencyLevel.MEDIUM,
            confidence=0.88,
        )
        for i in range(5)
    ]

    alert = generator.generate_consolidated_alert(pedestrians, timestamp=t0)
    assert alert is not None
    assert "Multiple pedestrians detected ahead" in alert.message

    # Repeat 1 second later -> suppressed
    assert generator.generate_consolidated_alert(pedestrians, timestamp=t0 + 1.0) is None


def test_mixed_hazards_prioritized_combination():
    """Verify mixed simultaneous hazards combine with highest danger first:
    'Warning: car approaching from the right. Multiple obstacles ahead.'
    """
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 3000.0

    approaching_car = TrackedHazard(
        hazard_id="car_fast",
        track_id="101",
        hazard_type="vehicle",
        label="car",
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        urgency=UrgencyLevel.HIGH,
        confidence=0.95,
        expansion_rate=0.25,
        path_intersection_score=0.3,
    )

    obstacle1 = TrackedHazard(
        hazard_id="obs_1",
        track_id="102",
        hazard_type="surface",
        label="pothole",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.MEDIUM,
        confidence=0.82,
    )

    obstacle2 = TrackedHazard(
        hazard_id="obs_2",
        track_id="103",
        hazard_type="obstacle",
        label="cone",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.LOW,
        confidence=0.75,
    )

    hazards = [approaching_car, obstacle1, obstacle2]
    alert = generator.generate_consolidated_alert(hazards, timestamp=t0)

    assert alert is not None
    assert "Warning" in alert.message or "Stop" in alert.message
    assert "approaching from the right" in alert.message
    assert "Multiple obstacles ahead" in alert.message


def test_reappearance_after_disappearance_triggers_alert():
    """Verify a hazard that disappears for > 3.0s and reappears triggers a new alert."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 4000.0

    car = TrackedHazard(
        hazard_id="car_temp",
        track_id="50",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.9,
    )

    # First alert
    alert1 = generator.generate_alert(car, timestamp=t0)
    assert alert1 is not None

    # While present within cooldown, suppressed
    assert generator.generate_alert(car, timestamp=t0 + 1.0) is None

    # Now the hazard was absent for 3.5s and reappears at t0 + 4.5s (still within 8s cooldown!)
    alert_reappear = generator.generate_alert(car, timestamp=t0 + 4.5)
    assert alert_reappear is not None


def test_urgency_escalation_in_consolidated_alert():
    """Verify that if one hazard escalates to CRITICAL in a cluster, an immediate alert fires."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    t0 = 5000.0

    car = TrackedHazard(
        hazard_id="car_esc",
        track_id="60",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.9,
    )
    ped = TrackedHazard(
        hazard_id="ped_esc",
        track_id="61",
        hazard_type="pedestrian",
        label="pedestrian",
        direction=Direction.LEFT,
        urgency=UrgencyLevel.MEDIUM,
        confidence=0.85,
    )

    alert1 = generator.generate_consolidated_alert([car, ped], timestamp=t0)
    assert alert1 is not None
    assert alert1.urgency == "HIGH"

    # Car escalates to CRITICAL 1.0s later
    car.urgency = UrgencyLevel.CRITICAL
    alert2 = generator.generate_consolidated_alert([car, ped], timestamp=t0 + 1.0)
    assert alert2 is not None
    assert alert2.urgency == "CRITICAL"
    assert alert2.interrupt is True


def test_directional_evasion_right_hazard():
    """Hazard on the right must instruct user to move left."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    car_right = TrackedHazard(
        hazard_id="car_right_1",
        track_id="71",
        hazard_type="vehicle",
        label="car",
        direction=Direction.RIGHT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.94,
    )
    alert = generator.generate_alert(car_right, timestamp=6000.0)
    assert alert is not None
    assert alert.movement_direction == "left"
    assert "Move left" in alert.message
    assert "MOVE LEFT" in alert.action


def test_directional_evasion_left_hazard():
    """Hazard on the left must instruct user to move right."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    ped_left = TrackedHazard(
        hazard_id="ped_left_1",
        track_id="72",
        hazard_type="pedestrian",
        label="pedestrian",
        direction=Direction.LEFT,
        urgency=UrgencyLevel.HIGH,
        confidence=0.91,
    )
    alert = generator.generate_alert(ped_left, timestamp=7000.0)
    assert alert is not None
    assert alert.movement_direction == "right"
    assert "Move right" in alert.message
    assert "MOVE RIGHT" in alert.action


def test_directional_evasion_center_hazard_bypass():
    """Obstacle in center-right of corridor instructs step left; center-left instructs step right."""
    generator = AlertGenerator(cooldown_seconds=8.0)

    # Obstacle on right side of path (cx = 0.55 >= 0.50) -> Step left
    obs_right_side = TrackedHazard(
        hazard_id="pothole_cr",
        track_id="73",
        hazard_type="surface",
        label="pothole",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.HIGH,
        confidence=0.89,
        bboxes=[BoundingBox(x=0.45, y=0.6, width=0.2, height=0.15)],  # cx = 0.55
    )
    alert_cr = generator.generate_alert(obs_right_side, timestamp=8000.0)
    assert alert_cr is not None
    assert alert_cr.movement_direction == "left"
    assert "Step left to bypass" in alert_cr.message

    # Obstacle on left side of path (cx = 0.40 < 0.50) -> Step right
    generator.reset_cache()
    obs_left_side = TrackedHazard(
        hazard_id="pothole_cl",
        track_id="74",
        hazard_type="surface",
        label="pothole",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.HIGH,
        confidence=0.89,
        bboxes=[BoundingBox(x=0.30, y=0.6, width=0.2, height=0.15)],  # cx = 0.40
    )
    alert_cl = generator.generate_alert(obs_left_side, timestamp=8010.0)
    assert alert_cl is not None
    assert alert_cl.movement_direction == "right"
    assert "Step right to bypass" in alert_cl.message


def test_critical_stop_evasion():
    """Imminent critical collision straight ahead instructs immediate stop."""
    generator = AlertGenerator(cooldown_seconds=8.0)
    car_ahead = TrackedHazard(
        hazard_id="car_crit_ahead",
        track_id="75",
        hazard_type="vehicle",
        label="car",
        direction=Direction.AHEAD,
        urgency=UrgencyLevel.CRITICAL,
        confidence=0.96,
        motion=MotionType.APPROACHING,
    )
    alert = generator.generate_alert(car_ahead, timestamp=9000.0)
    assert alert is not None
    assert alert.movement_direction == "stop"
    assert "Stop immediately" in alert.message
    assert "STOP IMMEDIATELY" in alert.action



