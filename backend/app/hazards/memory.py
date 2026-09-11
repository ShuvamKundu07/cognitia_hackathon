"""Temporal hazard memory with grace-period retention and resolution tracking."""

import logging
import time
from typing import Dict, List, Optional, Tuple
from app.config import settings
from app.hazards.models import TrackedHazard

logger = logging.getLogger("hazards.memory")


class HazardMemory:
    """Maintains active obstacles across temporal drops and tracks hazard lifecycles."""

    def __init__(self, grace_period_seconds: float = 1.50):
        self.grace_period_seconds = grace_period_seconds
        self.active_hazards: Dict[str, TrackedHazard] = {}
        self.resolved_hazards: Dict[str, TrackedHazard] = {}

    def update(
        self,
        current_hazards: List[TrackedHazard],
        timestamp: float = 0.0,
    ) -> Tuple[List[TrackedHazard], List[str]]:
        """Updates memory with current frame hazards.

        Returns:
            Tuple of (active_hazards_list, newly_resolved_hazard_ids)
        """
        if timestamp <= 0.0:
            timestamp = time.time()

        seen_keys = set()
        newly_resolved_ids: List[str] = []

        # 1. Update or register current hazards
        for hazard in current_hazards:
            h_id = hazard.hazard_id
            seen_keys.add(h_id)

            if h_id in self.active_hazards:
                existing = self.active_hazards[h_id]
                # Preserve alert history and first_seen
                hazard.first_seen = existing.first_seen
                hazard.alerted = existing.alerted
                hazard.last_alert_time = existing.last_alert_time

                # Retain historical positions
                hazard.last_seen = timestamp
                self.active_hazards[h_id] = hazard
            else:
                # Check if this was recently resolved and reappeared
                if h_id in self.resolved_hazards:
                    del self.resolved_hazards[h_id]
                hazard.first_seen = timestamp
                hazard.last_seen = timestamp
                self.active_hazards[h_id] = hazard

        # 2. Check for missing hazards against grace period
        all_active_keys = list(self.active_hazards.keys())
        for h_id in all_active_keys:
            if h_id not in seen_keys:
                hazard = self.active_hazards[h_id]
                time_lost = timestamp - hazard.last_seen

                if time_lost > self.grace_period_seconds:
                    # Grace period expired: mark resolved
                    hazard.resolved = True
                    self.resolved_hazards[h_id] = hazard
                    del self.active_hazards[h_id]
                    newly_resolved_ids.append(h_id)
                    logger.debug("Hazard %s resolved after %.2fs absence", h_id, time_lost)

        active_list = list(self.active_hazards.values())
        return active_list, newly_resolved_ids

    def mark_alerted(self, hazard_id: str, timestamp: float = 0.0) -> None:
        """Records that an audible/prominent safety alert was dispatched for this hazard."""
        if timestamp <= 0.0:
            timestamp = time.time()
        if hazard_id in self.active_hazards:
            self.active_hazards[hazard_id].alerted = True
            self.active_hazards[hazard_id].last_alert_time = timestamp

    def get_hazard(self, hazard_id: str) -> Optional[TrackedHazard]:
        return self.active_hazards.get(hazard_id) or self.resolved_hazards.get(hazard_id)

    def clear(self) -> None:
        self.active_hazards.clear()
        self.resolved_hazards.clear()

