"""Video frame decoding, normalization, and visual quality diagnostics."""

import base64
import logging
from typing import Any, Dict, Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger("vision.preprocessing")


class FramePreprocessor:
    """Decodes incoming video frames, normalizes resolutions, and performs quality audits."""

    def __init__(
        self,
        target_width: int = 640,
        target_height: int = 360,
        blur_threshold: float = 45.0,
        dark_threshold: float = 28.0,
        bright_threshold: float = 230.0,
        contrast_threshold: float = 14.0,
    ):
        self.target_width = target_width
        self.target_height = target_height
        self.blur_threshold = blur_threshold
        self.dark_threshold = dark_threshold
        self.bright_threshold = bright_threshold
        self.contrast_threshold = contrast_threshold

    def decode_frame(self, raw_input: Any) -> Optional[np.ndarray]:
        """Decodes raw input (base64 string or raw bytes) into an OpenCV BGR image."""
        if raw_input is None:
            return None

        try:
            if isinstance(raw_input, str):
                # Strip data URL prefix if present: e.g. "data:image/jpeg;base64,..."
                if "," in raw_input:
                    _, raw_input = raw_input.split(",", 1)
                image_bytes = base64.b64decode(raw_input)
            elif isinstance(raw_input, (bytes, bytearray)):
                image_bytes = bytes(raw_input)
            else:
                logger.warning("Unsupported raw frame type: %s", type(raw_input))
                return None

            np_arr = np.frombuffer(image_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame is None or frame.size == 0:
                logger.warning("Failed to decode image buffer via cv2.imdecode")
                return None

            return frame
        except Exception as e:
            logger.error("Exception occurred during frame decoding: %s", e)
            return None

    def normalize_resolution(self, frame: np.ndarray) -> np.ndarray:
        """Resizes frame to the target inference resolution while preserving orientation."""
        if frame is None:
            return None
        h, w = frame.shape[:2]
        if h > w:
            # Portrait frame (phone held vertically)
            target_w = min(self.target_width, self.target_height)
            target_h = max(self.target_width, self.target_height)
        else:
            # Landscape frame (laptop or phone held horizontally)
            target_w = max(self.target_width, self.target_height)
            target_h = min(self.target_width, self.target_height)

        if w == target_w and h == target_h:
            return frame
        return cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)

    def assess_quality(self, frame: np.ndarray) -> Dict[str, Any]:
        """Calculates image quality metrics and identifies degradation conditions."""
        if frame is None or frame.size == 0:
            return {
                "quality": "failed",
                "brightness": 0.0,
                "contrast": 0.0,
                "blur_score": 0.0,
                "is_degraded": True,
                "reason": "missing_or_corrupt",
            }

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = float(np.mean(gray))
            contrast = float(np.std(gray))

            # Laplacian variance is a standard measure for image focus/sharpness
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            blur_score = float(laplacian.var())

            too_dark = brightness < self.dark_threshold
            too_bright = brightness > self.bright_threshold
            blurry = blur_score < self.blur_threshold
            blocked = contrast < self.contrast_threshold and (too_dark or too_bright)

            reasons = []
            if blocked:
                reasons.append("blocked")
            elif too_dark:
                reasons.append("too_dark")
            elif too_bright:
                reasons.append("too_bright")
            if blurry:
                reasons.append("blurry")

            is_degraded = len(reasons) > 0
            quality_label = "good"
            if blocked:
                quality_label = "blocked"
            elif too_dark:
                quality_label = "dark"
            elif too_bright:
                quality_label = "bright"
            elif blurry:
                quality_label = "blurry"
            elif is_degraded:
                quality_label = "poor"

            return {
                "quality": quality_label,
                "brightness": round(brightness, 2),
                "contrast": round(contrast, 2),
                "blur_score": round(blur_score, 2),
                "is_degraded": is_degraded,
                "reason": ", ".join(reasons) if reasons else "none",
            }
        except Exception as e:
            logger.error("Error during quality assessment: %s", e)
            return {
                "quality": "error",
                "brightness": 0.0,
                "contrast": 0.0,
                "blur_score": 0.0,
                "is_degraded": True,
                "reason": str(e),
            }

