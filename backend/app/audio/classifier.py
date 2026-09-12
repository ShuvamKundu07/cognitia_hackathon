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
        channels: int = 2,
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
        from app.audio.hazard_detector import AudioHazardDetector

        self.detector = AudioHazardDetector(sample_rate=sample_rate)

    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
        channels: int = 2,
    ) -> Optional[AudioEvent]:
        if timestamp <= 0.0:
            timestamp = time.time()

        samples = self.preprocessor.decode_audio_chunk(raw_audio, channels=channels)
        if samples is None or len(samples) < 256:
            return None

        mono_samples = (
            np.mean(samples, axis=1, dtype=np.float32)
            if samples.ndim > 1 and samples.shape[1] > 1
            else samples.ravel().astype(np.float32)
        )
        rms = float(np.sqrt(np.mean(mono_samples**2) + 1e-7))
        sound_type, conf, is_hazard = self.detector._spectral_classify(mono_samples, rms)
        if not is_hazard:
            return None

        sound_label = "Vehicle Horn" if "HORN" in sound_type else "Emergency Siren" if "SIREN" in sound_type else sound_type.title()

        num_ch = samples.shape[1] if samples.ndim > 1 else 1
        direction = self.direction_estimator.estimate_direction(samples, num_channels=num_ch)
        dir_str = direction.value.capitalize()
        if dir_str == "Unknown":
            dir_str = "Center"

        return AudioEvent(
            sound=sound_label,
            direction=dir_str,
            confidence=conf,
            timestamp=int(timestamp * 1000),
        )


class MockAudioClassifier(BaseAudioClassifier):
    """Deterministic mock acoustic classifier for development, tests, and demo scenarios."""

    def __init__(self, auto_simulate: bool = False):
        self.call_count = 0
        self.auto_simulate = auto_simulate

    def classify(
        self,
        raw_audio: Any,
        timestamp: float = 0.0,
        channels: int = 2,
    ) -> Optional[AudioEvent]:
        if timestamp <= 0.0:
            timestamp = time.time()
        self.call_count += 1

        if not self.auto_simulate:
            return None

        # Simulate acoustic events at intervals only if explicitly requested
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
        channels: int = 2,
    ) -> Optional[AudioEvent]:
        return self.detector.process_audio_chunk(raw_audio, timestamp=timestamp, channels=channels)


def get_audio_classifier(
    mock_mode: bool = False,
    detector: Optional[Any] = None,
    model_dir: str = "models/yamnet_model",
) -> BaseAudioClassifier:
    """Factory function for acoustic classifiers."""
    if mock_mode:
        return MockAudioClassifier()
    return AudioHazardClassifier(detector=detector, model_dir=model_dir)

