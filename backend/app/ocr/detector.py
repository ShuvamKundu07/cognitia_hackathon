"""Sign and text region detection for scene OCR reading."""

import logging
from typing import List, Optional, Tuple
import cv2
import numpy as np
from app.hazards.models import BoundingBox, DetectedObject

logger = logging.getLogger("ocr.detector")


class TextRegionDetector:
    """Isolates candidate text regions and sign areas within a video frame."""

    def extract_roi(
        self,
        frame: np.ndarray,
        bbox: Optional[BoundingBox] = None,
    ) -> Optional[np.ndarray]:
        """Crops the region of interest from the frame given normalized bbox."""
        if frame is None or frame.size == 0:
            return None

        h, w = frame.shape[:2]

        if bbox is not None:
            # Crop to specified bounding box
            x1 = max(0, int(bbox.x * w))
            y1 = max(0, int(bbox.y * h))
            x2 = min(w, int(bbox.right * w))
            y2 = min(h, int(bbox.bottom * h))

            if x2 <= x1 or y2 <= y1:
                return None
            return frame[y1:y2, x1:x2]

        # If no bbox provided, detect candidate high-contrast text regions in the upper 70% of frame
        upper_frame = frame[: int(h * 0.7), :]
        return upper_frame

