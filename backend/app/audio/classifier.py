"""Environmental sound and acoustic hazard classifier."""

from abc import ABC, abstractmethod
import logging
import time
from typing import Any, Dict, List, Optional
import numpy as np

from app.audio.direction import AudioDirectionEstimator
from app.audio.preprocessing import AudioPreprocessor
from app.hazards.models import AudioEvent, Direction

logger = logging.getLogger("audio.classifier")


class BaseAudioClassifier(ABC):
    """Abstract interface for environmental audio classifiers."""

    @abstractmethod
    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
    ) -> Optional[AudioEvent]:
        """Classifies incoming audio chunk into environmental hazard event."""
        pass


class AcousticClassifier(BaseAudioClassifier):
    """Spectral-energy and heuristic acoustic event classifier with clear neural model extension point.

    Architecture Note:
    This class performs spectral energy analysis (FFT band energy ratios).
    When a pre-trained neural model (such as Google YAMNet or PANNs CNN14) is added,
    it plugs directly into the `_predict_neural` method below.
    """

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.preprocessor = AudioPreprocessor(sample_rate=sample_rate)
        self.direction_estimator = AudioDirectionEstimator(sample_rate=sample_rate)
        self.neural_model = None  # Ready for YAMNet / PANNs weights

    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
    ) -> Optional[AudioEvent]:
        if timestamp <= 0.0:
            timestamp = time.time()

        samples = self.preprocessor.decode_audio_chunk(raw_audio)
        if samples is None or len(samples) < 512:
            return None

        # Check if audio is below silence floor (ignore ambient room and quiet speech)
        rms = self.preprocessor.calculate_rms_energy(samples)
        if rms < 0.035:
            return None

        # 1. FFT Frequency Domain Analysis
        fft_vals = np.abs(np.fft.rfft(samples))
        freqs = np.fft.rfftfreq(len(samples), 1.0 / self.sample_rate)
        total_spectral = max(1e-5, float(np.sum(fft_vals)))
        med_spectral = max(1e-5, float(np.median(fft_vals)))

        # Vocal pitch fundamental band (85 - 280 Hz)
        vocal_energy = float(np.sum(fft_vals[(freqs >= 85) & (freqs <= 280)]))

        # Spectral bands:
        # Horns: prominent fundamental between 350Hz - 650Hz
        # Sirens: prominent sweeps between 750Hz - 1750Hz
        horn_mask = (freqs >= 350) & (freqs <= 650)
        siren_mask = (freqs >= 750) & (freqs <= 1750)

        horn_band = float(np.sum(fft_vals[horn_mask]))
        horn_peak = float(np.max(fft_vals[horn_mask])) if np.any(horn_mask) else 0.0
        horn_ratio = horn_band / total_spectral
        horn_peak_ratio = horn_peak / med_spectral

        siren_band = float(np.sum(fft_vals[siren_mask]))
        siren_peak = float(np.max(fft_vals[siren_mask])) if np.any(siren_mask) else 0.0
        siren_ratio = siren_band / total_spectral
        siren_peak_ratio = siren_peak / med_spectral

        sound_label = None
        confidence = 0.0

        if horn_ratio >= 0.14 and horn_peak_ratio >= 18.0 and (vocal_energy / (horn_band + 1e-6) < 0.60):
            sound_label = "Vehicle Horn"
            confidence = min(0.98, round(0.70 + horn_ratio * 0.5, 2))
        elif siren_ratio >= 0.18 and siren_peak_ratio >= 20.0 and (vocal_energy / (siren_band + 1e-6) < 0.50):
            sound_label = "Emergency Siren"
            confidence = min(0.98, round(0.75 + siren_ratio * 0.4, 2))

        if not sound_label:
            return None

        # Determine direction (UNKNOWN for mono input)
        direction = self.direction_estimator.estimate_direction(samples, num_channels=1)

        return AudioEvent(
            sound=sound_label,
            direction=direction.value.capitalize(),
            confidence=confidence,
            timestamp=int(timestamp * 1000),
        )


class MockAudioClassifier(BaseAudioClassifier):
    """Deterministic mock acoustic classifier for development, tests, and demo scenarios."""

    def __init__(self):
        self.call_count = 0

    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
    ) -> Optional[AudioEvent]:
        if timestamp <= 0.0:
            timestamp = time.time()
        self.call_count += 1

        # Simulate acoustic events at intervals
        if self.call_count % 35 == 10:
            return AudioEvent(
                sound="Vehicle Horn",
                direction="Right",
                confidence=0.92,
                timestamp=int(timestamp * 1000),
            )
        elif self.call_count % 70 == 40:
            return AudioEvent(
                sound="Emergency Siren",
                direction="Ahead",
                confidence=0.96,
                timestamp=int(timestamp * 1000),
            )
        return None


class AudioHazardClassifier(BaseAudioClassifier):
    """Adapter integrating AudioHazardDetector into the BaseAudioClassifier pipeline."""

    def __init__(self, detector: Optional[Any] = None, model_dir: str = "models/yamnet_model"):
        from app.audio.hazard_detector import AudioHazardDetector

        self.detector = detector or AudioHazardDetector(model_dir=model_dir)

    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
    ) -> Optional[AudioEvent]:
        return self.detector.process_audio_chunk(raw_audio, timestamp=timestamp)


def get_audio_classifier(
    mock_mode: bool = False,
    detector: Optional[Any] = None,
    model_dir: str = "models/yamnet_model",
) -> BaseAudioClassifier:
    """Factory function for acoustic classifiers."""
    if mock_mode:
        return MockAudioClassifier()
    return AudioHazardClassifier(detector=detector, model_dir=model_dir)

