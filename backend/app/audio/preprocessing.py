"""Audio stream decoding, volume/energy analysis, and feature extraction."""

import base64
import io
import logging
import math
from typing import Any, Optional, Tuple
import numpy as np

logger = logging.getLogger("audio.preprocessing")


class AudioPreprocessor:
    """Decodes raw audio chunks from client and computes acoustic signal metrics."""

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def decode_audio_chunk(self, raw_data: Any) -> Optional[np.ndarray]:
        """Decodes audio chunk (WAV, int16/float32 PCM, base64, list, numpy) into float32 array [-1.0, 1.0]."""
        if raw_data is None:
            return None

        # 1. Direct numpy array
        if isinstance(raw_data, np.ndarray):
            arr = raw_data.astype(np.float32)
            if np.max(np.abs(arr)) > 1.5:
                arr = arr / 32768.0
            return arr

        # 2. JSON list of float samples
        if isinstance(raw_data, list):
            if not raw_data:
                return None
            arr = np.array(raw_data, dtype=np.float32)
            if np.max(np.abs(arr)) > 1.5:
                arr = arr / 32768.0
            return arr

        try:
            if isinstance(raw_data, str):
                if "," in raw_data:
                    _, raw_data = raw_data.split(",", 1)
                audio_bytes = base64.b64decode(raw_data)
            elif isinstance(raw_data, (bytes, bytearray)):
                audio_bytes = bytes(raw_data)
            else:
                return None

            if len(audio_bytes) < 4:
                return None

            # 3. Check for standard WAV container (RIFF ... WAVE)
            if audio_bytes[:4] == b"RIFF" and b"WAVE" in audio_bytes[:16]:
                try:
                    import scipy.io.wavfile as wavfile
                    _, data = wavfile.read(io.BytesIO(audio_bytes))
                    if data.dtype == np.int16:
                        return data.astype(np.float32) / 32768.0
                    elif data.dtype == np.float32:
                        return data
                    elif data.dtype == np.uint8:
                        return (data.astype(np.float32) - 128.0) / 128.0
                except Exception as wav_err:
                    logger.debug("WAV parser fallback: %s", wav_err)

            # 4. Attempt 16-bit PCM interpretation
            raw_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            if raw_int16.size > 0:
                float_samples = raw_int16.astype(np.float32) / 32768.0
                return float_samples

            return None
        except Exception as e:
            logger.debug("Audio decode note: %s", e)
            return None

    def calculate_rms_energy(self, samples: np.ndarray) -> float:
        """Calculates Root-Mean-Square (RMS) amplitude."""
        if samples is None or samples.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(samples ** 2)))

    def is_silent(self, samples: np.ndarray, threshold: float = 0.01) -> bool:
        """Checks if audio frame is below ambient noise floor."""
        return self.calculate_rms_energy(samples) < threshold

