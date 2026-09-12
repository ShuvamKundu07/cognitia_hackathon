"""Conversational LLM assistant interface with deterministic safety guardrails."""

import logging
import os
from typing import Any, Dict, List, Optional
import httpx

from app.config import settings

logger = logging.getLogger("assistant.llm")


class LLMAssistant:
    """Generates concise natural language answers to user pedestrian inquiries.

    SAFETY GUARDRAILS:
    The LLM is strictly isolated to conversational assistance and scene clarification.
    It has NO authority over real-time safety alerts, detection, or risk scoring.
    """

    def __init__(
        self,
        provider: str = "",
        api_key: str = "",
        model_name: str = "",
    ):
        self.api_key = (
            api_key
            or settings.gemini_api_key
            or settings.llm_api_key
            or os.environ.get("GEMINI_API_KEY", "")
            or os.environ.get("GOOGLE_API_KEY", "")
        ).strip()
        self.provider = provider or settings.llm_provider or ("gemini" if self.api_key else "rule_based")
        self.model_name = model_name or settings.llm_model or "gemini-2.5-flash"

    async def generate_response(
        self,
        query: str,
        scene_summary: List[Dict[str, Any]],
        hazards_summary: List[Dict[str, Any]],
        ocr_text: Optional[str] = None,
        audio_summary: Optional[str] = None,
    ) -> str:
        """Generates a concise audio-friendly answer."""
        if not query:
            return "I am listening. How can I assist you?"

        # If Gemini API key is configured, invoke Gemini API
        if self.api_key and self.provider in ("gemini", "rule_based"):
            try:
                response = await self._call_gemini_api(query, scene_summary, hazards_summary, ocr_text, audio_summary)
                if response:
                    return response
            except Exception as e:
                logger.error("Gemini API call failed, falling back to local reasoning: %s", e)

        # High-quality deterministic natural language fallback
        return self._generate_local_response(query, scene_summary, hazards_summary, ocr_text, audio_summary)

    async def _call_gemini_api(
        self,
        query: str,
        scene_summary: List[Dict[str, Any]],
        hazards_summary: List[Dict[str, Any]],
        ocr_text: Optional[str],
        audio_summary: Optional[str] = None,
    ) -> str:
        """Calls Google Gemini API with system instructions and model fallbacks."""
        models_to_try = [self.model_name, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        candidate_models = list(dict.fromkeys(m for m in models_to_try if m))

        system_instruction = (
            "You are Bro, a friendly, ultra-observant conversational AI assistant for a blind or low-vision pedestrian using the Pedestrian Shield assistive system.\n"
            "Your responses will be read aloud via Text-to-Speech directly into the pedestrian's ear.\n"
            "STRICT GUIDELINES:\n"
            "1. Keep answers ultra-concise (1-2 sentences maximum), calm, natural, and conversational.\n"
            "2. Prioritize situational orientation, spatial directions (left, right, ahead), and physical pedestrian safety.\n"
            "3. Do NOT use markdown asterisks (*), hashtags (#), bullet points, headers, emojis, or code blocks.\n"
            "4. Base your answers on the real-time observed scene and hazard context provided.\n"
            "5. If asked general or casual questions, respond warmly and succinctly."
        )

        context_lines = []
        if scene_summary:
            context_lines.append(f"Observed Objects in Scene: {scene_summary}")
        if hazards_summary:
            context_lines.append(f"Active Tracked Hazards: {hazards_summary}")
        if audio_summary:
            context_lines.append(f"Detected Environmental Sounds: {audio_summary}")
        if ocr_text:
            context_lines.append(f"Detected Text/Signs: {ocr_text}")
        context_str = "\n".join(context_lines) if context_lines else "No immediate hazards detected; corridor is clear."

        user_content = f"User asked: {query}\n\nReal-Time Environmental Context:\n{context_str}"

        payload = {
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_content}]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 100,
                "temperature": 0.3,
            },
        }

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            for model in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates and "content" in candidates[0]:
                            parts = candidates[0]["content"].get("parts", [])
                            if parts and "text" in parts[0]:
                                raw_text = parts[0]["text"].strip()
                                # Clean any stray markdown formatting for pristine speech output
                                clean_text = (
                                    raw_text.replace("*", "")
                                    .replace("#", "")
                                    .replace("`", "")
                                    .replace("\n", " ")
                                    .strip()
                                )
                                logger.info("Gemini (%s) generated response: %s", model, clean_text)
                                return clean_text
                    elif resp.status_code in (404, 400):
                        logger.debug("Model %s returned HTTP %d, attempting fallback...", model, resp.status_code)
                        continue
                    else:
                        logger.warning("Gemini (%s) returned HTTP %d: %s", model, resp.status_code, resp.text)
                except Exception as ex:
                    logger.debug("Exception connecting to Gemini (%s): %s", model, ex)

        return self._generate_local_response(query, scene_summary, hazards_summary, ocr_text)

    def _generate_local_response(
        self,
        query: str,
        scene_summary: List[Dict[str, Any]],
        hazards_summary: List[Dict[str, Any]],
        ocr_text: Optional[str],
        audio_summary: Optional[str] = None,
    ) -> str:
        """Deterministic, reliable scene explainer."""
        q = query.lower()

        if ocr_text and any(t in q for t in ("sign", "read", "text", "say")):
            return f'The sign says "{ocr_text}".'

        if any(t in q for t in ("where am i", "describe", "surroundings", "scene", "look around", "what do you see", "what is around", "what's around")):
            desc_parts = []
            if scene_summary:
                labels = [obj.get("label", "item") for obj in scene_summary[:3]]
                desc_parts.append(f"I observe: {', '.join(labels)}")
            if audio_summary:
                desc_parts.append(f"I hear {audio_summary}")
            if desc_parts:
                return ". ".join(desc_parts) + ". Walking corridor is monitored."
            return "The area appears open and quiet with no obstacles detected."

        if any(t in q for t in ("sound", "hear", "listen", "noise", "horn", "siren")):
            if audio_summary:
                return f"I detect {audio_summary}."
            return "No warning sounds detected right now. Environment is quiet."

        if any(t in q for t in ("thank", "hello", "hi", "help")):
            return "Bro is active and monitoring your walking path."

        return f'I heard "{query}". Your walking corridor is currently monitored.'

