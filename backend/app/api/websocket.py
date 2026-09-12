"""WebSocket endpoint handling real-time video/audio streams, alerts, and conversation."""

import asyncio
import json
import logging
import time
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import numpy as np

from app.assistant.conversation import ConversationManager
from app.assistant.llm import LLMAssistant
from app.assistant.scene_memory import SceneMemory
from app.audio.classifier import get_audio_classifier
from app.config import AlertFrequency, SensitivityLevel, settings
from app.db.repository import HazardEventRepository
from app.fusion.sensor_fusion import SensorFusion
from app.hazards.alerts import AlertGenerator
from app.hazards.memory import HazardMemory
from app.hazards.priority import PriorityEngine
from app.hazards.risk import RiskEngine
from app.ocr.reader import OCRReader
from app.safety.controller import SafetyController
from app.safety.failure_detection import SystemFailureDetector
from app.vision.detector import get_detector
from app.vision.path import WalkingPathEstimator
from app.vision.preprocessing import FramePreprocessor
from app.vision.tracker import ObjectTracker
from app.websocket_manager import ws_manager

logger = logging.getLogger("api.websocket")
ws_router = APIRouter()


class SessionPipeline:
    """Encapsulates the stateful perception and safety engines for an active WebSocket session."""

    def __init__(self, mock_mode: bool = False):
        self.preprocessor = FramePreprocessor()
        self.detector = get_detector(mock_mode=mock_mode)
        self.tracker = ObjectTracker(
            grace_period_seconds=settings.track_grace_period,
            max_age_seconds=settings.track_max_age_seconds,
        )
        self.path_estimator = WalkingPathEstimator(
            x=settings.walking_path_x,
            y=settings.walking_path_y,
            width=settings.walking_path_width,
            height=settings.walking_path_height,
        )
        self.risk_engine = RiskEngine(sensitivity=settings.sensitivity_default)
        self.hazard_memory = HazardMemory(grace_period_seconds=settings.track_grace_period)
        self.priority_engine = PriorityEngine()
        self.alert_generator = AlertGenerator(cooldown_seconds=settings.alert_cooldown_seconds)

        from app.audio.hazard_detector import AudioHazardDetector

        self.audio_detector = AudioHazardDetector(
            model_dir=getattr(settings, "yamnet_model_dir", "models/yamnet_model"),
            sample_rate=getattr(settings, "audio_sample_rate", 16000),
        )
        self.audio_classifier = get_audio_classifier(
            mock_mode=mock_mode,
            detector=self.audio_detector,
            model_dir=getattr(settings, "yamnet_model_dir", "models/yamnet_model"),
        )
        self.sensor_fusion = SensorFusion()

        # Start live audio detector if hardware mic is enabled and not in mock mode, but keep disabled until user starts mic
        if not mock_mode and getattr(settings, "enable_hardware_mic", True):
            self.audio_detector.start()
            self.audio_detector.disable()

        self.scene_memory = SceneMemory()
        self.ocr_reader = OCRReader(confidence_threshold=settings.ocr_confidence_threshold)
        self.llm_assistant = LLMAssistant()
        self.conversation_manager = ConversationManager(
            scene_memory=self.scene_memory,
            ocr_reader=self.ocr_reader,
            llm_assistant=self.llm_assistant,
        )
        self.safety_controller = SafetyController(conversation_manager=self.conversation_manager)
        self.failure_detector = SystemFailureDetector()
        self.repository = HazardEventRepository()

        self.latest_frame: Optional[np.ndarray] = None
        self.dropped_frame_count: int = 0
        self.active_hazards = []

    def stop(self) -> None:
        """Stops active background audio streams and resources."""
        if hasattr(self, "audio_detector") and self.audio_detector:
            self.audio_detector.stop()


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Primary persistent bi-directional WebSocket interface for real-time safety alerting."""
    await ws_manager.connect(websocket)

    pipeline = SessionPipeline(mock_mode=settings.mock_mode)

    # Emit initial system status on connect
    initial_health = pipeline.failure_detector.get_system_health()
    await ws_manager.send_json(websocket, {
        "type": "system_status",
        **initial_health,
        "timestamp": int(time.time() * 1000),
    })

    # Freshness Queue: size 1 ensures backlogged frames are dropped for sub-100ms latency
    frame_queue: asyncio.Queue = asyncio.Queue(maxsize=1)

    async def frame_worker():
        """Asynchronous worker processing newest frames without blocking WebSocket receive loop."""
        last_audio_broadcast = 0.0
        while True:
            try:
                frame_data, client_ts = await frame_queue.get()
                now_ts = time.time()

                # Process visual frame
                decoded = pipeline.preprocessor.decode_frame(frame_data)
                if decoded is None:
                    continue

                norm_frame = pipeline.preprocessor.normalize_resolution(decoded)
                pipeline.latest_frame = norm_frame

                # Quality audit
                quality = pipeline.preprocessor.assess_quality(norm_frame)
                quality_fail = pipeline.failure_detector.check_frame_quality(quality, timestamp=now_ts)
                if quality_fail:
                    await ws_manager.send_json(websocket, {
                        "type": "system_failure",
                        "component": quality_fail.component,
                        "severity": quality_fail.severity,
                        "message": quality_fail.message,
                        "timestamp": quality_fail.timestamp,
                    })

                # Object Detection
                raw_detections = pipeline.detector.detect(norm_frame, timestamp=now_ts)

                # Temporal Tracking
                tracked = pipeline.tracker.update(raw_detections, timestamp=now_ts)

                # Path Collision & Risk Scoring
                for th in tracked:
                    th.path_intersection_score = pipeline.path_estimator.calculate_intersection_score(th.latest_bbox)
                    pipeline.risk_engine.evaluate_hazard(th, audio_confirmed=False)

                # Multi-modal Sensor Fusion: Incorporate active audio hazard from live mic/stream
                live_audio_event = pipeline.audio_detector.to_audio_event(timestamp=now_ts)
                if live_audio_event:
                    pipeline.sensor_fusion.register_audio_event(live_audio_event, timestamp=now_ts)

                fused_hazards = pipeline.sensor_fusion.fuse(tracked, timestamp=now_ts)

                # Update Scene Memory
                pipeline.scene_memory.update_from_hazards(fused_hazards, timestamp=now_ts)

                # Hazard Memory & Resolution Lifecycle
                active_hazards, resolved_ids = pipeline.hazard_memory.update(fused_hazards, timestamp=now_ts)
                pipeline.active_hazards = active_hazards

                # Emit Hazard Resolutions
                for r_id in resolved_ids:
                    await ws_manager.send_json(websocket, {
                        "type": "hazard_resolved",
                        "hazard_id": r_id,
                        "timestamp": int(now_ts * 1000),
                    })

                # Priority Queue Ranking
                sorted_hazards = pipeline.priority_engine.sort_hazards(active_hazards)

                # Emit Visual Detections & Walking Corridor
                await ws_manager.send_json(websocket, {
                    "type": "detection",
                    "objects": [h.to_frontend_object() for h in active_hazards],
                    "walking_path": pipeline.path_estimator.get_corridor_dict(),
                    "timestamp": int(now_ts * 1000),
                })

                # Alert Arbitration & Non-Repetitive Generation
                top_hazard = sorted_hazards[0] if sorted_hazards else None
                if sorted_hazards:
                    alert = pipeline.alert_generator.generate_consolidated_alert(sorted_hazards, timestamp=now_ts)
                    if alert:
                        # Safety controller enforces critical audio interruptions
                        arbitrated_alert = pipeline.safety_controller.arbitrate_alert(alert)
                        pipeline.hazard_memory.mark_alerted(alert.hazard_id, timestamp=now_ts)

                        await ws_manager.send_json(websocket, {
                            "type": "hazard_alert",
                            "hazard_id": arbitrated_alert.hazard_id,
                            "hazard_type": arbitrated_alert.hazard_type,
                            "message": arbitrated_alert.message,
                            "action": arbitrated_alert.action,
                            "direction": arbitrated_alert.direction,
                            "urgency": arbitrated_alert.urgency,
                            "confidence": arbitrated_alert.confidence,
                            "timestamp": arbitrated_alert.timestamp,
                            "interrupt": arbitrated_alert.interrupt,
                        })

                        # Persist to database audit log
                        pipeline.repository.log_hazard_event(
                            top_hazard,
                            alert_dispatched=True,
                            alert_message=arbitrated_alert.message,
                            timestamp=now_ts,
                        )

                frame_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in frame worker execution: %s", e)
                if not frame_queue.empty():
                    frame_queue.task_done()

    async def audio_worker():
        """Dedicated background task polling audio hazards and broadcasting without waiting for video frames."""
        last_broadcast_time = 0.0
        last_hazard_sig = ""
        while True:
            try:
                await asyncio.sleep(0.10)
                if not getattr(pipeline.audio_detector, "enabled", False):
                    continue
                now_ts = time.time()
                live_audio_event = pipeline.audio_detector.to_audio_event(timestamp=now_ts)
                if live_audio_event:
                    pipeline.sensor_fusion.register_audio_event(live_audio_event, timestamp=now_ts)
                    hazard_sig = f"{live_audio_event.sound}_{live_audio_event.direction}"
                    if hazard_sig != last_hazard_sig:
                        last_broadcast_time = now_ts
                        last_hazard_sig = hazard_sig
                        await ws_manager.send_json(websocket, {
                            "type": "audio_event",
                            "sound": live_audio_event.sound,
                            "direction": live_audio_event.direction,
                            "confidence": live_audio_event.confidence,
                            "timestamp": live_audio_event.timestamp,
                        })

                        # If camera is off or not producing hazards, alert pedestrian of acoustic danger
                        if pipeline.latest_frame is None or not pipeline.active_hazards:
                            acoustic_hazard = pipeline.sensor_fusion._create_acoustic_hazard(live_audio_event, timestamp=now_ts)
                            alert = pipeline.alert_generator.generate_alert(acoustic_hazard, timestamp=now_ts)
                            if alert:
                                arbitrated = pipeline.safety_controller.arbitrate_alert(alert)
                                await ws_manager.send_json(websocket, {
                                    "type": "hazard_alert",
                                    "hazard_id": arbitrated.hazard_id,
                                    "hazard_type": arbitrated.hazard_type,
                                    "message": arbitrated.message,
                                    "action": arbitrated.action,
                                    "direction": arbitrated.direction,
                                    "urgency": arbitrated.urgency,
                                    "confidence": arbitrated.confidence,
                                    "timestamp": arbitrated.timestamp,
                                    "interrupt": arbitrated.interrupt,
                                })
                else:
                    last_hazard_sig = ""
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug("Audio worker exception: %s", e)

    worker_task = asyncio.create_task(frame_worker())
    audio_task = asyncio.create_task(audio_worker())

    try:
        while True:
            # Handle coexisting JSON text and binary WebSocket data
            message = await websocket.receive()
            recv_time = time.time()

            if "bytes" in message and message["bytes"]:
                # Binary frame received
                if frame_queue.full():
                    try:
                        frame_queue.get_nowait()
                        frame_queue.task_done()
                        pipeline.dropped_frame_count += 1
                    except Exception:
                        pass
                await frame_queue.put((message["bytes"], recv_time))
                continue

            if "text" not in message or not message["text"]:
                continue

            try:
                payload = json.loads(message["text"])
            except Exception:
                logger.warning("Invalid JSON received over WebSocket")
                continue

            msg_type = payload.get("type", "unknown")
            timestamp = payload.get("timestamp", int(recv_time * 1000))

            # 1. Heartbeat Ping / Pong
            if msg_type == "ping":
                await ws_manager.send_json(websocket, {
                    "type": "pong",
                    "timestamp": int(time.time() * 1000),
                })

            # 2. Video Frame
            elif msg_type == "video_frame":
                frame_b64 = payload.get("frame")
                if frame_b64:
                    pipeline.failure_detector.record_frame_arrival(recv_time)
                    # Dropping stale frames to maintain real-time freshness
                    if frame_queue.full():
                        try:
                            frame_queue.get_nowait()
                            frame_queue.task_done()
                            pipeline.dropped_frame_count += 1
                        except Exception:
                            pass
                    await frame_queue.put((frame_b64, recv_time))

            # 3. Audio Chunk
            elif msg_type == "audio_chunk":
                if not getattr(pipeline.audio_detector, "enabled", False):
                    continue
                audio_data = payload.get("data")
                if audio_data:
                    audio_event = pipeline.audio_classifier.classify(audio_data, timestamp=recv_time)
                    if audio_event and "engine" not in audio_event.sound.lower():
                        pipeline.sensor_fusion.register_audio_event(audio_event, timestamp=recv_time)
                        chunk_sig = f"{audio_event.sound}_{audio_event.direction}"
                        last_chunk_sig = getattr(pipeline, "_last_chunk_sig", "")
                        last_chunk_time = getattr(pipeline, "_last_chunk_time", 0.0)
                        if chunk_sig != last_chunk_sig or (recv_time - last_chunk_time > 6.0):
                            pipeline._last_chunk_sig = chunk_sig
                            pipeline._last_chunk_time = recv_time
                            await ws_manager.send_json(websocket, {
                                "type": "audio_event",
                                "sound": audio_event.sound,
                                "direction": audio_event.direction,
                                "confidence": audio_event.confidence,
                                "timestamp": audio_event.timestamp,
                            })

            # 3b. Test Acoustic Hazard Trigger
            elif msg_type == "test_audio_event":
                sound = payload.get("sound", "Vehicle Horn")
                direction = payload.get("direction", "Right")
                conf = float(payload.get("confidence", 0.95))
                pipeline.audio_detector.trigger_test_hazard(sound=sound, direction=direction, confidence=conf)
                evt = pipeline.audio_detector.to_audio_event(timestamp=recv_time)
                if evt and "engine" not in evt.sound.lower():
                    pipeline.sensor_fusion.register_audio_event(evt, timestamp=recv_time)
                    await ws_manager.send_json(websocket, {
                        "type": "audio_event",
                        "sound": evt.sound,
                        "direction": evt.direction,
                        "confidence": evt.confidence,
                        "timestamp": evt.timestamp,
                    })

            # 3c. Audio Hardware / Sensor Control (Start / Stop on user mic button click)
            elif msg_type == "audio_control":
                action = payload.get("action", "start")
                if action == "start":
                    pipeline.audio_detector.enable()
                    logger.info("[WEBSOCKET] Audio hazard detector ENABLED by client microphone button")
                elif action == "stop":
                    pipeline.audio_detector.disable()
                    logger.info("[WEBSOCKET] Audio hazard detector DISABLED by client microphone button")

            # 3d. Client Settings & Configuration Update
            elif msg_type == "settings_update":
                client_settings = payload.get("settings", {})
                logger.info("[WEBSOCKET] Received client settings update: %s", list(client_settings.keys()))

            # 4. Wake-word Activation ("Hey Bro")
            elif msg_type == "wake_word":
                reply_text = pipeline.conversation_manager.handle_wake_word()
                await ws_manager.send_json(websocket, {
                    "type": "conversation_status",
                    "state": "ACTIVATING",
                    "timestamp": int(time.time() * 1000),
                })
                await ws_manager.send_json(websocket, {
                    "type": "assistant_response",
                    "text": reply_text,
                    "status": "wake_word_ack",
                    "timestamp": int(time.time() * 1000),
                })

            # 5. Conversational Assistant & Voice Inquiries
            elif msg_type in ("conversation", "ocr_request"):
                query_text = payload.get("text") or payload.get("query") or ""
                await ws_manager.send_json(websocket, {
                    "type": "conversation_status",
                    "state": "PROCESSING",
                    "timestamp": int(time.time() * 1000),
                })

                reply_text, ocr_res = await pipeline.conversation_manager.handle_query(
                    query=query_text,
                    current_frame=pipeline.latest_frame,
                    active_hazards=pipeline.active_hazards,
                )

                if ocr_res:
                    await ws_manager.send_json(websocket, {
                        "type": "ocr_result",
                        "text": ocr_res.text,
                        "confidence": ocr_res.confidence,
                        "object_id": ocr_res.object_id,
                        "timestamp": ocr_res.timestamp,
                    })

                is_exit = (pipeline.conversation_manager.last_intent == "TERMINATION")
                await ws_manager.send_json(websocket, {
                    "type": "assistant_response",
                    "text": reply_text,
                    "status": "completed",
                    "is_exit": is_exit,
                    "timestamp": int(time.time() * 1000),
                })

                await ws_manager.send_json(websocket, {
                    "type": "conversation_status",
                    "state": "IDLE" if is_exit else "SPEAKING",
                    "timestamp": int(time.time() * 1000),
                })

            # 6. Client-Side Assistant State Sync
            elif msg_type == "conversation_status_update":
                new_state = payload.get("state")
                if new_state:
                    pipeline.conversation_manager.state = new_state

            # 5. Dynamic Settings Update
            elif msg_type == "settings_update":
                new_settings = payload.get("settings", {})
                if "sensitivity" in new_settings:
                    pipeline.risk_engine.set_sensitivity(new_settings["sensitivity"])
                if "alert_frequency" in new_settings:
                    cooldown_ms = settings.get_alert_cooldown_ms(new_settings["alert_frequency"])
                    pipeline.alert_generator.set_cooldown(cooldown_ms / 1000.0)

                # Dynamic Gemini API Key configuration from frontend settings
                gemini_key = new_settings.get("gemini_api_key") or new_settings.get("llm_api_key")
                if gemini_key:
                    pipeline.conversation_manager.llm.api_key = gemini_key.strip()
                    pipeline.conversation_manager.llm.provider = "gemini"
                    logger.info("Updated Gemini API Key for conversational assistant from client settings")

                logger.info("Updated pipeline safety settings: %s", {k: v for k, v in new_settings.items() if "key" not in k.lower()})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected gracefully")
    except Exception as e:
        logger.error("WebSocket runtime exception: %s", e)
    finally:
        pipeline.stop()
        worker_task.cancel()
        audio_task.cancel()
        await ws_manager.disconnect(websocket)

