"""Motion estimation and approach vector calculations using image-space geometry.

IMPORTANT SAFETY NOTE:
This system estimates relative motion and approach risk solely using image-space
bounding box trajectory and expansion rate. It does NOT claim metric depth or
physical distance, which cannot be reliably determined from monocular camera frames.
"""

from typing import Dict, List, Optional, Tuple
from app.hazards.models import BoundingBox, Direction, MotionType


class MotionEstimator:
    """Estimates object motion, trajectory vectors, and relative approach speed."""

    def __init__(
        self,
        expansion_threshold: float = 0.05,
        shrinkage_threshold: float = -0.05,
        lateral_velocity_threshold: float = 0.12,
    ):
        self.expansion_threshold = expansion_threshold
        self.shrinkage_threshold = shrinkage_threshold
        self.lateral_velocity_threshold = lateral_velocity_threshold

    def estimate_motion(
        self,
        bboxes: List[BoundingBox],
        timestamps: List[float],
    ) -> Dict[str, any]:
        """Calculates motion type, expansion rate, relative speed, and approach vector."""
        if len(bboxes) < 2 or len(timestamps) < 2:
            return {
                "motion": MotionType.STATIONARY,
                "direction": self._get_direction(bboxes[-1] if bboxes else None),
                "relative_speed": 0.0,
                "expansion_rate": 0.0,
                "time_to_conflict": "low",
            }

        prev_box, curr_box = bboxes[-2], bboxes[-1]
        t_prev, t_curr = timestamps[-2], timestamps[-1]
        dt = max(1e-4, t_curr - t_prev)

        # 1. Area expansion rate: growth indicates approach; shrinkage indicates receding
        area_prev = max(1e-5, prev_box.area)
        area_curr = max(1e-5, curr_box.area)
        raw_growth = (area_curr - area_prev) / area_prev
        # Normalized expansion per second
        expansion_rate = raw_growth / dt

        # 2. Centroid velocity (dx/dt, dy/dt)
        dx = (curr_box.center_x - prev_box.center_x) / dt
        dy = (curr_box.center_y - prev_box.center_y) / dt
        lateral_speed = abs(dx)

        # 3. Motion Classification
        if expansion_rate > self.expansion_threshold:
            motion = MotionType.APPROACHING
        elif expansion_rate < self.shrinkage_threshold:
            motion = MotionType.MOVING_AWAY
        elif lateral_speed > self.lateral_velocity_threshold:
            motion = MotionType.CROSSING
        else:
            motion = MotionType.STATIONARY

        # 4. Relative Speed Metric (0.0 to 1.0)
        # Scaled composite of image-space velocity and expansion
        speed_comp = min(1.0, max(0.0, (abs(expansion_rate) * 0.6) + (lateral_speed * 0.4)))
        relative_speed = round(speed_comp, 3)

        # 5. Estimated relative Time-to-Conflict (TTC)
        # Bounded image-space time-to-impact estimate: tau = area / (dArea/dt)
        time_to_conflict = "low"
        if motion == MotionType.APPROACHING:
            if expansion_rate > 0.40 or relative_speed > 0.70:
                time_to_conflict = "critical"
            elif expansion_rate > 0.20 or relative_speed > 0.45:
                time_to_conflict = "high"
            else:
                time_to_conflict = "medium"
        elif motion == MotionType.CROSSING:
            time_to_conflict = "medium" if relative_speed > 0.3 else "low"
        elif motion == MotionType.MOVING_AWAY:
            time_to_conflict = "very_low"

        direction = self._get_direction(curr_box)

        return {
            "motion": motion,
            "direction": direction,
            "relative_speed": relative_speed,
            "expansion_rate": round(expansion_rate, 4),
            "time_to_conflict": time_to_conflict,
        }

    def _get_direction(self, bbox: Optional[BoundingBox]) -> Direction:
        if bbox is None:
            return Direction.UNKNOWN
        cx = bbox.center_x
        if cx < 0.35:
            return Direction.LEFT
        elif cx > 0.65:
            return Direction.RIGHT
        return Direction.AHEAD

