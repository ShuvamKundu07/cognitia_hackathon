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
        self.last_seen_times: Dict[str, float] = {}

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

        # 2. Re-alert if hazard disappeared and reappeared (> 3.0s gap since last seen)
        if h_id in self.last_seen_times:
            absence_gap = timestamp - self.last_seen_times[h_id]
            if absence_gap > 3.0:
                logger.info("Hazard %s reappeared after %.1fs absence", h_id, absence_gap)
                return True

        time_elapsed = timestamp - last_record.timestamp

        # 3. Re-alert if urgency escalated (e.g. HIGH -> CRITICAL or MEDIUM -> HIGH)
        urgency_order = [UrgencyLevel.LOW, UrgencyLevel.MEDIUM, UrgencyLevel.HIGH, UrgencyLevel.CRITICAL]
        current_idx = urgency_order.index(hazard.urgency)
        last_idx = urgency_order.index(last_record.urgency)
        if current_idx > last_idx:
            logger.info("Hazard %s escalated from %s to %s", h_id, last_record.urgency, hazard.urgency)
            return True

        # 4. Re-alert if obstacle newly enters walking path
        if is_in_path and not last_record.in_path:
            logger.info("Hazard %s newly entered walking corridor", h_id)
            return True

        # 5. Re-alert if direction changed significantly
        if hazard.direction != last_record.direction and hazard.direction != Direction.UNKNOWN:
            logger.info("Hazard %s shifted direction from %s to %s", h_id, last_record.direction, hazard.direction)
            return True

        # 6. Re-alert if object became significantly closer (rapid expansion surge)
        if hazard.expansion_rate > (last_record.expansion_rate + 0.30):
            return True

        # 7. Cooldown expiration: suppress repeated alerts for same hazard/category
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
            self.last_seen_times[hazard.hazard_id] = timestamp
            return None

        # Format natural direction phrasing for speech (e.g., straight ahead, on the right, on the left)
        dir_val = hazard.direction.value
        dir_phrase = "on the right" if dir_val == "right" else "on the left" if dir_val == "left" else "straight ahead"

        msg, action, evasion_dir = self._build_template(hazard, dir_phrase)

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
        self.last_seen_times[hazard.hazard_id] = timestamp

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
            movement_direction=evasion_dir,
        )

    def generate_consolidated_alert(
        self,
        hazards: list[TrackedHazard],
        timestamp: float = 0.0,
    ) -> Optional[HazardAlert]:
        """Consolidates multiple simultaneous detections into an intelligent, prioritized, non-repetitive alert."""
        if not hazards:
            return None
        if timestamp <= 0.0:
            timestamp = time.time()

        # Update last seen timestamps and determine which hazards warrant an alert
        eligible_hazards = [h for h in hazards if self.should_trigger_alert(h, timestamp)]
        for h in hazards:
            self.last_seen_times[h.hazard_id] = timestamp

        # If none of the hazards warrant an alert, suppress repetitive announcements
        if not eligible_hazards:
            return None

        urgency_order = {UrgencyLevel.CRITICAL: 4, UrgencyLevel.HIGH: 3, UrgencyLevel.MEDIUM: 2, UrgencyLevel.LOW: 1}
        sorted_eligible = sorted(
            eligible_hazards,
            key=lambda h: (
                urgency_order.get(h.urgency, 1),
                h.path_intersection_score,
                h.confidence
            ),
            reverse=True
        )

        top_hazard = sorted_eligible[0]
        all_hazards_count = len(hazards)

        if all_hazards_count == 1:
            return self.generate_alert(top_hazard, timestamp=timestamp)

        def get_category(h: TrackedHazard) -> str:
            lbl = h.label.lower()
            ht = h.hazard_type.lower()
            if any(k in lbl or k in ht for k in ("car", "vehicle", "bus", "truck", "motorcycle", "van")):
                return "vehicle"
            if any(k in lbl or k in ht for k in ("pedestrian", "person", "man", "woman")):
                return "pedestrian"
            if any(k in lbl or k in ht for k in ("pothole", "surface", "curb", "stairs", "hole", "drop-off")):
                return "surface"
            return "obstacle"

        cat_counts: Dict[str, int] = {}
        for h in hazards:
            c = get_category(h)
            cat_counts[c] = cat_counts.get(c, 0) + 1

        top_cat = get_category(top_hazard)
        dir_val = top_hazard.direction.value
        dir_phrase = "on the right" if dir_val == "right" else "on the left" if dir_val == "left" else "straight ahead"

        evasion_dir, evasion_phrase, default_action = self.determine_evasion_direction(top_hazard, hazards)

        # Case 1: Multiple detections of the SAME category (e.g., 4 cars, 5 pedestrians, 6 obstacles)
        if cat_counts.get(top_cat, 0) >= 2 and len(cat_counts) == 1:
            if top_cat == "vehicle":
                dir_spec = f" {dir_phrase}" if dir_val in ("left", "right") else " ahead"
                if top_hazard.urgency == UrgencyLevel.CRITICAL:
                    msg = f"Stop. Multiple vehicles detected{dir_spec}. {evasion_phrase}".strip()
                    action = default_action
                elif top_hazard.urgency == UrgencyLevel.HIGH:
                    if dir_val in ("left", "right"):
                        msg = f"Warning: multiple cars approaching {dir_phrase}. {evasion_phrase}".strip()
                        action = default_action
                    else:
                        msg = f"Multiple cars detected{dir_spec}. {evasion_phrase}".strip()
                        action = default_action
                else:
                    msg = f"Multiple cars detected{dir_spec}. {evasion_phrase}".strip()
                    action = default_action
            elif top_cat == "pedestrian":
                if dir_val in ("left", "right"):
                    keep_action = "KEEP RIGHT" if evasion_dir == "right" else "KEEP LEFT"
                    keep_phrase = "Keep right." if evasion_dir == "right" else "Keep left."
                    msg = f"Multiple pedestrians detected {dir_phrase}. {keep_phrase}".strip()
                    action = keep_action
                else:
                    msg = f"Multiple pedestrians detected ahead. {evasion_phrase}".strip()
                    action = default_action
            elif top_cat == "surface":
                msg = f"Multiple obstacles detected nearby. {evasion_phrase}".strip()
                action = default_action
            else:
                msg = f"Multiple obstacles detected nearby. {evasion_phrase}".strip()
                action = default_action

        # Case 2: Multiple DIFFERENT categories detected simultaneously
        else:
            is_approaching = top_hazard.motion.value == "approaching" or top_hazard.expansion_rate > 0.15
            top_label = "car" if top_cat == "vehicle" else "pedestrian" if top_cat == "pedestrian" else top_hazard.label.replace('_', ' ')
            
            if top_hazard.urgency == UrgencyLevel.CRITICAL:
                prefix = "Stop"
            elif top_hazard.urgency == UrgencyLevel.HIGH:
                prefix = "Warning"
            else:
                prefix = "Notice"

            motion_phrase = "approaching from the right" if (is_approaching and dir_val == "right") else \
                            "approaching from the left" if (is_approaching and dir_val == "left") else \
                            "approaching ahead" if (is_approaching and dir_val in ("ahead", "center")) else \
                            f"detected {dir_phrase}"

            secondary_hazards = [h for h in hazards if h.hazard_id != top_hazard.hazard_id]
            if len(secondary_hazards) >= 2:
                sec_phrase = "Multiple obstacles ahead."
            elif len(secondary_hazards) == 1:
                sh = secondary_hazards[0]
                sh_cat = get_category(sh)
                sh_dir = sh.direction.value
                sh_dir_phrase = "on the right" if sh_dir == "right" else "on the left" if sh_dir == "left" else "straight ahead"
                if sh_cat == "pedestrian":
                    sec_phrase = f"Pedestrian on the {sh_dir}." if sh_dir in ("left", "right") else "Pedestrian ahead."
                elif sh_cat == "vehicle":
                    sec_phrase = f"Vehicle on the {sh_dir}." if sh_dir in ("left", "right") else "Vehicle ahead."
                elif sh_cat == "surface":
                    sec_phrase = f"Pothole {sh_dir_phrase}."
                else:
                    sec_phrase = f"Obstacle {sh_dir_phrase}."
            else:
                sec_phrase = ""

            msg = f"{prefix}: {top_label} {motion_phrase}. {sec_phrase} {evasion_phrase}".strip()
            action = default_action

        highest_urgency = max(sorted_eligible, key=lambda h: urgency_order.get(h.urgency, 1)).urgency

        # Cache alert records for all active hazards and for the consolidated message
        for h in hazards:
            rec = AlertHistoryRecord(
                timestamp=timestamp,
                urgency=h.urgency,
                direction=h.direction,
                in_path=(h.path_intersection_score >= 0.35),
                expansion_rate=h.expansion_rate,
            )
            self.alert_cache[h.hazard_id] = rec
            self.alert_cache[f"{h.hazard_type}_{h.direction.value}"] = rec

        interrupt = (highest_urgency == UrgencyLevel.CRITICAL)

        return HazardAlert(
            hazard_id=top_hazard.hazard_id,
            hazard_type="multi_hazard" if len(cat_counts) > 1 else top_hazard.hazard_type,
            message=msg,
            action=action,
            direction=top_hazard.direction.value.capitalize(),
            urgency=highest_urgency.value.upper(),
            confidence=max(h.confidence for h in hazards),
            timestamp=int(timestamp * 1000),
            interrupt=interrupt,
            movement_direction=evasion_dir,
        )

    def determine_evasion_direction(
        self,
        hazard: TrackedHazard,
        all_hazards: Optional[list[TrackedHazard]] = None,
    ) -> tuple[str, str, str]:
        """
        Computes the recommended evasion movement direction for the user.
        Returns:
            (movement_direction, evasion_phrase, action_text)
            movement_direction: 'left' | 'right' | 'stop' | 'straight'
        """
        dir_val = hazard.direction.value if hasattr(hazard.direction, "value") else str(hazard.direction).lower()
        urgency = hazard.urgency
        is_crit = (urgency == UrgencyLevel.CRITICAL)

        # 1. Critical head-on collision threat or drop-off ahead
        if is_crit and dir_val in ("ahead", "center"):
            res = ("stop", "Stop immediately.", "STOP IMMEDIATELY")
        # 2. Hazard is on the right -> Move away to the LEFT
        elif "right" in dir_val:
            phrase = "Stop and step left." if is_crit else "Move left."
            action = "STOP & STEP LEFT" if is_crit else "MOVE LEFT"
            res = ("left", phrase, action)
        # 3. Hazard is on the left -> Move away to the RIGHT
        elif "left" in dir_val:
            phrase = "Stop and step right." if is_crit else "Move right."
            action = "STOP & STEP RIGHT" if is_crit else "MOVE RIGHT"
            res = ("right", phrase, action)
        # 4. Hazard is straight ahead / center in walking path
        else:
            other_hazards = [h for h in (all_hazards or []) if h.hazard_id != hazard.hazard_id]
            has_right_block = any("right" in (h.direction.value if hasattr(h.direction, "value") else str(h.direction)).lower() for h in other_hazards)
            has_left_block = any("left" in (h.direction.value if hasattr(h.direction, "value") else str(h.direction)).lower() for h in other_hazards)

            if has_right_block and not has_left_block:
                res = ("left", "Move left.", "MOVE LEFT")
            elif has_left_block and not has_right_block:
                res = ("right", "Move right.", "MOVE RIGHT")
            else:
                # Center-of-mass check on bounding box
                cx = 0.5
                if hazard.latest_bbox:
                    cx = hazard.latest_bbox.x + (hazard.latest_bbox.width / 2.0)

                if cx >= 0.50:
                    phrase = "Stop and step left." if is_crit else "Step left to bypass."
                    action = "STOP & STEP LEFT" if is_crit else "STEP LEFT"
                    res = ("left", phrase, action)
                else:
                    phrase = "Stop and step right." if is_crit else "Step right to bypass."
                    action = "STOP & STEP RIGHT" if is_crit else "STEP RIGHT"
                    res = ("right", phrase, action)

        return res

    def _build_template(self, hazard: TrackedHazard, dir_phrase: str) -> tuple[str, str, str]:
        """Generates low-latency templated message, recommended pedestrian action, and movement direction."""
        evasion_dir, evasion_phrase, default_action = self.determine_evasion_direction(hazard)
        h_type = hazard.hazard_type.lower()
        lbl = hazard.label.lower()
        urgency = hazard.urgency

        if "blindspot" in lbl:
            if "left" in lbl:
                return "Stop. Vehicle detected in your left blindspot. Move right.", "STOP & CHECK LEFT", "right"
            elif "right" in lbl:
                return "Stop. Vehicle detected in your right blindspot. Move left.", "STOP & CHECK RIGHT", "left"
            elif "rear" in lbl or "behind" in lbl:
                return "Stop. Vehicle detected approaching from behind. Step aside.", "STOP & CHECK BEHIND", "stop"
            return f"Stop. Hazard detected in blindspot: {hazard.label}. {evasion_phrase}".strip(), default_action, evasion_dir

        if h_type == "acoustic":
            if "siren" in lbl:
                return f"Caution. Emergency siren heard {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif "horn" in lbl:
                return f"Caution. Vehicle horn sounded {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif "squeal" in lbl:
                return f"Stop. Tire squeal heard {dir_phrase}. Stop immediately.", "STOP IMMEDIATELY", "stop"
            return f"Caution. {lbl.replace('_', ' ').capitalize()} heard {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir

        if urgency == UrgencyLevel.CRITICAL:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Stop. Pedestrian detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Stop. Vehicle detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "surface" or lbl in ("pothole", "curb", "stairs"):
                if "pothole" in lbl or h_type == "pothole":
                    return f"Stop. Pothole detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
                return f"Stop. Drop-off detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            return f"Stop. {lbl.replace('_', ' ').capitalize()} detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir

        elif urgency == UrgencyLevel.HIGH:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Caution. Pedestrian detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif "pothole" in lbl or (h_type == "surface" and "curb" not in lbl):
                return f"Caution. Pothole detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "surface" or "curb" in lbl:
                return f"Caution. Curb detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Caution. Vehicle detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "bicycle":
                return f"Caution. Bicycle detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            return f"Caution. {lbl.replace('_', ' ').capitalize()} detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir

        elif urgency == UrgencyLevel.MEDIUM:
            if "pedestrian" in lbl or h_type == "pedestrian":
                return f"Pedestrian detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif "pothole" in lbl or h_type == "surface":
                return f"Pothole detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            elif h_type == "vehicle" or lbl in ("car", "bus", "truck", "motorcycle"):
                return f"Vehicle detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir
            return f"{lbl.replace('_', ' ').capitalize()} detected {dir_phrase}. {evasion_phrase}".strip(), default_action, evasion_dir

        else:  # LOW
            if lbl == "crosswalk":
                return f"Crosswalk detected {dir_phrase}.", "PREPARE TO CROSS", "straight"
            elif "sign" in lbl:
                return f"Sign detected {dir_phrase}.", "INFO", "straight"
            elif "signal" in lbl:
                return f"Traffic signal detected {dir_phrase}.", "INFO", "straight"
            elif "pedestrian" in lbl or h_type == "pedestrian":
                return f"Pedestrian detected {dir_phrase}.", "INFO", evasion_dir
            elif "pothole" in lbl or h_type == "surface":
                return f"Pothole detected {dir_phrase}.", "INFO", evasion_dir
            return f"{lbl.replace('_', ' ').capitalize()} detected {dir_phrase}.", "INFO", evasion_dir

    def reset_cache(self) -> None:
        self.alert_cache.clear()

