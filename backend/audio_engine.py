"""Audio Engine module for acoustic hazard detection.

Provides direct import compatibility for:
    from audio_engine import AudioHazardDetector
"""

import os
import sys

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from app.audio.hazard_detector import AudioHazardDetector

__all__ = ["AudioHazardDetector"]

