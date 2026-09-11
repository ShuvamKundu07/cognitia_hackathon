"""Deterministic safety alert generator with non-repetitive deduplication and cooldown rules."""

import logging
import time
from typing import Dict, NamedTuple, Optional
from app.config import AlertFrequency, settings
from app.hazards.models import Direction, HazardAlert, TrackedHazard, UrgencyLevel

logger = logging.getLogger("hazards.alerts")


class AlertHistoryRecord(NamedTuple):
    timestamp: float
    urgency: UrgencyLevel
    direction: Direction
    in_path: bool
    expansion_rate: float


class AlertGenerator:
    """Generates concise, predictable speech alert templates and prevents repetitive alert spam."""

    def __init__(self, cooldown_seconds: float = 8.0):
        self.cooldown_seconds = cooldown_seconds
        self.alert_cache: Dict[str, AlertHistoryRecord] = {}

    def set_cooldown(self, cooldown_seconds: float) -> None:
        self.cooldown_seconds = cooldown_seconds

    def should_trigger_alert(
        self,
        hazard: TrackedHazard,
        timestamp: float = 0.0,
    ) -> bool:
        """Determines if a spoken alert should fire based on deduplication rules."""
        if timestamp <= 0.0:
            timestamp = time.time()

        h_id = hazard.hazard_id
        is_in_path = hazard.path_intersection_score >= 0.35
        sem_key = f"{hazard.hazard_type}_{hazard.direction.value}"

        # Match prior alert record by specific ID or semantic category (type + direction)
        last_record = self.alert_cache.get(h_id) or self.alert_cache.get(sem_key)

        # 1. New hazard and semantic category never alerted -> ALWAYS alert
        if not last_record:
            return True

        time_elapsed = timestamp - last_record.timestamp

        # 2. Re-alert if urgency escalated (e.g. HIGH -> CRITICAL or MEDIUM -> HIGH)
        urgency_order = [UrgencyLevel.LOW, UrgencyLevel.MEDIUM, UrgencyLevel.HIGH, UrgencyLevel.CRITICAL]
        current_idx = urgency_order.index(hazard.urgency)
        last_idx = urgency_order.index(last_record.urgency)
        if current_idx > last_idx:
            logger.info("Hazard %s escalated from %s to %s", h_id, last_record.urgency, hazard.urgency)
            return True

        # 3. Re-alert if obstacle newly enters walking path
        if is_in_path and not last_record.in_path:
            logger.info("Hazard %s newly entered walking corridor", h_id)
            return True

        # 4. Re-alert if direction changed significantly
        if hazard.direction != last_record.direction and hazard.direction != Direction.UNKNOWN:
            logger.info("Hazard %s shifted direction from %s to %s", h_id, last_record.direction, hazard.direction)
            return True

        # 5. Re-alert if object became significantly closer (rapid expansion surge)
        if hazard.expansion_rate > (last_record.expansion_rate + 0.30):
            return True

        # 6. Cooldown expiration: suppress repeated alerts for same hazard/category
        return time_elapsed >= self.cooldown_seconds

    def generate_alert(
        self,
        hazard: TrackedHazard,
        timestamp: float = 0.0,
    ) -> Optional[HazardAlert]:
        """Generates a templated safety alert if deduplication criteria are met."""
        if timestamp <= 0.0:
            timestamp = time.time()

        if not self.should_trigger_alert(hazard, timestamp):
            return None

        # Format natural direction phrasing for speech (e.g., straight ahead, on the right, on the left)
        dir_val = hazard.direction.value
        dir_phrase = "on the right" if dir_val == "right" else "on the left" if dir_val == "left" else "straight ahead"

        msg, action = self._build_template(hazard, dir_phrase)

        # Record in alert cache by hazard ID and semantic category
        rec = AlertHistoryRecord(
            timestamp=timestamp,
            urgency=hazard.urgency,
            direction=hazard.direction,
            in_path=(hazard.path_intersection_score >= 0.35),
            expansion_rate=hazard.expansion_rate,
        )
        self.alert_cache[hazard.hazard_id] = rec
        self.alert_cache[f"{hazard.hazard_type}_{hazard.direction.value}"] = rec

        interrupt = (hazard.urgency == UrgencyLevel.CRITICAL)

        return HazardAlert(
            hazard_id=hazard.hazard_id,
            hazard_type=hazard.hazard_type,
            message=msg,
            action=action,
            direction=hazard.direction.value.capitalize(),
            urgency=hazard.urgency.value.upper(),
            confidence=hazard.confidence,
            timestamp=int(timestamp * 1000),
            interrupt=interrupt,
        )

    def _build_template(self, hazard: TrackedHazard, dir_phrase: str) -> tuple[str, str]:
        """Generates low-latency templated message and recommended pedestrian action with full directional speech."""
        h_type = hazard.hazard_type.lower()
        lbl = hazard.label.lower()
        urgency = hazard.urgency

        if "blindspot" in lbl:
            if "left" in lbl:
                return "Stop. Vehicle detected in your left blindspot.", "STOP & CHECK LEFT"
            elif "right" in lbl:
                return "Stop. Vehicle detected in your right blindspot.", "STOP & CHECK RIGHT"
            elif "rear" in lbl or "behind" in lbl:
                return "Stop. Vehicle detected approaching from behind.", "STOP & CHECK BEHIND"
            return f"Stop. Hazard detected in blindspot: {hazard.label}.", "STOP IMMEDIATELY"

        if h_type == "acoustic":
            if "siren" in lbl:
                return f"Caution. Emergency siren heard {dir_phrase}.", "YIELD & MONITOR"
            elif "horn" in lbl:
                return f"Caution. Vehicle horn sounded {dir_phrase}.", "STOP & MONITOR"
            elif "squeal" in lbl:
                return f"Stop. Tire squeal heard {dir_phrase}.", "STOP IMMEDIATELY"
            return f"Caution. {lbl.replace('_', ' ').capitalize()} heard {dir_phrase}.", "PROCEED WITH CAUTION"

        if urgency == UrgencyLevel.CRITICAL:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Stop. Pedestrian detected {dir_phrase}.", "STOP IMMEDIATELY"
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Stop. Vehicle detected {dir_phrase}.", "STOP IMMEDIATELY"
            elif h_type == "surface" or lbl in ("pothole", "curb", "stairs"):
                if "pothole" in lbl or h_type == "pothole":
                    return f"Stop. Pothole detected {dir_phrase}.", "STOP IMMEDIATELY"
                return f"Stop. Drop-off detected {dir_phrase}.", "STOP IMMEDIATELY"
            return f"Stop. {lbl.replace('_', ' ').capitalize()} detected {dir_phrase}.", "STOP IMMEDIATELY"

        elif urgency == UrgencyLevel.HIGH:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Caution. Pedestrian detected {dir_phrase}.", "MAINTAIN AWARENESS"
            elif "pothole" in lbl or (h_type == "surface" and "curb" not in lbl):
                return f"Caution. Pothole detected {dir_phrase}.", "SLOW DOWN & WATCH PATH"
            elif h_type == "surface" or "curb" in lbl:
                return f"Caution. Curb detected {dir_phrase}.", "SLOW DOWN & WATCH PATH"
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Caution. Vehicle detected {dir_phrase}.", "SLOW DOWN & MONITOR"
            elif h_type == "bicycle":
                return f"Caution. Bicycle detected {dir_phrase}.", "STEP ASIDE"
            return f"Caution. {lbl.replace('_', ' ').capitalize()} detected {dir_phrase}.", "PROCEED WITH CAUTION"

        elif urgency == UrgencyLevel.MEDIUM:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Pedestrian detected {dir_phrase}.", "MAINTAIN AWARENESS"
            elif "pothole" in lbl or h_type == "surface":
                return f"Pothole detected {dir_phrase}.", "WATCH PATH"
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Vehicle detected {dir_phrase}.", "MAINTAIN PATH"
            return f"{lbl.replace('_', ' ').capitalize()} detected {dir_phrase}.", "AWARENESS"

        else:  # LOW
            if lbl == "crosswalk":
                return f"Crosswalk detected {dir_phrase}.", "PREPARE TO CROSS"
            elif "sign" in lbl:
                return f"Sign detected {dir_phrase}.", "INFO"
            elif "signal" in lbl:
                return f"Traffic signal detected {dir_phrase}.", "INFO"
            elif "pedestrian" in lbl or h_type == "pedestrian":
                return f"Pedestrian detected {dir_phrase}.", "INFO"
            elif "pothole" in lbl or h_type == "surface":
                return f"Pothole detected {dir_phrase}.", "INFO"
            return f"{lbl.replace('_', ' ').capitalize()} detected {dir_phrase}.", "INFO"

    def reset_cache(self) -> None:
        self.alert_cache.clear()

