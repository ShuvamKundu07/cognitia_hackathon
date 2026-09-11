"""Walking path corridor model and path collision intersection scoring."""

from typing import Any, Dict, Optional
from app.config import settings
from app.hazards.models import BoundingBox


class WalkingPathEstimator:
    """Camera-coordinate walking corridor model for pedestrian path prediction."""

    def __init__(
        self,
        x: float = 0.30,
        y: float = 0.45,
        width: float = 0.40,
        height: float = 0.55,
    ):
        self.path_box = BoundingBox(x=x, y=y, width=width, height=height)

    def update_corridor(self, x: float, y: float, width: float, height: float) -> None:
        self.path_box = BoundingBox(x=x, y=y, width=width, height=height)

    def get_corridor_dict(self) -> Dict[str, float]:
        return self.path_box.to_dict()

    def is_intersecting(self, bbox: Optional[BoundingBox]) -> bool:
        """Determines whether a bounding box overlaps with the walking path corridor."""
        if bbox is None:
            return False

        # Axis-aligned bounding box intersection test
        bbox_right = bbox.x + bbox.width
        bbox_bottom = bbox.y + bbox.height
        path_right = self.path_box.x + self.path_box.width
        path_bottom = self.path_box.y + self.path_box.height

        return not (
            bbox_right < self.path_box.x
            or bbox.x > path_right
            or bbox_bottom < self.path_box.y
            or bbox.y > path_bottom
        )

    def calculate_intersection_score(self, bbox: Optional[BoundingBox]) -> float:
        """Calculates a normalized score [0.0, 1.0] indicating path conflict severity.

        Factors:
        1. Proportion of the obstacle's area situated within the walking corridor.
        2. Proximity weighting: obstacles in the lower half of the frame (near ground)
           pose higher collision severity for a low-vision pedestrian.
        """
        if bbox is None:
            return 0.0

        ix1 = max(bbox.x, self.path_box.x)
        iy1 = max(bbox.y, self.path_box.y)
        ix2 = min(bbox.right, self.path_box.right)
        iy2 = min(bbox.bottom, self.path_box.bottom)

        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)
        overlap_area = iw * ih

        if overlap_area <= 0.0:
            return 0.0

        # Overlap fraction relative to obstacle area
        area_ratio = min(1.0, overlap_area / max(1e-5, bbox.area))

        # Vertical ground proximity weighting: y=1.0 is immediate ground level
        proximity_factor = min(1.0, max(0.2, bbox.bottom))

        score = area_ratio * 0.75 + proximity_factor * 0.25
        return round(min(1.0, max(0.0, score)), 3)

