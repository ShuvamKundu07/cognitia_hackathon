from collections import deque
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.assistant.llm import LLMAssistant
from app.assistant.reference_resolution import ReferenceResolver
from app.assistant.scene_memory import SceneMemory
from app.hazards.models import OCRResult, TrackedHazard
from app.ocr.reader import OCRReader

logger = logging.getLogger("assistant.conversation")


class ConversationManager:
    """Coordinates conversational requests without blocking hazard detection loops."""

    def __init__(
        self,
        scene_memory: SceneMemory,
        ocr_reader: Optional[OCRReader] = None,
        llm_assistant: Optional[LLMAssistant] = None,
    ):
        self.scene_memory = scene_memory
        self.ocr_reader = ocr_reader or OCRReader()
        self.llm = llm_assistant or LLMAssistant()
        self.resolver = ReferenceResolver()
        self.state: str = "IDLE"  # IDLE, ACTIVATING, LISTENING, PROCESSING, SPEAKING, INTERRUPTED
        self.dialogue_history: deque = deque(maxlen=6)
        self.last_target_id: Optional[str] = None
        self.last_intent: Optional[str] = None

    def handle_wake_word(self) -> str:
        """Handles wake word activation ('Hey Bro')."""
        self.state = "ACTIVATING"
        self.last_intent = "WAKE_WORD"
        reply = "Yes, how can I help you?"
        self.dialogue_history.append({
            "role": "assistant",
            "query": "hey bro",
            "reply": reply,
            "intent": "WAKE_WORD",
            "target_object_id": None,
        })
        logger.info("Assistant activated via wake word.")
        return reply

    async def handle_query(
        self,
        query: str,
        current_frame: Optional[np.ndarray],
        active_hazards: List[TrackedHazard],
        audio_event: Optional[Any] = None,
    ) -> Tuple[str, Optional[OCRResult]]:
        """Processes a spoken or typed user inquiry.

        Returns:
            Tuple of (assistant_reply_text, optional_ocr_result)
        """
        self.state = "PROCESSING"
        q = (query or "").strip()
        if not q:
            self.state = "IDLE"
            return "How can I assist you?", None

        # Check wake phrase if invoked directly via query in idle
        q_clean = q.lower().replace(",", "").replace(".", "").strip()
        if q_clean in ("hey bro", "bro", "hi bro", "hello bro", "hey gene", "gene"):
            reply = self.handle_wake_word()
            return reply, None

        # 1. Deterministic Reference Resolution First
        resolved = self.resolver.resolve_reference(
            query=q,
            scene_memory=self.scene_memory,
            active_hazards=active_hazards,
            last_target_id=self.last_target_id,
            dialogue_history=list(self.dialogue_history),
            audio_event=audio_event,
        )

        intent = resolved.get("intent")
        self.last_intent = intent

        # 2. Termination / Exit Request
        if intent == "TERMINATION":
            reply = resolved.get("response", "You're welcome. I'll keep monitoring your surroundings.")
            self.state = "IDLE"
            self.dialogue_history.append({
                "role": "user",
                "query": q,
                "reply": reply,
                "intent": intent,
                "target_object_id": None,
            })
            return reply, None

        # 3. Targeted OCR Reading for Signs
        if intent == "READ_SIGN":
            target_id = resolved.get("target_object_id")
            bbox = resolved.get("bbox")
            ocr_res = self.ocr_reader.read_text(
                frame=current_frame,
                bbox=bbox,
                object_id=target_id or "sign_street_4",
            )
            dir_str = resolved.get("direction", "right")
            reply = f'The sign on your {dir_str} says "{ocr_res.text}".'
            self.last_target_id = target_id
            self.state = "SPEAKING"
            self.dialogue_history.append({
                "role": "user",
                "query": q,
                "reply": reply,
                "intent": intent,
                "target_object_id": target_id,
            })
            return reply, ocr_res

        # 4. Direct Deterministic Safety / Spatial Inquiries
        if intent in ("CHECK_CROSSING", "QUERY_VEHICLE", "QUERY_PATH", "LOCATE_OBJECT", "QUERY_AUDIO", "QUERY_SURROUNDINGS"):
            reply = resolved.get("response", "Safety status clear.")
            target_id = resolved.get("target_object_id")
            if target_id:
                self.last_target_id = target_id
            self.state = "SPEAKING"
            self.dialogue_history.append({
                "role": "user",
                "query": q,
                "reply": reply,
                "intent": intent,
                "target_object_id": target_id,
            })
            return reply, None

        # 5. Fallback to Conversational LLM
        scene_summary = self.scene_memory.get_recent_objects_summary()
        hazards_summary = [h.to_frontend_object() for h in active_hazards]
        audio_summary = (
            f"{audio_event.sound} on your {audio_event.direction}"
            if (audio_event and hasattr(audio_event, "sound"))
            else None
        )

        reply = await self.llm.generate_response(
            query=q,
            scene_summary=scene_summary,
            hazards_summary=hazards_summary,
            audio_summary=audio_summary,
        )
        self.state = "SPEAKING"
        self.dialogue_history.append({
            "role": "user",
            "query": q,
            "reply": reply,
            "intent": "LLM_FALLBACK",
            "target_object_id": None,
        })
        return reply, None

    def interrupt(self) -> None:
        """Interrupts assistant speech when a critical hazard occurs."""
        self.state = "INTERRUPTED"
        logger.info("Assistant speech interrupted for critical safety alert.")

    def finish_speaking(self) -> None:
        """Transitions back to LISTENING if still in active session, or IDLE if finished."""
        if self.state != "IDLE":
            self.state = "LISTENING"

    def reset(self) -> None:
        self.state = "IDLE"
        self.last_target_id = None
        self.last_intent = None

