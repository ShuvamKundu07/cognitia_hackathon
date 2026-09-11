"""Unit tests for AudioHazardDetector and multi-modal acoustic sensor fusion."""

import time
import numpy as np
import pytest

from app.audio.hazard_detector import AudioHazardDetector
from app.fusion.sensor_fusion import SensorFusion
from app.hazards.models import (
    AudioEvent,
    BoundingBox,
    Direction,
    MotionType,
    TrackedHazard,
    UrgencyLevel,
)


def test_audio_detector_initialization():
    """Verify AudioHazardDetector initializes with expected state and keywords."""
    detector = AudioHazardDetector(model_dir="models/yamnet_model", sample_rate=16000)
    assert detector.sample_rate == 16000
    assert "siren" in detector.hazard_keywords
    assert "horn" in detector.hazard_keywords
    assert detector.state["hazard_detected"] is False
    assert detector.state["hazard_type"] == "NONE"


def test_ild_directional_estimation():
    """Verify Interaural Level Difference (ILD) estimates Left, Right, and Center directions."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 1024

    # 1. Right-side dominance (loud on channel 1 / right)
    left_weak = np.full((samples, 1), 0.02, dtype=np.float32)
    right_strong = np.full((samples, 1), 0.15, dtype=np.float32)
    stereo_right = np.hstack([left_weak, right_strong])
    st_right = detector._process_samples(stereo_right)
    assert st_right["direction"] == "Right"

    # 2. Left-side dominance (loud on channel 0 / left)
    left_strong = np.full((samples, 1), 0.15, dtype=np.float32)
    right_weak = np.full((samples, 1), 0.02, dtype=np.float32)
    stereo_left = np.hstack([left_strong, right_weak])
    st_left = detector._process_samples(stereo_left)
    assert st_left["direction"] == "Left"

    # 3. Balanced stereo (Center)
    balanced = np.full((samples, 2), 0.08, dtype=np.float32)
    st_center = detector._process_samples(balanced)
    assert st_center["direction"] == "Center"

    # 4. Mono input
    mono = np.full(samples, 0.08, dtype=np.float32)
    st_mono = detector._process_samples(mono)
    assert "Center" in st_mono["direction"]


def test_approach_vector_delta_spl():
    """Verify relative approach vector detects consecutive rising sound pressure levels for hazards."""
    detector = AudioHazardDetector(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)

    # Frame 1: Moderate siren tone
    frame1 = (0.05 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    st1 = detector._process_samples(frame1)
    assert st1["approaching"] is False

    # Frame 2: Rising siren energy
    frame2 = (0.10 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    st2 = detector._process_samples(frame2)
    assert st2["approaching"] is False

    # Frame 3: Further rising siren energy (approaching vehicle alert)
    frame3 = (0.20 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    st3 = detector._process_samples(frame3)
    assert st3["approaching"] is True
    assert st3["hazard_detected"] is True


def test_acoustic_hazard_classification_and_event_conversion():
    """Verify spectral classification flags sirens and vehicle horns."""
    detector = AudioHazardDetector(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)

    # 1. Siren sweep frequency (approx 1100 Hz tone)
    siren_signal = (0.25 * np.sin(2 * np.pi * 1100 * t)).astype(np.float32)
    state = detector._process_samples(siren_signal)

    assert state["hazard_detected"] is True
    assert "SIREN" in state["hazard_type"]

    event = detector.to_audio_event(timestamp=1000.0)
    assert event is not None
    assert "Siren" in event.sound
    assert event.confidence >= 0.70

    # 2. Quiet ambient noise (below MIN_VOLUME_RMS noise gate)
    ambient = (0.005 * np.random.randn(8000)).astype(np.float32)
    state_ambient = detector._process_samples(ambient)
    assert state_ambient["hazard_detected"] is False
    assert state_ambient["hazard_type"] == "NONE (SILENCE)"
    assert state_ambient["score"] == 0.0


def test_sensor_fusion_with_audio_hazard():
    """Verify sensor fusion escalates approaching vehicle when acoustic hazard aligns."""
    fusion = SensorFusion(audio_temporal_window_seconds=2.0)
    t0 = time.time()

    bbox = BoundingBox(x=0.65, y=0.30, width=0.25, height=0.35)
    vehicle = TrackedHazard(
        hazard_id="veh_101",
        track_id="veh_101",
        hazard_type="vehicle",
        label="car",
        first_seen=t0,
        last_seen=t0,
        confidence=0.82,
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        relative_speed=0.50,
        expansion_rate=0.08,
        path_intersection_score=0.75,
        time_to_conflict="high",
        risk_score=0.78,
        urgency=UrgencyLevel.HIGH,
        bboxes=[bbox],
    )

    # Register approaching horn event on the right
    audio_event = AudioEvent(
        sound="Approaching Vehicle Horn",
        direction="Right",
        confidence=0.92,
        timestamp=int(t0 * 1000),
    )
    fusion.register_audio_event(audio_event, timestamp=t0)

    fused = fusion.fuse([vehicle], timestamp=t0)
    assert len(fused) == 1
    # Urgency must be escalated to CRITICAL due to approaching acoustic hazard alignment
    assert fused[0].urgency == UrgencyLevel.CRITICAL
    assert fused[0].confidence > 0.82


def test_vehicle_horn_spectral_detection():
    """Verify bandwidth-normalized classifier reliably detects vehicle horn fundamental."""
    detector = AudioHazardDetector(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    # 440 Hz standard car horn tone with realistic ambient background
    horn_signal = (0.20 * np.sin(2 * np.pi * 440 * t) + 0.02 * np.random.randn(8000)).astype(np.float32)
    state = detector._process_samples(horn_signal)

    assert state["hazard_detected"] is True
    assert "HORN" in state["hazard_type"]

    event = detector.to_audio_event()
    assert event is not None
    assert "Horn" in event.sound
    assert event.confidence >= 0.75


def test_trigger_test_hazard_and_hold_window():
    """Verify manual test hazard triggering and hold window persistence."""
    detector = AudioHazardDetector(sample_rate=16000)
    detector.trigger_test_hazard(sound="Vehicle Horn", direction="Right", confidence=0.96)

    st = detector.state
    assert st["hazard_detected"] is True
    assert st["hazard_type"] == "VEHICLE HORN"
    assert st["direction"] == "Right"

    evt = detector.to_audio_event()
    assert evt is not None
    assert "Horn" in evt.sound
    assert evt.direction == "Right"
    assert evt.confidence == 0.96


def test_rejection_of_speech_and_ambient_noise():
    """Verify human speech and indoor fan/AC noise do not trigger vehicle acoustic alerts."""
    detector = AudioHazardDetector(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)

    # 1. Human speech vowel with fundamental pitch ~140 Hz and formants
    speech = (
        0.05 * np.sin(2 * np.pi * 140 * t)
        + 0.04 * np.sin(2 * np.pi * 280 * t)
        + 0.03 * np.sin(2 * np.pi * 520 * t)
        + 0.02 * np.sin(2 * np.pi * 1600 * t)
    ).astype(np.float32)
    st_speech = detector._process_samples(speech)
    assert st_speech["hazard_detected"] is False
    assert st_speech["hazard_type"] == "NONE"

    # 2. Indoor fan / AC pink noise
    np.random.seed(42)
    pink = np.cumsum(0.005 * np.random.randn(8000)).astype(np.float32)
    pink = (pink / np.std(pink)) * 0.045
    st_pink = detector._process_samples(pink)
    assert st_pink["hazard_detected"] is False


def test_stable_acoustic_hazard_id_and_cooldown():
    """Verify acoustic hazards use stable IDs and alert generator prevents repetitive alert spam."""
    from app.hazards.alerts import AlertGenerator

    fusion = SensorFusion()
    alert_gen = AlertGenerator(cooldown_seconds=8.0)
    t0 = time.time()

    evt = AudioEvent(sound="Vehicle Horn", direction="Right", confidence=0.92, timestamp=int(t0 * 1000))
    hazard1 = fusion._create_acoustic_hazard(evt, timestamp=t0)
    hazard2 = fusion._create_acoustic_hazard(evt, timestamp=t0 + 0.5)

    # Must produce identical stable IDs, not timestamped IDs
    assert hazard1.hazard_id == hazard2.hazard_id
    assert hazard1.hazard_id == "acoustic_vehicle_horn_right"

    # First alert triggers
    alert1 = alert_gen.generate_alert(hazard1, timestamp=t0)
    assert alert1 is not None
    assert "Vehicle horn" in alert1.message

    # Second alert 0.5s later must be suppressed by cooldown (no repeated spamming!)
    alert2 = alert_gen.generate_alert(hazard2, timestamp=t0 + 0.5)
    assert alert2 is None

