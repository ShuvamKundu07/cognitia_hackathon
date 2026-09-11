"""Unit tests for camera quality audits and system failure detection."""

import numpy as np
import pytest
from app.safety.failure_detection import SystemFailureDetector
from app.vision.preprocessing import FramePreprocessor


def test_failure_detection_dark_frame():
    preprocessor = FramePreprocessor()
    detector = SystemFailureDetector()

    # Black / pitch dark frame
    black_frame = np.zeros((360, 640, 3), dtype=np.uint8)
    quality = preprocessor.assess_quality(black_frame)

    assert quality["is_degraded"] is True
    assert "dark" in quality["quality"] or "blocked" in quality["quality"]

    failure = detector.check_frame_quality(quality)
    assert failure is not None
    assert failure.component == "camera"
    assert failure.severity in ("high", "medium")


def test_failure_detection_blurry_frame():
    preprocessor = FramePreprocessor(blur_threshold=50.0)
    detector = SystemFailureDetector()

    # Uniform gray blurred frame (0 variance Laplacian)
    blur_frame = np.full((360, 640, 3), 128, dtype=np.uint8)
    quality = preprocessor.assess_quality(blur_frame)

    assert quality["is_degraded"] is True
    assert quality["blur_score"] < 1.0


def test_failure_detection_camera_freeze():
    detector = SystemFailureDetector(frame_timeout_seconds=2.0)
    t0 = 100.0

    # Arrival at t0
    detector.record_frame_arrival(timestamp=t0)
    # Arrival at t0 + 3.5s (exceeds 2.0s timeout)
    failure = detector.record_frame_arrival(timestamp=t0 + 3.5)

    assert failure is not None
    assert failure.component == "camera"
    assert "interrupted" in failure.message or "freeze" in failure.message

