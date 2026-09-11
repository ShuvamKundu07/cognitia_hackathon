"""Safety Controller enforcing absolute priority of critical physical hazards over conversation."""

import logging
from typing import Optional
from app.assistant.conversation import ConversationManager
from app.hazards.models import HazardAlert, UrgencyLevel

logger = logging.getLogger("safety.controller")


class SafetyController:
    """Highest-level supervisor enforcing SAFETY ALERT > SYSTEM FAILURE > CONVERSATION."""

    def __init__(self, conversation_manager: Optional[ConversationManager] = None):
        self.conversation_manager = conversation_manager

    def arbitrate_alert(self, alert: HazardAlert) -> HazardAlert:
        """Enforces critical interruption over assistant speech when a danger arises."""
        if not alert:
            return alert

        urgency_upper = (alert.urgency or "").upper()
        is_urgent = urgency_upper in ("CRITICAL", "HIGH")

        if is_urgent and self.conversation_manager:
            if self.conversation_manager.state not in ("IDLE", "INTERRUPTED"):
                self.conversation_manager.interrupt()
                alert.interrupt = True
                logger.warning("SAFETY CONTROLLER INTERRUPT: %s alert preempts assistant: %s", urgency_upper, alert.message)
            else:
                alert.interrupt = True

        return alert

