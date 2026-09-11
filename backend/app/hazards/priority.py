"""Hazard priority queue and multi-criteria ranking engine."""

import time
from typing import List, Optional
from app.hazards.models import TrackedHazard, UrgencyLevel

URGENCY_WEIGHTS = {
    UrgencyLevel.CRITICAL: 10000.0,
    UrgencyLevel.HIGH: 5000.0,
    UrgencyLevel.MEDIUM: 2000.0,
    UrgencyLevel.LOW: 500.0,
}

TTC_SCORES = {
    "critical": 800.0,
    "high": 500.0,
    "medium": 300.0,
    "low": 100.0,
    "very_low": 0.0,
}


class PriorityEngine:
    """Ranks active hazards to identify the single most critical obstacle for speech alerts."""

    def calculate_priority_score(self, hazard: TrackedHazard) -> float:
        """Computes composite priority score for sorting."""
        # 1. Base urgency weight (dominant factor)
        base = URGENCY_WEIGHTS.get(hazard.urgency, 500.0)

        # 2. Path collision bonus: obstacles directly in walking path take precedence
        path_bonus = hazard.path_intersection_score * 1500.0

        # 3. Relative time-to-conflict score
        ttc_bonus = TTC_SCORES.get(hazard.time_to_conflict.lower(), 100.0)

        # 4. Confidence scaling (prevents spurious low-confidence noise from outranking solid tracks)
        conf_bonus = hazard.confidence * 250.0

        # 5. Persistence bonus (established obstacles get slight stability boost)
        age = max(0.0, time.time() - hazard.first_seen)
        persistence_bonus = min(150.0, age * 25.0)

        return base + path_bonus + ttc_bonus + conf_bonus + persistence_bonus

    def sort_hazards(self, hazards: List[TrackedHazard]) -> List[TrackedHazard]:
        """Sorts hazards in strict descending order of priority."""
        if not hazards:
            return []
        return sorted(hazards, key=self.calculate_priority_score, reverse=True)

    def get_top_hazard(self, hazards: List[TrackedHazard]) -> Optional[TrackedHazard]:
        """Returns the single highest priority active hazard."""
        sorted_list = self.sort_hazards(hazards)
        return sorted_list[0] if sorted_list else None

