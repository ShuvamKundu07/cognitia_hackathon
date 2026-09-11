"""Unit tests for multi-modal audio-visual sensor fusion."""

import pytest
from app.fusion.sensor_fusion import SensorFusion
from app.hazards.models import AudioEvent, BoundingBox, Direction, MotionType, TrackedHazard, UrgencyLevel


def test_sensor_fusion_direction_alignment_boost():
    fusion = SensorFusion(audio_temporal_window_seconds=2.0)
    t0 = 100.0

    # Visual car on right with initial confidence 0.82
    car = TrackedHazard(
        hazard_id="car_17",
        track_id="17",
        hazard_type="vehicle",
        label="vehicle",
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        confidence=0.82,
        urgency=UrgencyLevel.HIGH,
    )

    # Register acoustic horn on right
    horn_event = AudioEvent(
        sound="Vehicle Horn",
        direction="Right",
        confidence=0.92,
        timestamp=int(t0 * 1000),
    )
    fusion.register_audio_event(horn_event, timestamp=t0)

    fused = fusion.fuse([car], timestamp=t0 + 0.1)

    assert len(fused) == 1
    fused_car = fused[0]
    # Confidence should be boosted from 0.82
    assert fused_car.confidence > 0.82
    # Urgency escalated to CRITICAL for approaching vehicle confirmed by horn
    assert fused_car.urgency == UrgencyLevel.CRITICAL


def test_sensor_fusion_audio_only_hazard():
    fusion = SensorFusion(audio_temporal_window_seconds=2.0)
    t0 = 100.0

    # Acoustic emergency siren detected with no visual obstacles in view
    siren = AudioEvent(
        sound="Emergency Siren",
        direction="Ahead",
        confidence=0.96,
        timestamp=int(t0 * 1000),
    )
    fusion.register_audio_event(siren, timestamp=t0)

    fused = fusion.fuse([], timestamp=t0 + 0.2)

    assert len(fused) == 1
    acoustic_hazard = fused[0]
    assert acoustic_hazard.hazard_type == "acoustic"
    assert "Siren" in acoustic_hazard.label
    assert acoustic_hazard.urgency == UrgencyLevel.CRITICAL


def test_sensor_fusion_360_left_in_view_and_blindspot():
    fusion = SensorFusion()
    evt = AudioEvent(sound="Vehicle Horn", direction="Left", confidence=0.90)

    # 1. Left sound with visual vehicle at x=0.20 (in view < 0.33)
    zone, urg, lvl, msg = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.20])
    assert zone == "LEFT (IN VIEW)"
    assert urg == "WARNING"
    assert lvl == UrgencyLevel.HIGH
    assert "WARNING: Vehicle Horn [LEFT (IN VIEW)]" in msg

    # 2. Left sound with no vehicle on left (e.g. vehicle at x=0.75 or empty)
    zone_b, urg_b, lvl_b, msg_b = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.75])
    assert zone_b == "LEFT BLINDSPOT"
    assert urg_b == "CRITICAL"
    assert lvl_b == UrgencyLevel.CRITICAL
    assert "CRITICAL: Vehicle Horn [LEFT BLINDSPOT]" in msg_b


def test_sensor_fusion_360_right_in_view_and_blindspot():
    fusion = SensorFusion()
    evt = AudioEvent(sound="Vehicle Horn", direction="Right", confidence=0.88)

    # 1. Right sound with vehicle at x=0.80 (in view > 0.66)
    zone, urg, lvl, msg = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.80])
    assert zone == "RIGHT (IN VIEW)"
    assert urg == "WARNING"
    assert lvl == UrgencyLevel.HIGH

    # 2. Right sound with empty visual
    zone_b, urg_b, lvl_b, msg_b = fusion.evaluate_360_fusion(evt, visual_vehicles=[])
    assert zone_b == "RIGHT BLINDSPOT"
    assert urg_b == "CRITICAL"
    assert lvl_b == UrgencyLevel.CRITICAL


def test_sensor_fusion_360_center_in_view_and_rear_blindspot():
    fusion = SensorFusion()
    evt = AudioEvent(sound="Truck", direction="Center", confidence=0.92)

    # 1. Center sound with vehicle at x=0.50 (in view 0.25 <= x <= 0.75)
    zone, urg, lvl, msg = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.50])
    assert zone == "AHEAD (IN VIEW)"
    assert urg == "TRACKED"
    assert lvl == UrgencyLevel.MEDIUM

    # 2. Center sound with no vehicle in front corridor -> rear approach!
    zone_b, urg_b, lvl_b, msg_b = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.10, 0.90])
    assert zone_b == "BEHIND (REAR BLINDSPOT)"
    assert urg_b == "CRITICAL"
    assert lvl_b == UrgencyLevel.CRITICAL
    assert "CRITICAL: Truck [BEHIND (REAR BLINDSPOT)]" in msg_b


def test_sensor_fusion_360_rapid_approach_escalation():
    fusion = SensorFusion()
    # Acoustic sound with approaching flag
    evt = AudioEvent(sound="Approaching Motorcycle", direction="Right", confidence=0.95)
    zone, urg, lvl, msg = fusion.evaluate_360_fusion(evt, visual_vehicles=[0.85])

    # Even though in view on right, rapid approach forces CRITICAL
    assert zone == "RIGHT (IN VIEW)"
    assert urg == "CRITICAL"
    assert lvl == UrgencyLevel.CRITICAL
    assert "- RAPID APPROACH!" in msg


def test_sensor_fusion_classify_hazard_zone_helper():
    fusion = SensorFusion()
    zone, urg = fusion.classify_hazard_zone("Left", visual_vehicles=[])
    assert zone == "LEFT BLINDSPOT"
    assert urg == "CRITICAL"

    zone2, urg2 = fusion.classify_hazard_zone("Center", visual_vehicles=[0.5])
    assert zone2 == "AHEAD (IN VIEW)"
    assert urg2 == "TRACKED"


