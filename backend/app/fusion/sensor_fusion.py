"""Multi-modal sensor fusion engine combining visual hazard tracks and acoustic events."""

import logging
import time
from typing import List, Optional, Tuple
from app.hazards.models import (
    AudioEvent,
    BoundingBox,
    Direction,
    MotionType,
    TrackedHazard,
    UrgencyLevel,
)

logger = logging.getLogger("fusion.sensor_fusion")


class SensorFusion:
    """Fuses visual obstacle detections with acoustic events using transparent, deterministic rules.

    Design Principles:
    - Modality Agreement Boost: When visual vehicle tracking and acoustic horn/siren align
      in direction and time, confidence and threat severity are boosted.
    - Asymmetric Independence: Audio-only events (e.g. siren from behind or obscured horn)
      can trigger safety alerts even without direct line-of-sight visual bounding boxes.
    - No Blind Probability Multiplication: Employs bounded additive evidence weights.
    """

    def __init__(self, audio_temporal_window_seconds: float = 2.0):
        self.audio_temporal_window_seconds = audio_temporal_window_seconds
        self.last_audio_event: Optional[AudioEvent] = None
        self.last_audio_time: float = 0.0

    def register_audio_event(self, audio_event: AudioEvent, timestamp: float = 0.0) -> None:
        """Stores the most recent acoustic classification."""
        if timestamp <= 0.0:
            timestamp = time.time()
        self.last_audio_event = audio_event
        self.last_audio_time = timestamp

    def evaluate_360_fusion(
        self,
        audio_event: AudioEvent,
        visual_vehicles: List[float],
    ) -> Tuple[str, str, UrgencyLevel, str]:
        """Multi-Modal 360 Fusion Decision Matrix.

        Correlates acoustic direction ('Left', 'Right', 'Center') with visual vehicle positions
        (normalized horizontal centers norm_x in [0.0, 1.0]).

        Returns:
            Tuple of (hazard_zone, urgency_string, UrgencyLevel, warning_msg)
        """
        raw_dir = (audio_event.direction or "Center").strip().lower()
        if "left" in raw_dir:
            audio_dir = "Left"
        elif "right" in raw_dir:
            audio_dir = "Right"
        else:
            audio_dir = "Center"

        hazard_zone = "UNKNOWN"
        urgency = "LOW"
        urgency_level = UrgencyLevel.LOW

        # Multi-Modal 360 Fusion Decision Matrix
        if audio_dir == "Left":
            # Check if camera sees vehicle on left side
            if any(x < 0.33 for x in visual_vehicles):
                hazard_zone = "LEFT (IN VIEW)"
                urgency = "WARNING"
                urgency_level = UrgencyLevel.HIGH
            else:
                # Audio heard on left, but camera doesn't see it -> Blindspot!
                hazard_zone = "LEFT BLINDSPOT"
                urgency = "CRITICAL"
                urgency_level = UrgencyLevel.CRITICAL

        elif audio_dir == "Right":
            if any(x > 0.66 for x in visual_vehicles):
                hazard_zone = "RIGHT (IN VIEW)"
                urgency = "WARNING"
                urgency_level = UrgencyLevel.HIGH
            else:
                hazard_zone = "RIGHT BLINDSPOT"
                urgency = "CRITICAL"
                urgency_level = UrgencyLevel.CRITICAL

        elif audio_dir == "Center":
            # Camera has central view (roughly 0.25 to 0.75)
            if any(0.25 <= x <= 0.75 for x in visual_vehicles):
                hazard_zone = "AHEAD (IN VIEW)"
                urgency = "TRACKED"
                urgency_level = UrgencyLevel.MEDIUM
            else:
                # Sound is central, but NOT in front camera view -> Rear approach!
                hazard_zone = "BEHIND (REAR BLINDSPOT)"
                urgency = "CRITICAL"
                urgency_level = UrgencyLevel.CRITICAL

        sound_type = audio_event.sound
        is_approaching = (
            "approaching" in sound_type.lower()
            or getattr(audio_event, "approaching", False)
        )
        if is_approaching:
            urgency = "CRITICAL"
            urgency_level = UrgencyLevel.CRITICAL

        warning_msg = f"{urgency}: {sound_type} [{hazard_zone}]"
        if is_approaching:
            warning_msg += " - RAPID APPROACH!"

        return hazard_zone, urgency, urgency_level, warning_msg

    def classify_hazard_zone(
        self,
        audio_dir: str,
        visual_vehicles: List[float],
    ) -> Tuple[str, str]:
        """Convenience helper returning (hazard_zone, urgency) for direct script compatibility."""
        evt = AudioEvent(sound="Vehicle Sound", direction=audio_dir, confidence=0.90)
        zone, urg, _, _ = self.evaluate_360_fusion(evt, visual_vehicles)
        return zone, urg

    def fuse(
        self,
        visual_hazards: List[TrackedHazard],
        timestamp: float = 0.0,
    ) -> List[TrackedHazard]:
        """Fuses active visual hazards with recent acoustic events using the 360° decision matrix."""
        if timestamp <= 0.0:
            timestamp = time.time()

        audio_active = (
            self.last_audio_event is not None
            and (timestamp - self.last_audio_time) <= self.audio_temporal_window_seconds
        )

        vehicle_keywords = ("vehicle", "car", "bus", "truck", "motorcycle")
        visual_vehicles: List[float] = []
        vehicle_hazards: List[Tuple[float, TrackedHazard]] = []

        for hazard in visual_hazards:
            is_veh = (
                hazard.hazard_type.lower() in vehicle_keywords
                or any(k in hazard.label.lower() for k in vehicle_keywords)
            )
            if is_veh:
                if hazard.latest_bbox is not None:
                    x_val = hazard.latest_bbox.center_x
                else:
                    x_val = (
                        0.80 if hazard.direction == Direction.RIGHT
                        else 0.20 if hazard.direction == Direction.LEFT
                        else 0.50
                    )
                visual_vehicles.append(x_val)
                vehicle_hazards.append((x_val, hazard))

        fused_hazards: List[TrackedHazard] = list(visual_hazards)

        if audio_active and self.last_audio_event:
            # Strictly ignore engine sounds
            if "engine" in self.last_audio_event.sound.lower():
                return fused_hazards

            zone, urg_str, urg_lvl, warning_msg = self.evaluate_360_fusion(
                self.last_audio_event,
                visual_vehicles,
            )

            is_approaching = (
                "approaching" in self.last_audio_event.sound.lower()
                or getattr(self.last_audio_event, "approaching", False)
            )

            if "IN VIEW" in zone:
                # Modality agreement: boost visual vehicle confidence and escalate if approaching
                for x_val, v_hazard in vehicle_hazards:
                    matched = False
                    if "LEFT" in zone and x_val < 0.33:
                        matched = True
                    elif "RIGHT" in zone and x_val > 0.66:
                        matched = True
                    elif "AHEAD" in zone and 0.25 <= x_val <= 0.75:
                        matched = True

                    if matched:
                        v_hazard.confidence = min(0.99, round(v_hazard.confidence + 0.15, 3))
                        is_hazard_approaching = (
                            is_approaching
                            or (v_hazard.motion == MotionType.APPROACHING)
                        )
                        if urg_lvl == UrgencyLevel.CRITICAL or is_hazard_approaching:
                            v_hazard.urgency = UrgencyLevel.CRITICAL
                            v_hazard.time_to_conflict = "critical"
                        elif urg_lvl == UrgencyLevel.HIGH and v_hazard.urgency in (UrgencyLevel.LOW, UrgencyLevel.MEDIUM):
                            v_hazard.urgency = UrgencyLevel.HIGH

                        logger.info("Sensor fusion: vehicle %s boosted by acoustic confirmation [%s]", v_hazard.hazard_id, zone)

            elif "BLINDSPOT" in zone:
                # Acoustic threat detected in vehicle blindspot -> generate high-priority acoustic hazard
                acoustic_hazard = self._create_acoustic_hazard(
                    self.last_audio_event,
                    timestamp,
                    hazard_zone=zone,
                    urgency=urg_lvl,
                    warning_msg=warning_msg,
                )
                fused_hazards.append(acoustic_hazard)
                logger.info("Sensor fusion: generated blindspot hazard %s [%s]", self.last_audio_event.sound, zone)

            else:
                # General acoustic threat
                sound_lower = self.last_audio_event.sound.lower()
                if self.last_audio_event.confidence >= 0.70:
                    is_threat = any(
                        k in sound_lower for k in ("siren", "horn", "tire squeal", "truck", "motorcycle")
                    )
                    if is_threat:
                        acoustic_hazard = self._create_acoustic_hazard(self.last_audio_event, timestamp)
                        fused_hazards.append(acoustic_hazard)

        return fused_hazards

    def _create_acoustic_hazard(
        self,
        audio_event: AudioEvent,
        timestamp: float,
        hazard_zone: Optional[str] = None,
        urgency: Optional[UrgencyLevel] = None,
        warning_msg: Optional[str] = None,
    ) -> TrackedHazard:
        """Constructs a localized or directionally anchored acoustic hazard."""
        sound_lower = audio_event.sound.lower()
        is_critical = (
            "siren" in sound_lower
            or "tire squeal" in sound_lower
            or "approaching" in sound_lower
            or (hazard_zone and "blindspot" in hazard_zone.lower())
        )

        final_urgency = urgency or (UrgencyLevel.CRITICAL if is_critical else UrgencyLevel.HIGH)

        # Coordinate and direction mapping based on hazard zone
        if hazard_zone:
            if "LEFT" in hazard_zone:
                dir_enum = Direction.LEFT
                bx, by = 0.05, 0.40
            elif "RIGHT" in hazard_zone:
                dir_enum = Direction.RIGHT
                bx, by = 0.75, 0.40
            elif "BEHIND" in hazard_zone or "REAR" in hazard_zone:
                dir_enum = Direction.UNKNOWN
                bx, by = 0.40, 0.85
            else:
                dir_enum = Direction.AHEAD
                bx, by = 0.40, 0.30
            hazard_label = f"{audio_event.sound} [{hazard_zone}]"
        else:
            dir_enum = Direction.from_str(audio_event.direction)
            bx = 0.70 if dir_enum == Direction.RIGHT else 0.10 if dir_enum == Direction.LEFT else 0.40
            by = 0.40
            hazard_label = audio_event.sound

        clean_sound = audio_event.sound.lower().replace(" ", "_").replace("[", "").replace("]", "")
        clean_dir = dir_enum.value.lower()
        stable_id = f"acoustic_{clean_sound}_{clean_dir}"
        bbox = BoundingBox(x=bx, y=by, width=0.20, height=0.20)

        return TrackedHazard(
            hazard_id=stable_id,
            track_id=stable_id,
            hazard_type="acoustic",
            label=hazard_label,
            first_seen=timestamp,
            last_seen=timestamp,
            confidence=audio_event.confidence,
            direction=dir_enum,
            motion=MotionType.APPROACHING if is_critical else MotionType.CROSSING,
            relative_speed=0.65,
            expansion_rate=0.0,
            path_intersection_score=0.60 if is_critical else 0.40,
            time_to_conflict="critical" if is_critical else "high",
            risk_score=0.95 if is_critical else 0.72,
            urgency=final_urgency,
            bboxes=[bbox],
        )

