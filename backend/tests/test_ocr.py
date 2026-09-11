"""Unit tests for OCR preprocessing, ROI extraction, and text recognition."""

import numpy as np
import pytest
from app.hazards.models import BoundingBox
from app.ocr.detector import TextRegionDetector
from app.ocr.reader import OCRReader


def test_ocr_roi_extraction():
    detector = TextRegionDetector()
    frame = np.zeros((360, 640, 3), dtype=np.uint8)

    bbox = BoundingBox(x=0.10, y=0.10, width=0.20, height=0.20)
    roi = detector.extract_roi(frame, bbox)

    assert roi is not None
    assert roi.shape[0] == 72  # 360 * 0.2
    assert roi.shape[1] == 128  # 640 * 0.2


def test_ocr_reader_text():
    reader = OCRReader()
    frame = np.ones((360, 640, 3), dtype=np.uint8) * 200

    bbox = BoundingBox(x=0.5, y=0.2, width=0.3, height=0.2)
    result = reader.read_text(frame, bbox=bbox, object_id="sign_test")

    assert result is not None
    assert len(result.text) > 0
    assert result.confidence > 0.50
    assert result.object_id == "sign_test"

