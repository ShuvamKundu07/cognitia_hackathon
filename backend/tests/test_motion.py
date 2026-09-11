"""Unit tests for motion estimation and approach vector determination."""

import pytest
from app.hazards.models import BoundingBox, Direction, MotionType
from app.vision.motion import MotionEstimator


def test_motion_approaching_bounding_box_expansion():
    estimator = MotionEstimator()

    # Box 1: Small car on right at t=0
    b1 = BoundingBox(x=0.70, y=0.40, width=0.10, height=0.10)
    # Box 2: Significantly larger car at t=0.2s (area quadruples -> rapidly approaching)
    b2 = BoundingBox(x=0.68, y=0.38, width=0.20, height=0.20)

    res = estimator.estimate_motion([b1, b2], [0.0, 0.2])

    assert res["motion"] == MotionType.APPROACHING
    assert res["direction"] == Direction.RIGHT
    assert res["expansion_rate"] > 0.10
    assert res["relative_speed"] > 0.5


def test_motion_receding_bounding_box_shrinkage():
    estimator = MotionEstimator()

    # Box 1: Large box at t=0
    b1 = BoundingBox(x=0.40, y=0.30, width=0.25, height=0.30)
    # Box 2: Smaller box at t=0.2s (shrinkage)
    b2 = BoundingBox(x=0.40, y=0.30, width=0.15, height=0.18)

    res = estimator.estimate_motion([b1, b2], [0.0, 0.2])

    assert res["motion"] == MotionType.MOVING_AWAY
    assert res["expansion_rate"] < 0.0


def test_motion_crossing_lateral_movement():
    estimator = MotionEstimator()

    # Box moving horizontally across frame without significant expansion
    b1 = BoundingBox(x=0.20, y=0.40, width=0.12, height=0.20)
    b2 = BoundingBox(x=0.45, y=0.40, width=0.12, height=0.20)

    res = estimator.estimate_motion([b1, b2], [0.0, 0.5])

    assert res["motion"] == MotionType.CROSSING

