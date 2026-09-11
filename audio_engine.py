"""Audio Engine module for acoustic hazard detection.

Provides direct import compatibility for:
    from audio_engine import AudioHazardDetector
"""

import os
import sys

# Ensure backend directory is in Python module search path
_REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.join(_REPO_ROOT, "backend")

if os.path.exists(_BACKEND_DIR) and _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from app.audio.hazard_detector import AudioHazardDetector

__all__ = ["AudioHazardDetector"]

