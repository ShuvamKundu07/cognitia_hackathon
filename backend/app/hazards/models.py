"""Domain models and data schemas for objects, hazards, tracking, and alerts."""

from __future__ import annotations
from enum import Enum
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from pydantic import BaseModel, Field, model_validator


class UrgencyLevel(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    @classmethod
    def from_str(cls, val: str) -> "UrgencyLevel":
        v = str(val).strip().lower()
        for member in cls:
            if member.value == v:
                return member
        return cls.LOW


class MotionType(str, Enum):
    APPROACHING = "approaching"
    MOVING_AWAY = "moving_away"
    STATIONARY = "stationary"
    CROSSING = "crossing"


class Direction(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"
    AHEAD = "ahead"
    UNKNOWN = "unknown"

    @classmethod
    def from_str(cls, val: str) -> "Direction":
        v = str(val).strip().lower()
        if v in ("left", "l"):
            return cls.LEFT
        elif v in ("right", "r"):
            return cls.RIGHT
        elif v in ("ahead", "front", "center", "c"):
            return cls.AHEAD
        return cls.UNKNOWN


class BoundingBox(BaseModel):
    """Normalized bounding box [0.0, 1.0]."""
    x: float = Field(..., ge=0.0, le=1.0, description="Top-left x")
    y: float = Field(..., ge=0.0, le=1.0, description="Top-left y")
    width: float = Field(..., ge=0.0, le=1.0, description="Box width")
    height: float = Field(..., ge=0.0, le=1.0, description="Box height")

    @model_validator(mode="before")
    @classmethod
    def parse_bbox_input(cls, data: Any) -> Any:
        if isinstance(data, (list, tuple)) and len(data) == 4:
            return {
                "x": float(data[0]),
                "y": float(data[1]),
                "width": float(data[2]),
                "height": float(data[3]),
            }
        return data

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2.0

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2.0

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def right(self) -> float:
        return min(1.0, self.x + self.width)

    @property
    def bottom(self) -> float:
        return min(1.0, self.y + self.height)

    def to_list(self) -> List[float]:
        return [round(self.x, 4), round(self.y, 4), round(self.width, 4), round(self.height, 4)]

    def to_dict(self) -> Dict[str, float]:
        return {
            "x": round(self.x, 4),
            "y": round(self.y, 4),
            "width": round(self.width, 4),
            "height": round(self.height, 4),
        }

    def iou(self, other: "BoundingBox") -> float:
        """Intersection over Union."""
        ix1 = max(self.x, other.x)
        iy1 = max(self.y, other.y)
        ix2 = min(self.right, other.right)
        iy2 = min(self.bottom, other.bottom)

        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)
        intersection = iw * ih

        union = self.area + other.area - intersection
        if union <= 0.0:
            return 0.0
        return intersection / union


class DetectedObject(BaseModel):
    id: str
    label: str
    confidence: float
    bbox: BoundingBox
    direction: Direction = Direction.AHEAD
    urgency: UrgencyLevel = UrgencyLevel.LOW
    timestamp: float = Field(default_factory=time.time)

    def to_frontend_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "bbox": self.bbox.to_dict(),
            "direction": self.direction.value,
            "urgency": self.urgency.value,
        }


class TrackedHazard(BaseModel):
    hazard_id: str
    track_id: str
    hazard_type: str
    label: str
    first_seen: float = Field(default_factory=time.time)
    last_seen: float = Field(default_factory=time.time)
    confidence: float = 0.8
    confidence_history: List[float] = Field(default_factory=list)
    positions: List[Tuple[float, float]] = Field(default_factory=list)
    bboxes: List[BoundingBox] = Field(default_factory=list)
    direction: Direction = Direction.AHEAD
    motion: MotionType = MotionType.STATIONARY
    relative_speed: float = 0.0
    expansion_rate: float = 0.0
    path_intersection_score: float = 0.0
    time_to_conflict: str = "low"
    risk_score: float = 0.0
    urgency: UrgencyLevel = UrgencyLevel.LOW
    alerted: bool = False
    last_alert_time: float = 0.0
    resolved: bool = False

    @property
    def latest_bbox(self) -> Optional[BoundingBox]:
        return self.bboxes[-1] if self.bboxes else None

    @property
    def age(self) -> float:
        return time.time() - self.first_seen

    def to_frontend_object(self) -> Dict[str, Any]:
        bbox_dict = self.latest_bbox.to_dict() if self.latest_bbox else {"x": 0.4, "y": 0.5, "width": 0.2, "height": 0.2}
        return {
            "id": self.hazard_id,
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "bbox": bbox_dict,
            "direction": self.direction.value,
            "urgency": self.urgency.value,
            "motion": self.motion.value,
            "relative_speed": round(self.relative_speed, 2),
            "time_to_conflict": self.time_to_conflict,
        }


class HazardAlert(BaseModel):
    hazard_id: str
    hazard_type: str
    message: str
    action: str
    direction: str
    urgency: str
    confidence: float
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))
    interrupt: bool = False
    movement_direction: Optional[str] = None  # e.g., "left", "right", "stop", "straight"


class AudioEvent(BaseModel):
    sound: str
    direction: str = "Unknown"
    confidence: float = 0.9
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class SystemFailure(BaseModel):
    component: str
    severity: str = "medium"
    message: str
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class OCRResult(BaseModel):
    text: str
    confidence: float
    object_id: str = "sign_0"
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class EvaluationMetrics(BaseModel):
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    false_alarm_rate: str = "0.0 / min"
    avg_detection_latency_ms: float = 0.0
    avg_alert_latency_ms: float = 0.0
    duplicate_alert_rate: str = "0.0%"
    missed_hazard_rate: str = "0.0%"

