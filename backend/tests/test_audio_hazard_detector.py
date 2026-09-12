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

    # 3. Keyboard typing transient clicks
    keys = np.zeros(8000, dtype=np.float32)
    for pos in [500, 2000, 4500, 6000]:
        keys[pos:pos + 120] = 0.20 * np.random.randn(120)
    st_keys = detector._process_samples(keys)
    assert st_keys["hazard_detected"] is False

    # 4. High-pitched speaking voice (F0 ~260 Hz with harmonics)
    voice_high = (
        0.08 * np.sin(2 * np.pi * 260 * t)
        + 0.07 * np.sin(2 * np.pi * 520 * t)
        + 0.05 * np.sin(2 * np.pi * 780 * t)
        + 0.04 * np.sin(2 * np.pi * 1040 * t)
        + 0.03 * np.sin(2 * np.pi * 1300 * t)
    ).astype(np.float32)
    st_vhigh = detector._process_samples(voice_high)
    assert st_vhigh["hazard_detected"] is False

    # 5. Sibilant high-frequency speech or typing noise (formerly false-positive tire squeal)
    sibilant = (0.10 * np.sin(2 * np.pi * 3200 * t) + 0.05 * np.random.randn(8000)).astype(np.float32)
    st_sib = detector._process_samples(sibilant)
    assert st_sib["hazard_detected"] is False


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


def test_stereo_chunk_processing_and_direction():
    """Verify stereo interleaved audio data is correctly parsed and yields directional estimation."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 8000
    t = np.linspace(0, 0.5, samples, endpoint=False)

    # Right side has loud horn signal (440 Hz), left side is quiet
    left = (0.01 * np.ones(samples, dtype=np.float32))
    right = (0.25 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    # Interleave to stereo PCM
    stereo_interleaved = np.empty(samples * 2, dtype=np.float32)
    stereo_interleaved[0::2] = left
    stereo_interleaved[1::2] = right

    # Convert to int16 bytes
    int16_data = (stereo_interleaved * 32767).astype(np.int16).tobytes()

    event = detector.process_audio_chunk(int16_data, timestamp=1.0, channels=2)
    assert event is not None
    assert "Horn" in event.sound
    assert event.direction == "Right"


def test_real_world_dual_tone_and_truck_horns():
    """Verify detection of dual-tone automotive chords and truck air horns."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 8000
    t = np.linspace(0, 0.5, samples, endpoint=False)

    # 1. Dual-tone car horn (415 Hz + 505 Hz with realistic harmonics)
    dual_horn = 0.12 * np.sin(2 * np.pi * 415 * t) + 0.10 * np.sin(2 * np.pi * 505 * t)
    dual_horn += 0.05 * np.sin(2 * np.pi * 830 * t) + 0.04 * np.sin(2 * np.pi * 1010 * t)
    dual_horn += 0.01 * np.random.randn(samples)
    st_dual = detector._process_samples(dual_horn.astype(np.float32))
    assert st_dual["hazard_detected"] is True
    assert "HORN" in st_dual["hazard_type"]
    assert st_dual["score"] >= 0.80

    # 2. Heavy truck air horn (310 Hz + 380 Hz)
    truck_horn = 0.15 * np.sin(2 * np.pi * 310 * t) + 0.10 * np.sin(2 * np.pi * 380 * t)
    truck_horn += 0.06 * np.sin(2 * np.pi * 620 * t) + 0.01 * np.random.randn(samples)
    st_truck = detector._process_samples(truck_horn.astype(np.float32))
    assert st_truck["hazard_detected"] is True
    assert "HORN" in st_truck["hazard_type"]

    # 3. Short tap horn (250 ms duration)
    short_horn = np.zeros(samples, dtype=np.float32)
    idx_s, idx_e = int(0.15 * 16000), int(0.40 * 16000)
    short_horn[idx_s:idx_e] = 0.18 * np.sin(2 * np.pi * 440 * t[idx_s:idx_e])
    short_horn += 0.005 * np.random.randn(samples)
    st_short = detector._process_samples(short_horn.astype(np.float32))
    assert st_short["hazard_detected"] is True
    assert "HORN" in st_short["hazard_type"]


def test_real_world_sirens_wail_yelp_and_hilo():
    """Verify detection of sweeping wails, fast yelps, and alternating Hi-Lo emergency sirens."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 8000
    t = np.linspace(0, 0.5, samples, endpoint=False)

    # 1. Continuous Wail Siren Sweep (700 Hz -> 1400 Hz)
    sweep_wail = 700 + 700 * (t / 0.5)
    wail_sig = 0.18 * np.sin(2 * np.pi * np.cumsum(sweep_wail) / 16000) + 0.01 * np.random.randn(samples)
    st_wail = detector._process_samples(wail_sig.astype(np.float32))
    assert st_wail["hazard_detected"] is True
    assert "SIREN" in st_wail["hazard_type"]
    assert st_wail["score"] >= 0.85

    # 2. Rapid Yelp Siren Sweep (700 -> 1500 -> 700 Hz)
    sweep_yelp = 700 + 800 * np.abs(np.sin(2 * np.pi * 3 * t))
    yelp_sig = 0.18 * np.sin(2 * np.pi * np.cumsum(sweep_yelp) / 16000) + 0.01 * np.random.randn(samples)
    st_yelp = detector._process_samples(yelp_sig.astype(np.float32))
    assert st_yelp["hazard_detected"] is True
    assert "SIREN" in st_yelp["hazard_type"]

    # 3. Two-Tone European Hi-Lo Ambulance Siren (700 Hz / 960 Hz alternating)
    hilo = np.zeros(samples, dtype=np.float32)
    hilo[:samples // 2] = 0.18 * np.sin(2 * np.pi * 700 * t[:samples // 2])
    hilo[samples // 2:] = 0.18 * np.sin(2 * np.pi * 960 * t[samples // 2:])
    hilo += 0.01 * np.random.randn(samples)
    st_hilo = detector._process_samples(hilo.astype(np.float32))
    assert st_hilo["hazard_detected"] is True
    assert "SIREN" in st_hilo["hazard_type"]


def test_quiet_sound_detection_above_calibrated_floor():
    """Verify quiet horns and sirens (RMS ~ 0.018) are detected above the calibrated floor."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 8000
    t = np.linspace(0, 0.5, samples, endpoint=False)

    # Quiet siren (RMS ~ 0.018, -35 dBFS)
    quiet_siren = (0.025 * np.sin(2 * np.pi * 1100 * t) + 0.003 * np.random.randn(samples)).astype(np.float32)
    st_siren = detector._process_samples(quiet_siren)
    assert st_siren["hazard_detected"] is True
    assert "SIREN" in st_siren["hazard_type"]

    # Quiet horn (RMS ~ 0.018)
    quiet_horn = (0.025 * np.sin(2 * np.pi * 440 * t) + 0.003 * np.random.randn(samples)).astype(np.float32)
    st_horn = detector._process_samples(quiet_horn)
    assert st_horn["hazard_detected"] is True
    assert "HORN" in st_horn["hazard_type"]


def test_acoustic_classifier_integration():
    """Verify AcousticClassifier adapter detects horns and sirens."""
    from app.audio.classifier import AcousticClassifier

    classifier = AcousticClassifier(sample_rate=16000)
    samples = 8000
    t = np.linspace(0, 0.5, samples, endpoint=False)

    # Horn event
    horn = (0.20 * np.sin(2 * np.pi * 440 * t) + 0.01 * np.random.randn(samples)).astype(np.float32)
    evt_horn = classifier.classify(horn, timestamp=10.0, channels=1)
    assert evt_horn is not None
    assert "Horn" in evt_horn.sound
    assert evt_horn.confidence >= 0.70

    # Siren event
    sweep = 700 + 700 * (t / 0.5)
    siren = (0.20 * np.sin(2 * np.pi * np.cumsum(sweep) / 16000) + 0.01 * np.random.randn(samples)).astype(np.float32)
    evt_siren = classifier.classify(siren, timestamp=11.0, channels=1)
    assert evt_siren is not None
    assert "Siren" in evt_siren.sound
    assert evt_siren.confidence >= 0.75


def test_filtered_room_noise_zero_false_positives():
    """Verify ambient room noise with typical microphone frequency roll-off produces 0 false positives."""
    detector = AudioHazardDetector(sample_rate=16000)
    samples = 8000
    freqs = np.fft.rfftfreq(samples, 1.0 / 16000)

    # Simulate realistic laptop microphone filtering (high-pass < 200 Hz, low-pass > 3500 Hz)
    filter_curve = np.ones_like(freqs)
    filter_curve[freqs < 200] *= 0.05
    filter_curve[freqs > 3500] *= 0.05

    for seed in range(50):
        np.random.seed(seed)
        fft_rand = np.random.randn(samples // 2 + 1) + 1j * np.random.randn(samples // 2 + 1)
        fft_filtered = fft_rand * filter_curve
        noise = np.fft.irfft(fft_filtered, n=samples).astype(np.float32)
        # Scale to typical room microphone noise levels (RMS 0.018 - 0.035)
        target_rms = 0.018 + (seed % 5) * 0.004
        noise = (noise / (np.sqrt(np.mean(noise**2)) + 1e-7)) * target_rms

        st = detector._process_samples(noise)
        assert st["hazard_detected"] is False, f"False positive on seed {seed} with RMS {target_rms:.3f}: {st['hazard_type']}"
        assert detector.to_audio_event() is None


def test_mock_audio_classifier_no_auto_spam():
    """Verify MockAudioClassifier does not emit unprompted audio events by default."""
    from app.audio.classifier import MockAudioClassifier

    classifier = MockAudioClassifier(auto_simulate=False)
    for i in range(100):
        evt = classifier.classify(None, timestamp=float(i))
        assert evt is None



