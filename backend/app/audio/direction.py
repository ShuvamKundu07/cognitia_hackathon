"""Directional audio estimation for multi-channel acoustic sensor arrays.

IMPORTANT SAFETY NOTE:
A single monocular / mono microphone CANNOT physically determine left vs right sound arrival.
When only single-channel mono input is available, this module honestly returns UNKNOWN.
Directional localization is only computed when true multi-channel (stereo / array) signals are present.
"""

import logging
from typing import Optional
import numpy as np
from app.hazards.models import Direction

logger = logging.getLogger("audio.direction")


class AudioDirectionEstimator:
    """Estimates acoustic event angle-of-arrival using multi-channel signal processing."""

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def estimate_direction(
        self,
        audio_data: np.ndarray,
        num_channels: int = 1,
    ) -> Direction:
        """Estimates sound direction.

        Args:
            audio_data: Multi-channel numpy array (channels x samples or samples x channels).
            num_channels: Detected channel count.

        Returns:
            Direction enum (LEFT, CENTER, RIGHT, or UNKNOWN)
        """
        # Mono microphone limitation
        if num_channels < 2 or audio_data is None or audio_data.ndim < 2:
            return Direction.UNKNOWN

        try:
            # Ensure shape is (2, N) for stereo
            if audio_data.shape[0] != 2 and audio_data.shape[1] == 2:
                audio_data = audio_data.T

            left_channel = audio_data[0]
            right_channel = audio_data[1]

            # 1. Inter-channel Level Difference (ILD / Energy Ratio)
            left_energy = float(np.sum(left_channel ** 2))
            right_energy = float(np.sum(right_channel ** 2))
            total_energy = left_energy + right_energy

            if total_energy < 1e-6:
                return Direction.UNKNOWN

            energy_ratio = (right_energy - left_energy) / total_energy

            # 2. Inter-channel Time Difference (ITD via Cross-Correlation)
            correlation = np.correlate(left_channel, right_channel, mode="full")
            center_idx = len(correlation) // 2
            delay = np.argmax(correlation) - center_idx

            # 3. Direction decision
            if energy_ratio > 0.20 or delay > 2:
                return Direction.RIGHT
            elif energy_ratio < -0.20 or delay < -2:
                return Direction.LEFT
            else:
                return Direction.CENTER

        except Exception as e:
            logger.error("Error in multi-channel directional audio estimation: %s", e)
            return Direction.UNKNOWN

