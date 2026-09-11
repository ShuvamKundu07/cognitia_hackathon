"""Temporal multi-object tracker for persistent hazard identity across frames."""

import logging
import time
from typing import Dict, List, Optional, Tuple
from app.config import settings
from app.hazards.models import (
    BoundingBox,
    DetectedObject,
    Direction,
    MotionType,
    TrackedHazard,
    UrgencyLevel,
)
from app.vision.motion import MotionEstimator

logger = logging.getLogger("vision.tracker")


class Track:
    """Represents an active track over time."""

    def __init__(self, track_id: str, detection: DetectedObject, timestamp: float):
        self.track_id = track_id
        self.label = detection.label
        self.first_seen = timestamp
        self.last_seen = timestamp
        self.confidence_history = [detection.confidence]
        self.bboxes: List[BoundingBox] = [detection.bbox]
        self.timestamps: List[float] = [timestamp]
        self.positions: List[Tuple[float, float]] = [(detection.bbox.center_x, detection.bbox.center_y)]
        self.missed_frames: int = 0
        self.status: str = "active"  # 'active', 'lost', 'resolved'

        # Hazard state
        if track_id.startswith(f"{detection.label}_"):
            self.hazard_id = track_id
        else:
            self.hazard_id = f"{detection.label}_{track_id}"
        self.alerted: bool = False
        self.last_alert_time: float = 0.0
        self.urgency: UrgencyLevel = detection.urgency

    def update(self, detection: DetectedObject, timestamp: float) -> None:
        self.last_seen = timestamp
        self.confidence_history.append(detection.confidence)
        if len(self.confidence_history) > 30:
            self.confidence_history.pop(0)

        self.bboxes.append(detection.bbox)
        if len(self.bboxes) > 30:
            self.bboxes.pop(0)

        self.timestamps.append(timestamp)
        if len(self.timestamps) > 30:
            self.timestamps.pop(0)

        self.positions.append((detection.bbox.center_x, detection.bbox.center_y))
        if len(self.positions) > 30:
            self.positions.pop(0)

        self.missed_frames = 0
        self.status = "active"

    def mark_missed(self) -> None:
        self.missed_frames += 1
        self.status = "lost"

    @property
    def latest_bbox(self) -> BoundingBox:
        return self.bboxes[-1]

    @property
    def current_confidence(self) -> float:
        return self.confidence_history[-1] if self.confidence_history else 0.5


class ObjectTracker:
    """Associates detections across consecutive frames to maintain persistent object identities."""

    def __init__(
        self,
        iou_threshold: float = 0.30,
        grace_period_seconds: float = 1.50,
        max_age_seconds: float = 3.00,
    ):
        self.iou_threshold = iou_threshold
        self.grace_period_seconds = grace_period_seconds
        self.max_age_seconds = max_age_seconds
        self.tracks: Dict[str, Track] = {}
        self.next_track_id = 1
        self.motion_estimator = MotionEstimator()

    def update(
        self,
        detections: List[DetectedObject],
        timestamp: float = 0.0,
    ) -> List[TrackedHazard]:
        """Updates tracks with new frame detections and returns active tracked hazards."""
        if timestamp <= 0.0:
            timestamp = time.time()

        active_track_keys = list(self.tracks.keys())
        unmatched_detections = list(range(len(detections)))
        matched_pairs: List[Tuple[str, int]] = []

        # 1. Greedy IOU matching with active / lost tracks
        for t_key in active_track_keys:
            track = self.tracks[t_key]
            best_iou = 0.0
            best_det_idx = -1

            for det_idx in unmatched_detections:
                det = detections[det_idx]
                if det.label != track.label:
                    continue

                iou_val = track.latest_bbox.iou(det.bbox)
                if iou_val > best_iou:
                    best_iou = iou_val
                    best_det_idx = det_idx

            if best_iou >= self.iou_threshold and best_det_idx != -1:
                matched_pairs.append((t_key, best_det_idx))
                unmatched_detections.remove(best_det_idx)

        # 2. Update matched tracks
        matched_track_keys = set()
        for t_key, det_idx in matched_pairs:
            matched_track_keys.add(t_key)
            self.tracks[t_key].update(detections[det_idx], timestamp)

        # 3. Handle unmatched tracks (grace period retention)
        unmatched_tracks = set(active_track_keys) - matched_track_keys
        tracks_to_delete = []

        for t_key in unmatched_tracks:
            track = self.tracks[t_key]
            track.mark_missed()
            age_since_last_seen = timestamp - track.last_seen

            if age_since_last_seen > self.max_age_seconds:
                track.status = "resolved"
                tracks_to_delete.append(t_key)

        for t_key in tracks_to_delete:
            del self.tracks[t_key]

        # 4. Create new tracks for unmatched detections
        for det_idx in unmatched_detections:
            det = detections[det_idx]
            new_id = f"{det.label}_{self.next_track_id}"
            self.next_track_id += 1
            new_track = Track(track_id=new_id, detection=det, timestamp=timestamp)
            self.tracks[new_id] = new_track

        # 5. Build TrackedHazard representations with motion vectors
        tracked_hazards: List[TrackedHazard] = []
        for t_key, track in self.tracks.items():
            # Only emit actively detected hazards (skip stale/lost tracks from visual output)
            if track.missed_frames > 1 or (timestamp - track.last_seen > 0.40):
                continue

            # Estimate motion and approach
            motion_info = self.motion_estimator.estimate_motion(
                bboxes=track.bboxes,
                timestamps=track.timestamps,
            )

            th = TrackedHazard(
                hazard_id=track.hazard_id,
                track_id=track.track_id,
                hazard_type=self._classify_hazard_category(track.label),
                label=track.label,
                first_seen=track.first_seen,
                last_seen=track.last_seen,
                confidence=round(track.current_confidence, 3),
                confidence_history=list(track.confidence_history),
                positions=list(track.positions),
                bboxes=list(track.bboxes),
                direction=motion_info["direction"],
                motion=motion_info["motion"],
                relative_speed=motion_info["relative_speed"],
                expansion_rate=motion_info["expansion_rate"],
                time_to_conflict=motion_info["time_to_conflict"],
                alerted=track.alerted,
                last_alert_time=track.last_alert_time,
                resolved=(track.status == "resolved"),
            )
            tracked_hazards.append(th)

        return tracked_hazards

    def _classify_hazard_category(self, label: str) -> str:
        label = label.lower()
        if label in ("car", "vehicle", "bus", "truck", "motorcycle"):
            return "vehicle"
        elif label in ("pedestrian", "person"):
            return "pedestrian"
        elif label in ("pothole", "curb", "stairs", "surface"):
            return "surface"
        elif label in ("bicycle", "bike"):
            return "bicycle"
        elif label in ("traffic_sign", "sign"):
            return "sign"
        elif label in ("traffic_light", "signal"):
            return "signal"
        return "obstacle"

