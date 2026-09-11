"""Rolling scene memory maintaining temporal context of recently detected objects and signs."""

from collections import deque
import logging
import time
from typing import Dict, List, Optional
from app.hazards.models import BoundingBox, DetectedObject, Direction, TrackedHazard

logger = logging.getLogger("assistant.scene_memory")


class SceneObjectRecord:
    def __init__(
        self,
        object_id: str,
        label: str,
        hazard_type: str,
        bbox: BoundingBox,
        direction: Direction,
        confidence: float,
        timestamp: float,
    ):
        self.object_id = object_id
        self.label = label
        self.hazard_type = hazard_type
        self.bbox = bbox
        self.direction = direction
        self.confidence = confidence
        self.first_seen = timestamp
        self.last_seen = timestamp

    def update(self, bbox: BoundingBox, direction: Direction, confidence: float, timestamp: float) -> None:
        self.bbox = bbox
        self.direction = direction
        self.confidence = confidence
        self.last_seen = timestamp

    def to_dict(self) -> Dict[str, any]:
        return {
            "object_id": self.object_id,
            "label": self.label,
            "hazard_type": self.hazard_type,
            "bbox": self.bbox.to_dict(),
            "direction": self.direction.value,
            "confidence": round(self.confidence, 2),
            "last_seen_ago_seconds": round(time.time() - self.last_seen, 1),
        }


class SceneMemory:
    """Maintains a rolling 10 to 30 second memory of visible environmental objects."""

    def __init__(self, retention_seconds: float = 30.0):
        self.retention_seconds = retention_seconds
        self.memory: Dict[str, SceneObjectRecord] = {}

    def update_from_detections(
        self,
        detections: List[DetectedObject],
        timestamp: float = 0.0,
    ) -> None:
        if timestamp <= 0.0:
            timestamp = time.time()

        for det in detections:
            if det.id in self.memory:
                self.memory[det.id].update(det.bbox, det.direction, det.confidence, timestamp)
            else:
                self.memory[det.id] = SceneObjectRecord(
                    object_id=det.id,
                    label=det.label,
                    hazard_type=det.label,
                    bbox=det.bbox,
                    direction=det.direction,
                    confidence=det.confidence,
                    timestamp=timestamp,
                )

        self._prune_stale(timestamp)

    def update_from_hazards(
        self,
        hazards: List[TrackedHazard],
        timestamp: float = 0.0,
    ) -> None:
        if timestamp <= 0.0:
            timestamp = time.time()

        for h in hazards:
            bbox = h.latest_bbox or BoundingBox(x=0.4, y=0.5, width=0.2, height=0.2)
            if h.hazard_id in self.memory:
                self.memory[h.hazard_id].update(bbox, h.direction, h.confidence, timestamp)
            else:
                self.memory[h.hazard_id] = SceneObjectRecord(
                    object_id=h.hazard_id,
                    label=h.label,
                    hazard_type=h.hazard_type,
                    bbox=bbox,
                    direction=h.direction,
                    confidence=h.confidence,
                    timestamp=timestamp,
                )

        self._prune_stale(timestamp)

    def _prune_stale(self, current_time: float) -> None:
        keys_to_delete = [
            k for k, v in self.memory.items()
            if (current_time - v.last_seen) > self.retention_seconds
        ]
        for k in keys_to_delete:
            del self.memory[k]

    def find_most_recent_sign(self) -> Optional[SceneObjectRecord]:
        """Finds the most recently seen or most prominent sign."""
        signs = [
            v for v in self.memory.values()
            if "sign" in v.label.lower() or "traffic_sign" in v.label.lower() or "text" in v.label.lower()
        ]
        if not signs:
            return None
        # Sort by most recently seen, then confidence
        signs.sort(key=lambda s: (s.last_seen, s.confidence), reverse=True)
        return signs[0]

    def find_approaching_vehicles(self) -> List[SceneObjectRecord]:
        """Finds active vehicles in scene."""
        return [
            v for v in self.memory.values()
            if v.hazard_type in ("vehicle", "bus", "truck", "motorcycle")
        ]

    def get_object(self, object_id: str) -> Optional[SceneObjectRecord]:
        """Retrieves a scene object by ID if currently in memory."""
        return self.memory.get(object_id)

    def get_recent_objects_summary(self) -> List[Dict[str, any]]:
        return [v.to_dict() for v in self.memory.values()]

