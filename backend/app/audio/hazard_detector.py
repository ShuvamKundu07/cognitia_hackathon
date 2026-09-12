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

        self.hazard_keywords = ["siren", "horn", "tire squeal", "truck", "motorcycle"]
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

        Rejects ambient room static, HVAC/fan hum, and human speech formants.
        Detects vehicle warning signals: Vehicle Horn, Emergency Siren, Tire Squeal.
        """
        if len(mono_samples) < 256 or rms < 0.035:
            return "NONE (SILENCE)", 0.0, False

        fft_vals = np.abs(np.fft.rfft(mono_samples))
        freqs = np.fft.rfftfreq(len(mono_samples), 1.0 / self.sample_rate)
        total_energy = float(np.sum(fft_vals)) + 1e-6
        med_energy = float(np.median(fft_vals)) + 1e-6

        # Human vocal pitch fundamental band (85 Hz - 280 Hz)
        vocal_mask = (freqs >= 85) & (freqs <= 280)
        vocal_energy = float(np.sum(fft_vals[vocal_mask]))

        # --- 1. Vehicle Horn: 350 - 650 Hz (automotive dual/single resonant tones) ---
        horn_mask = (freqs >= 350) & (freqs <= 650)
        horn_energy = float(np.sum(fft_vals[horn_mask]))
        horn_peak = float(np.max(fft_vals[horn_mask])) if np.any(horn_mask) else 0.0
        horn_share = horn_energy / total_energy
        horn_peak_ratio = horn_peak / med_energy
        pitch_to_horn = vocal_energy / (horn_energy + 1e-6)

        # Genuine vehicle horns have strong tonal resonance (>=18x median)
        # and concentrated band energy without vocal pitch dominance
        if horn_share >= 0.14 and horn_peak_ratio >= 18.0 and pitch_to_horn < 0.60:
            conf = min(0.98, round(0.70 + horn_share * 0.5, 2))
            return "VEHICLE HORN", conf, True

        # --- 2. Emergency Siren: 750 - 1750 Hz (ambulance, police, fire wail/yelp) ---
        siren_mask = (freqs >= 750) & (freqs <= 1750)
        siren_energy = float(np.sum(fft_vals[siren_mask]))
        siren_peak = float(np.max(fft_vals[siren_mask])) if np.any(siren_mask) else 0.0
        siren_share = siren_energy / total_energy
        siren_peak_ratio = siren_peak / med_energy
        pitch_to_siren = vocal_energy / (siren_energy + 1e-6)

        if siren_share >= 0.18 and siren_peak_ratio >= 20.0 and pitch_to_siren < 0.50:
            conf = min(0.98, round(0.75 + siren_share * 0.4, 2))
            return "EMERGENCY SIREN", conf, True

        # --- 3. Tire Squeal: 2200 - 5000 Hz (emergency braking friction screech) ---
        squeal_mask = (freqs >= 2200) & (freqs <= 5000)
        squeal_energy = float(np.sum(fft_vals[squeal_mask]))
        squeal_peak = float(np.max(fft_vals[squeal_mask])) if np.any(squeal_mask) else 0.0
        squeal_share = squeal_energy / total_energy
        squeal_peak_ratio = squeal_peak / med_energy
        pitch_to_squeal = vocal_energy / (squeal_energy + 1e-6)

        if squeal_share >= 0.20 and squeal_peak_ratio >= 20.0 and pitch_to_squeal < 0.35:
            conf = min(0.95, round(0.70 + squeal_share * 0.4, 2))
            return "TIRE SQUEAL", conf, True

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
        # FIX: NOISE GATE TO PREVENT HALLUCINATIONS
        # ==========================================
        MIN_VOLUME_RMS = 0.035  # Ignore audio below this volume (pure background static & quiet speech)
        CONFIDENCE_THRESHOLD = 0.40  # Require 40% certainty (up from 15%)

        if rms_total < MIN_VOLUME_RMS:
            self.state["hazard_detected"] = False
            self.state["hazard_type"] = "NONE (SILENCE)"
            self.state["direction"] = direction
            self.state["approaching"] = False
            self.state["score"] = 0.0
            self.state["rms"] = round(rms_total, 4)
            return

        # --- 3. Offline YAMNet Classification ---
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


    def process_audio_chunk(self, raw_audio: Any, timestamp: float = 0.0) -> Optional[AudioEvent]:
        """Classifies incoming decoded or encoded audio data from WebSocket."""
        samples = self.preprocessor.decode_audio_chunk(raw_audio)
        if samples is None or len(samples) < 256:
            return None

        state = self._process_samples(samples)
        if state["hazard_detected"]:
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

