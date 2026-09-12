"""Audio Hazard Detection Engine for low-vision pedestrian safety.

Features:
- Directional Estimation via Interaural Level Difference (ILD)
- Approach Vector Estimation via Delta SPL (3-frame rising RMS energy)
- Acoustic Hazard Classification (Siren, Horn, Engine, Motorcycle, Tire Squeal, Truck)
  using local YAMNet model when available, with spectral-energy fallback.
- Thread-safe state for real-time sensor fusion with video detection.
"""

import csv
import logging
import os
import time
from typing import Any, Dict, List, Optional
import numpy as np

try:
    import tensorflow as tf
except ImportError:
    tf = None

from app.audio.preprocessing import AudioPreprocessor
from app.config import settings
from app.hazards.models import AudioEvent

logger = logging.getLogger("audio.hazard_detector")



class AudioHazardDetector:
    """Real-time acoustic hazard detector with directional and approach vector estimation."""

    def __init__(
        self,
        model_dir: str = "./yamnet_model",
        sample_rate: int = 16000,
        chunk_duration: float = 0.5,
    ):
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * chunk_duration)
        self.model_dir = os.path.abspath(model_dir)

        self.hazard_keywords = ["siren", "horn"]
        self.yamnet = None
        self.class_names: List[str] = []
        self.tf = None

        # Attempt to load local YAMNet model if TensorFlow and model directory are present
        self._init_yamnet()

        self.preprocessor = AudioPreprocessor(sample_rate=self.sample_rate)

        # Explicit activation control: starts disabled in web mode until user clicks mic button
        self.enabled = True

        # Thread-safe dictionary read by sensor fusion and WebSocket server
        self.state: Dict[str, Any] = {
            "hazard_detected": False,
            "hazard_type": "NONE",
            "direction": "Center",
            "approaching": False,
            "score": 0.0,
            "rms": 0.0,
            "timestamp": time.time(),
        }

        # Latch window: hold active hazard state for 2.5 seconds so short acoustic events
        # (e.g. 0.5s horn honk) are not missed by asynchronous polling or video workers
        self.hazard_hold_duration = 2.5
        self._last_hazard_time = 0.0
        self._last_hazard_data: Optional[Dict[str, Any]] = None

        self.rms_history: List[float] = []
        self.stream = None
        self.channels = 1
        self._is_running = False

    def enable(self) -> None:
        """Enables acoustic hazard detection."""
        self.enabled = True
        logger.info("[AUDIO] AudioHazardDetector ENABLED.")

    def disable(self) -> None:
        """Disables acoustic hazard detection and clears pending hazard state."""
        self.enabled = False
        self.state = {
            "hazard_detected": False,
            "hazard_type": "NONE",
            "direction": "Center",
            "approaching": False,
            "score": 0.0,
            "rms": 0.0,
            "timestamp": time.time(),
        }
        self._last_hazard_data = None
        self._last_hazard_time = 0.0
        logger.info("[AUDIO] AudioHazardDetector DISABLED.")

    def trigger_test_hazard(
        self,
        sound: str = "Vehicle Horn",
        direction: str = "Right",
        confidence: float = 0.95,
        approaching: bool = True,
    ) -> Dict[str, Any]:
        """Manually triggers an acoustic hazard for immediate testing and demonstration."""
        self.enabled = True
        now_ts = time.time()
        self._last_hazard_time = now_ts
        self._last_hazard_data = {
            "hazard_detected": True,
            "hazard_type": sound.upper(),
            "direction": direction,
            "approaching": approaching,
            "score": round(confidence, 2),
            "rms": 0.08,
            "timestamp": now_ts,
        }
        self.state = dict(self._last_hazard_data)
        logger.info("[AUDIO TEST] Triggered synthetic hazard: %s from %s", sound, direction)
        return self.state

    def _init_yamnet(self) -> None:
        """Attempts to load YAMNet offline model from local directory."""
        if getattr(settings, "mock_mode", False):
            logger.info("Running in MOCK MODE: YAMNet audio model bypassed to save RAM.")
            return

        if not os.path.exists(self.model_dir):
            logger.info(
                "Local YAMNet directory '%s' not found. AudioHazardDetector will run in spectral-energy fallback mode.",
                self.model_dir,
            )
            return

        try:
            import tensorflow as tf
            import tensorflow_hub as hub

            self.tf = tf
            self.yamnet = hub.load(self.model_dir)

            class_map_path = self.yamnet.class_map_path().numpy().decode("utf-8")
            self.class_names = []
            with open(class_map_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader)  # Skip header
                for row in reader:
                    self.class_names.append(row[2])

            logger.info("YAMNet offline model loaded successfully from %s with %d classes.", self.model_dir, len(self.class_names))
        except Exception as e:
            logger.warning("Could not load YAMNet model from '%s' (%s). Using spectral acoustic classifier.", self.model_dir, e)
            self.yamnet = None

    def _process_samples(self, indata: np.ndarray) -> Dict[str, Any]:
        """Core signal processing and classification on incoming audio buffer.

        Args:
            indata: Numpy array of shape (samples, channels) or (samples,).
        """
        self._audio_callback(indata, frames=len(indata), time_info=None, status=None)
        return self.state

    def _spectral_classify(self, mono_samples: np.ndarray, rms: float) -> tuple[str, float, bool]:
        """High-precision acoustic classifier focused strictly on vehicle warning sounds.

        Detects vehicle warning signals: Vehicle Horn (single-tone, dual-tone, truck/bus horns)
        and Emergency Siren (wail sweeps, yelp sweeps, two-tone Hi-Lo).
        Rejects ambient room static, HVAC/fan hum, keyboard typing, claps, human speech, and transient bursts.
        """
        if len(mono_samples) < 256 or rms < 0.015:
            return "NONE (SILENCE)", 0.0, False

        # 1. Transient Click & Decay Rejection
        peak_val = float(np.max(np.abs(mono_samples)))
        crest_factor = peak_val / (rms + 1e-6)

        # Subframe envelope analysis (4 subframes of 125ms for a 0.5s chunk)
        n_sub = 4
        sub_len = len(mono_samples) // n_sub
        sub_rms = [
            float(np.sqrt(np.mean(mono_samples[i * sub_len : (i + 1) * sub_len] ** 2) + 1e-7))
            for i in range(n_sub)
        ]
        active_subs = [r for r in sub_rms if r >= 0.010]

        # Reject isolated transient clicks (<60ms spike with high crest factor)
        if len(active_subs) <= 1 and crest_factor > 6.0:
            return "NONE (TRANSIENT)", 0.0, False

        # Short window duration check (25ms windows = 400 samples at 16kHz)
        win_size = max(64, int(self.sample_rate * 0.025))
        n_wins = len(mono_samples) // win_size
        win_rms = [
            float(np.sqrt(np.mean(mono_samples[i * win_size : (i + 1) * win_size] ** 2)))
            for i in range(n_wins)
        ]
        sustained_wins = [w for w in win_rms if w >= 0.012]

        # 2. Global FFT Frequency Domain Analysis
        fft_vals = np.abs(np.fft.rfft(mono_samples))
        freqs = np.fft.rfftfreq(len(mono_samples), 1.0 / self.sample_rate)

        # Acoustic passband (200 - 3500 Hz): normalizes against mic high-pass and anti-aliasing roll-off
        passband_mask = (freqs >= 200) & (freqs <= 3500)
        passband_energy = float(np.sum(fft_vals[passband_mask])) + 1e-6
        passband_median = float(np.median(fft_vals[passband_mask])) + 1e-6

        # Human vocal fundamental band (85 - 260 Hz)
        vocal_fund_mask = (freqs >= 85) & (freqs <= 260)
        vocal_fund_energy = float(np.sum(fft_vals[vocal_fund_mask]))

        # Sub-500Hz energy (speech vowels, bass rumble, ambient traffic hum)
        sub500_mask = freqs < 500
        sub500_energy = float(np.sum(fft_vals[sub500_mask]))

        # High-frequency band (>3200 Hz)
        high_mask = freqs > 3200
        high_energy = float(np.sum(fft_vals[high_mask]))

        # --- 1. Vehicle Horn Analysis: 280 - 720 Hz fundamental (dual-tone, single tone, truck air horns) ---
        horn_mask = (freqs >= 280) & (freqs <= 720)
        horn_energy = float(np.sum(fft_vals[horn_mask]))
        horn_peak = float(np.max(fft_vals[horn_mask])) if np.any(horn_mask) else 0.0
        horn_share_pass = horn_energy / passband_energy
        horn_peak_ratio = horn_peak / passband_median

        # Automotive horns generate rich harmonics in 720 - 2200 Hz
        horn_harmonics_mask = (freqs >= 720) & (freqs <= 2200)
        horn_harm_energy = float(np.sum(fft_vals[horn_harmonics_mask]))
        pitch_to_horn = vocal_fund_energy / (horn_energy + 1e-6)

        # --- 2. Emergency Siren Analysis: 650 - 1800 Hz (wail sweeps, yelp sweeps, Hi-Lo sirens) ---
        siren_mask = (freqs >= 650) & (freqs <= 1800)
        siren_energy = float(np.sum(fft_vals[siren_mask]))
        siren_peak = float(np.max(fft_vals[siren_mask])) if np.any(siren_mask) else 0.0
        siren_share_pass = siren_energy / passband_energy
        siren_peak_ratio = siren_peak / passband_median

        sub500_to_siren = sub500_energy / (siren_energy + 1e-6)
        vocal_to_siren = vocal_fund_energy / (siren_energy + 1e-6)

        # Subframe spectral peak tracking (critical for sweeping wail and yelp sirens)
        siren_sub_peaks = []
        for i in range(n_sub):
            sub_chunk = mono_samples[i * sub_len : (i + 1) * sub_len]
            if len(sub_chunk) >= 64:
                sub_fft = np.abs(np.fft.rfft(sub_chunk))
                sub_freqs = np.fft.rfftfreq(len(sub_chunk), 1.0 / self.sample_rate)
                sub_pass_mask = (sub_freqs >= 200) & (sub_freqs <= 3500)
                sub_pass_med = float(np.median(sub_fft[sub_pass_mask])) + 1e-6 if np.any(sub_pass_mask) else 1e-6
                sub_s_mask = (sub_freqs >= 650) & (sub_freqs <= 1800)
                if np.any(sub_s_mask):
                    sub_s_vals = sub_fft[sub_s_mask]
                    sub_max = float(np.max(sub_s_vals))
                    siren_sub_peaks.append(sub_max / sub_pass_med)

        avg_siren_sub_peak = float(np.mean(siren_sub_peaks)) if siren_sub_peaks else 0.0

        # Classification decision rules:
        # A. Emergency Siren:
        # High concentration in passband 650-1800 Hz (>= 35%), low energy below 500 Hz, absence of vocal chord fundamental,
        # and sharp subframe/global tonal resonance relative to passband median
        is_siren = (
            siren_share_pass >= 0.35
            and sub500_to_siren < 0.60
            and vocal_to_siren < 0.25
            and (siren_peak_ratio >= 8.0 or avg_siren_sub_peak >= 7.0)
        )

        # B. Vehicle Horn:
        # Strong resonant band in 280-720 Hz (>= 22% of passband or fundamental + harmonics >= 50% of passband),
        # peak prominence >= 8x passband median, low vocal fundamental (<0.35 of horn band to reject speech),
        # sustained duration (>=5 windows = 125ms)
        is_horn = (
            (
                horn_share_pass >= 0.22
                or (horn_energy + horn_harm_energy) / passband_energy >= 0.50
            )
            and horn_peak_ratio >= 8.0
            and pitch_to_horn < 0.35
            and sub500_energy > vocal_fund_energy * 1.3
            and len(sustained_wins) >= 5
        )

        if is_siren:
            conf = min(0.98, round(0.72 + max(siren_share_pass, min(0.6, siren_peak_ratio / 50.0)) * 0.35, 2))
            return "EMERGENCY SIREN", conf, True
        elif is_horn:
            conf = min(0.98, round(0.70 + max(horn_share_pass, min(0.6, horn_peak_ratio / 50.0)) * 0.45, 2))
            return "VEHICLE HORN", conf, True

        return "NONE", 0.0, False

    def _audio_callback(self, indata, frames, time_info, status):
        """Callback invoked by sounddevice InputStream and processing pipeline."""
        if status:
            pass  # Suppress CoreAudio buffer underruns

        # Ensure 2D shape (samples, channels)
        if indata.ndim == 1:
            indata = indata.reshape(-1, 1)

        channels = indata.shape[1] if indata.ndim > 1 else self.channels

        # --- 1. Directional Estimation (ILD) ---
        if channels >= 2:
            left_ch = indata[:, 0]
            right_ch = indata[:, 1]
            rms_l = np.sqrt(np.mean(left_ch**2) + 1e-7)
            rms_r = np.sqrt(np.mean(right_ch**2) + 1e-7)

            balance = (rms_r - rms_l) / (rms_r + rms_l)
            if balance > 0.25:
                direction = "Right"
            elif balance < -0.25:
                direction = "Left"
            else:
                direction = "Center"
        else:
            direction = "Center (Mono Mic)"

        # --- 2. Relative Approach Vector (Delta SPL) ---
        rms_total = float(np.sqrt(np.mean(indata**2) + 1e-7))
        self.rms_history.append(rms_total)
        if len(self.rms_history) > 3:
            self.rms_history.pop(0)

        approaching = False
        if len(self.rms_history) == 3:
            delta_1 = self.rms_history[1] - self.rms_history[0]
            delta_2 = self.rms_history[2] - self.rms_history[1]
            if delta_1 > 0.005 and delta_2 > 0.005:
                approaching = True

        # ==========================================
        # NOISE GATE & SENSITIVITY CALIBRATION
        # ==========================================
        MIN_VOLUME_RMS = 0.015  # Calibrated noise floor (~ -36 dBFS)
        CONFIDENCE_THRESHOLD = 0.70  # Require 70% certainty to reject non-hazard sounds

        if rms_total < MIN_VOLUME_RMS:
            self.state["hazard_detected"] = False
            self.state["hazard_type"] = "NONE (SILENCE)"
            self.state["direction"] = direction
            self.state["approaching"] = False
            self.state["score"] = 0.0
            self.state["rms"] = round(rms_total, 4)
            return

        # --- 3. Offline YAMNet or Spectral Classification ---
        mono_chunk = (
            np.mean(indata, axis=1, dtype=np.float32)
            if channels > 1
            else indata[:, 0].astype(np.float32)
        )

        yamnet_instance = self.yamnet
        tf_module = self.tf or tf

        if yamnet_instance is not None and tf_module is not None:
            scores, _, _ = yamnet_instance(mono_chunk)
            mean_scores = tf_module.reduce_mean(scores, axis=0)
            top_idx = int(tf_module.math.argmax(mean_scores).numpy())
            top_label = self.class_names[top_idx].lower()
            top_score = float(mean_scores[top_idx].numpy())
            is_hazard = any(keyword in top_label for keyword in self.hazard_keywords)
        else:
            top_label, top_score, is_hazard = self._spectral_classify(mono_chunk, rms_total)

        # Do not detect or report ambient engine rumble
        if "engine" in top_label.lower():
            is_hazard = False

        if is_hazard and top_score > CONFIDENCE_THRESHOLD:
            now_ts = time.time()
            self._last_hazard_time = now_ts
            self.state["hazard_detected"] = True
            self.state["hazard_type"] = top_label.upper()
            self.state["direction"] = direction
            self.state["approaching"] = approaching
            self.state["score"] = round(top_score, 2)
            self.state["rms"] = round(rms_total, 4)
            self.state["timestamp"] = now_ts
            self._last_hazard_data = dict(self.state)
        else:
            self.state["hazard_detected"] = False
            self.state["hazard_type"] = "NONE"
            self.state["direction"] = direction
            self.state["approaching"] = False
            self.state["score"] = round(top_score, 2)
            self.state["rms"] = round(rms_total, 4)
            self.state["timestamp"] = time.time()

    def process_audio_chunk(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
        channels: int = 2,
    ) -> Optional[AudioEvent]:
        """Classifies incoming decoded or encoded audio data from WebSocket."""
        samples = self.preprocessor.decode_audio_chunk(raw_audio, channels=channels)
        if samples is None or len(samples) < 256:
            return None

        # Auto-enable detector when explicit audio chunk is received
        self.enabled = True
        state = self._process_samples(samples)
        if state.get("hazard_detected"):
            return self.to_audio_event(timestamp=timestamp)
        return None

    def to_audio_event(self, timestamp: float = 0.0) -> Optional[AudioEvent]:
        """Converts current state into an AudioEvent if a hazard is active and detector is enabled."""
        if not self.enabled:
            return None

        now_ts = time.time()
        # Ensure state reflects hold window
        if self._last_hazard_data and (now_ts - self._last_hazard_time < self.hazard_hold_duration):
            active_data = self._last_hazard_data
        elif self.state.get("hazard_detected"):
            active_data = self.state
        else:
            return None

        hazard_label = active_data.get("hazard_type", "ACOUSTIC HAZARD").title()
        if "engine" in hazard_label.lower():
            return None

        ts = timestamp if timestamp > 0.0 else active_data.get("timestamp", now_ts)
        raw_dir = active_data.get("direction", "Center")
        # Normalize direction string
        dir_clean = "Center"
        if "right" in raw_dir.lower():
            dir_clean = "Right"
        elif "left" in raw_dir.lower():
            dir_clean = "Left"

        if active_data.get("approaching") and not hazard_label.lower().startswith("approaching"):
            hazard_label = f"Approaching {hazard_label}"

        return AudioEvent(
            sound=hazard_label,
            direction=dir_clean,
            confidence=float(active_data.get("score", 0.85)),
            timestamp=int(ts * 1000),
        )

    def get_latest_event(self) -> Optional[Dict[str, Any]]:
        """Returns the latest active audio hazard event dict or None.
        
        Compatible with:
            audio_event = audio_sensor.get_latest_event()
            sound_type = audio_event['label']
            audio_dir = audio_event['direction']  # 'Left', 'Right', 'Center'
            is_approaching = audio_event['approaching']  # True / False
        """
        if not self.enabled:
            return None

        now_ts = time.time()
        if self._last_hazard_data and (now_ts - self._last_hazard_time < self.hazard_hold_duration):
            active_data = self._last_hazard_data
        elif self.state.get("hazard_detected"):
            active_data = self.state
        else:
            return None

        hazard_label = active_data.get("hazard_type", "ACOUSTIC HAZARD").title()
        if "engine" in hazard_label.lower():
            return None

        raw_dir = active_data.get("direction", "Center")
        dir_clean = "Center"
        if "right" in raw_dir.lower():
            dir_clean = "Right"
        elif "left" in raw_dir.lower():
            dir_clean = "Left"

        approaching = bool(active_data.get("approaching", False))
        score = float(active_data.get("score", 0.85))
        rms = float(active_data.get("rms", 0.0))
        ts = active_data.get("timestamp", now_ts)

        return {
            "label": hazard_label,
            "sound": hazard_label,
            "direction": dir_clean,
            "approaching": approaching,
            "score": score,
            "rms": rms,
            "timestamp": ts,
        }

    def start(self) -> bool:
        """Starts real-time audio capture via sounddevice on macOS / local audio hardware."""
        if self._is_running:
            return True

        try:
            import sounddevice as sd

            device_info = sd.query_devices(kind="input")
            max_in = device_info.get("max_input_channels", 1)
            self.channels = 2 if max_in >= 2 else 1

            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                blocksize=self.chunk_size,
                callback=self._audio_callback,
                dtype="float32",
            )
            self.stream.start()
            self._is_running = True
            logger.info("[AUDIO] AudioHazardDetector running live (%d channel input).", self.channels)
            return True
        except Exception as e:
            logger.info("[AUDIO NOTICE] Hardware audio device not started: %s. Audio engine ready for WebSocket chunks.", e)
            self.stream = None
            self._is_running = False
            return False

    def stop(self) -> None:
        """Stops the audio hardware stream."""
        self._is_running = False
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
                logger.info("[AUDIO] AudioHazardDetector engine stopped.")
            except Exception as e:
                logger.debug("Error stopping sounddevice stream: %s", e)
            finally:
                self.stream = None


# Direct execution test for CLI verification
if __name__ == "__main__":
    detector = AudioHazardDetector()
    started = detector.start()
    if not started:
        print("[AUDIO NOTICE] sounddevice input stream not available. Running simulated test loop...", flush=True)
    print("Testing audio monitor (Ctrl+C to exit)...", flush=True)
    try:
        count = 0
        while True:
            count += 1
            # In simulated mode, inject test hazards at intervals so tester sees live alerts
            if not started and count % 6 == 3:
                detector.trigger_test_hazard("Vehicle Horn", "Right", 0.94)
            st = detector.state
            if st["hazard_detected"]:
                print(f"[ALERT] {st['hazard_type']} | Dir: {st['direction']} | Approaching: {st['approaching']} (Conf: {st['score']})", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        detector.stop()

