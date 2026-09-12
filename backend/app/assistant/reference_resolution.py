"""Deterministic reference resolution engine for conversational pedestrian queries."""

import logging
from typing import Any, Dict, List, Optional
from app.assistant.scene_memory import SceneMemory, SceneObjectRecord
from app.hazards.models import MotionType, TrackedHazard, UrgencyLevel

logger = logging.getLogger("assistant.reference_resolution")


class ReferenceResolver:
    """Resolves conversational references (e.g. 'that sign', 'safe to cross', 'in front of me') deterministically."""

    def resolve_reference(
        self,
        query: str,
        scene_memory: SceneMemory,
        active_hazards: List[TrackedHazard],
        last_target_id: Optional[str] = None,
        dialogue_history: Optional[List[Dict[str, Any]]] = None,
        audio_event: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Resolves natural language spatial references to physical scene entities."""
        q = (query or "").strip().lower()

        # 1. Termination / Exit Phrases
        if any(term in q for term in ("thank you", "thanks", "that's all", "thats all", "stop", "bye", "goodbye", "i'm good", "im good", "no thank")):
            return {
                "intent": "TERMINATION",
                "resolved": True,
                "target_object_id": None,
                "response": "You're welcome. I'll keep monitoring your surroundings.",
            }

        # 2. Pronoun / Follow-up Reference Resolution ("Where is it?", "Where did it go?")
        if any(term in q for term in ("where is it", "where is that", "where did it go", "which direction", "where was it", "where's it", "where is the car", "where is the vehicle")):
            target_id = last_target_id
            if not target_id and dialogue_history:
                for entry in reversed(dialogue_history):
                    if entry.get("target_object_id"):
                        target_id = entry["target_object_id"]
                        break

            if target_id:
                matching = [h for h in active_hazards if h.hazard_id == target_id]
                if matching:
                    m = matching[0]
                    motion_desc = (
                        "approaching" if m.motion == MotionType.APPROACHING
                        else "moving away" if m.motion == MotionType.MOVING_AWAY
                        else "stationary"
                    )
                    return {
                        "intent": "LOCATE_OBJECT",
                        "resolved": True,
                        "target_object_id": target_id,
                        "response": f"It is on your {m.direction.value}, and currently {motion_desc}.",
                    }

                rec = scene_memory.get_object(target_id) if hasattr(scene_memory, "get_object") else None
                if rec:
                    return {
                        "intent": "LOCATE_OBJECT",
                        "resolved": True,
                        "target_object_id": target_id,
                        "response": f"It was last seen on your {rec.direction.value}.",
                    }

            return {
                "intent": "LOCATE_OBJECT",
                "resolved": True,
                "target_object_id": None,
                "response": "It is no longer in your immediate field of view.",
            }

        # 3. Sign / Street Text Reading Queries
        if any(term in q for term in ("sign", "read", "say", "text", "billboard", "words")):
            sign = scene_memory.find_most_recent_sign()
            if sign:
                return {
                    "intent": "READ_SIGN",
                    "resolved": True,
                    "target_object_id": sign.object_id,
                    "bbox": sign.bbox,
                    "direction": sign.direction.value,
                    "details": f"Resolved to {sign.object_id} on your {sign.direction.value}.",
                }
            return {
                "intent": "READ_SIGN",
                "resolved": False,
                "target_object_id": None,
                "bbox": None,
                "direction": "ahead",
                "details": "No visible signs currently recorded in recent scene memory.",
            }

        # 4. Crossing Safety Inquiries
        if any(term in q for term in ("cross", "safe", "intersection", "walk now")):
            # Check for critical or high vehicle hazards
            approaching_vehicles = [
                h for h in active_hazards
                if h.hazard_type in ("vehicle", "bus", "truck", "motorcycle")
                and (h.urgency in (UrgencyLevel.CRITICAL, UrgencyLevel.HIGH) or h.motion == MotionType.APPROACHING)
            ]

            if approaching_vehicles:
                v = approaching_vehicles[0]
                dir_txt = v.direction.value
                return {
                    "intent": "CHECK_CROSSING",
                    "resolved": True,
                    "target_object_id": v.hazard_id,
                    "is_safe": False,
                    "response": f"Do not cross yet. A vehicle is approaching from your {dir_txt}.",
                }

            # Check if surface defects or obstacles are in walking corridor
            in_path = [h for h in active_hazards if h.path_intersection_score > 0.40]
            if in_path:
                obs = in_path[0]
                return {
                    "intent": "CHECK_CROSSING",
                    "resolved": True,
                    "target_object_id": obs.hazard_id,
                    "is_safe": False,
                    "response": f"Caution ahead. Obstacle detected directly in your walking path: {obs.label}.",
                }

            return {
                "intent": "CHECK_CROSSING",
                "resolved": True,
                "target_object_id": None,
                "is_safe": True,
                "response": "No approaching vehicles detected in your immediate corridor. Continue with caution.",
            }

        # 5. In front / Path and Ground Obstacle Queries ("Is there anything in front of me?")
        if any(term in q for term in ("front", "in front", "ahead", "ground", "path", "pothole", "curb", "stairs", "what is ahead", "anything in front", "anything ahead")):
            in_front_hazards = [
                h for h in active_hazards
                if h.path_intersection_score > 0.20 or h.direction.value in ("ahead", "center")
            ]
            if in_front_hazards:
                top_h = max(in_front_hazards, key=lambda x: x.risk_score)
                motion_desc = (
                    " approaching" if top_h.motion == MotionType.APPROACHING
                    else ""
                )
                return {
                    "intent": "QUERY_PATH",
                    "resolved": True,
                    "target_object_id": top_h.hazard_id,
                    "response": f"There is a {top_h.label}{motion_desc} directly in front of you.",
                }
            return {
                "intent": "QUERY_PATH",
                "resolved": True,
                "target_object_id": None,
                "response": "There is nothing directly in front of you. Your walking path is clear.",
            }

        # 6. Vehicle Action Queries ("What is that car doing?")
        if any(term in q for term in ("car", "vehicle", "truck", "bus", "doing", "speed")):
            vehicles = [
                h for h in active_hazards
                if h.hazard_type in ("vehicle", "bus", "truck", "motorcycle")
            ]
            if vehicles:
                v = max(vehicles, key=lambda x: x.risk_score)
                motion_desc = (
                    "approaching rapidly" if v.motion == MotionType.APPROACHING and v.relative_speed > 0.5
                    else "approaching" if v.motion == MotionType.APPROACHING
                    else "moving away" if v.motion == MotionType.MOVING_AWAY
                    else "stationary"
                )
                return {
                    "intent": "QUERY_VEHICLE",
                    "resolved": True,
                    "target_object_id": v.hazard_id,
                    "response": f"The vehicle on your {v.direction.value} is {motion_desc}.",
                }

        # 7. Acoustic / Audio Inquiries ("Do you hear anything?", "What was that sound?", "Any siren or horn?")
        if any(term in q for term in ("hear", "sound", "noise", "horn", "siren", "listen")):
            if audio_event and hasattr(audio_event, "sound"):
                sound_name = getattr(audio_event, "sound", "acoustic hazard")
                sound_dir = getattr(audio_event, "direction", "center")
                return {
                    "intent": "QUERY_AUDIO",
                    "resolved": True,
                    "target_object_id": None,
                    "response": f"I hear {sound_name} on your {sound_dir}.",
                }
            return {
                "intent": "QUERY_AUDIO",
                "resolved": True,
                "target_object_id": None,
                "response": "No warning sounds detected right now. Environment is quiet.",
            }

        # 8. Surroundings / Environment Inspection ("Describe surroundings", "What's around me?", "What do you see?")
        if any(term in q for term in ("surroundings", "around me", "what is around", "what's around", "what do you see", "look around", "inspect surroundings", "environment", "where am i")):
            parts = []
            if active_hazards:
                hazard_descs = [f"{h.label} on your {h.direction.value}" for h in active_hazards[:3]]
                parts.append(f"I observe {', '.join(hazard_descs)}")
            elif scene_memory:
                recent = scene_memory.get_recent_objects_summary()
                if recent:
                    labels = [o.get("label", "item") for o in recent[:3]]
                    parts.append(f"I observe {', '.join(labels)}")
            if audio_event and hasattr(audio_event, "sound"):
                sound_name = getattr(audio_event, "sound", "")
                sound_dir = getattr(audio_event, "direction", "")
                if sound_name:
                    parts.append(f"I hear {sound_name} on your {sound_dir}")

            if parts:
                return {
                    "intent": "QUERY_SURROUNDINGS",
                    "resolved": True,
                    "target_object_id": None,
                    "response": ". ".join(parts) + ". Walking corridor is monitored.",
                }
            return {
                "intent": "QUERY_SURROUNDINGS",
                "resolved": True,
                "target_object_id": None,
                "response": "Your surroundings appear clear and quiet. Walking corridor is monitored.",
            }

        # 9. General Query (Fallback to LLM)
        return {
            "intent": "GENERAL_CONVERSATION",
            "resolved": False,
            "target_object_id": None,
            "response": None,
        }

