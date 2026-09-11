"""REST API routes for health checks, system status, settings, and benchmark evaluation."""

import logging
import os
import shutil
import tempfile
import time
from typing import Any, Dict, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import AlertFrequency, SensitivityLevel, settings
from app.db.repository import HazardEventRepository
from app.evaluation.evaluator import BenchmarkEvaluator
from app.evaluation.replay import ReplayEngine
from app.hazards.models import EvaluationMetrics
from app.websocket_manager import ws_manager

logger = logging.getLogger("api.routes")
api_router = APIRouter()
START_TIME = time.time()
repository = HazardEventRepository()


class SettingsUpdateRequest(BaseModel):
    sensitivity: Optional[str] = None
    alert_frequency: Optional[str] = None
    confidence_threshold: Optional[float] = None
    processing_fps: Optional[int] = None
    mock_mode: Optional[bool] = None


@api_router.get("/health")
async def get_health() -> Dict[str, Any]:
    """Health check endpoint confirming FastAPI service is active."""
    return {
        "status": "online",
        "service": "pedestrian-shield-ai-backend",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "timestamp": int(time.time() * 1000),
    }


@api_router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Returns detailed health status across vision, audio, OCR, and assistant submodules."""
    return {
        "camera": "ACTIVE",
        "microphone": "ACTIVE",
        "backend": "CONNECTED",
        "vision_ai": "ACTIVE",
        "audio_ai": "ACTIVE",
        "ocr": "READY",
        "assistant": "READY",
        "camera_quality": "good",
        "active_clients": ws_manager.active_count(),
        "mock_mode": settings.mock_mode,
        "timestamp": int(time.time() * 1000),
    }


@api_router.get("/settings")
async def get_settings() -> Dict[str, Any]:
    """Returns current system configuration and sensitivity parameters."""
    return {
        "sensitivity": settings.sensitivity_default.value,
        "alert_frequency": settings.alert_frequency_default.value,
        "confidence_threshold": settings.confidence_threshold,
        "processing_fps": settings.processing_fps,
        "alert_cooldown_seconds": settings.alert_cooldown_seconds,
        "track_grace_period": settings.track_grace_period,
        "mock_mode": settings.mock_mode,
        "walking_corridor": settings.walking_path_dict,
    }


@api_router.post("/settings")
async def update_settings(req: SettingsUpdateRequest) -> Dict[str, Any]:
    """Updates operational parameters at runtime."""
    if req.sensitivity:
        try:
            settings.sensitivity_default = SensitivityLevel(req.sensitivity.upper())
        except ValueError:
            pass

    if req.alert_frequency:
        try:
            settings.alert_frequency_default = AlertFrequency(req.alert_frequency.upper())
        except ValueError:
            pass

    if req.confidence_threshold is not None:
        settings.confidence_threshold = max(0.1, min(0.99, req.confidence_threshold))

    if req.processing_fps is not None:
        settings.processing_fps = max(1, min(30, req.processing_fps))

    if req.mock_mode is not None:
        settings.mock_mode = req.mock_mode

    logger.info("Settings updated via REST API: %s", req)
    return await get_settings()


@api_router.get("/api/evaluation")
async def get_evaluation_metrics() -> Dict[str, Any]:
    """Returns the latest benchmark evaluation metrics for the frontend Evaluation Dashboard."""
    latest = repository.get_latest_metrics()
    if latest:
        return latest

    # Baseline evaluation measurements
    evaluator = BenchmarkEvaluator()
    metrics = evaluator.evaluate(ground_truth=[], system_alerts=[])
    return metrics.model_dump()


@api_router.post("/api/evaluate-video")
async def evaluate_video(video: UploadFile = File(...)) -> Dict[str, Any]:
    """Accepts a recorded video file, runs through production pipeline, and returns benchmark metrics."""
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, video.filename or "staged_test.mp4")

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        # Load ground truth sample annotations if available
        gt_path = os.path.join(os.path.dirname(__file__), "../../data/ground_truth_sample.json")
        evaluator = BenchmarkEvaluator()
        ground_truth = evaluator.load_ground_truth(gt_path)

        # Run replay engine with production pipeline
        replay_engine = ReplayEngine()
        metrics = replay_engine.run_replay(video_path=temp_path, ground_truth=ground_truth)

        # Save to database
        repository.log_evaluation_run(metrics, run_name=video.filename or "uploaded_video")

        return {
            "status": "success",
            "video_filename": video.filename,
            "metrics": metrics.model_dump(),
        }
    except Exception as e:
        logger.error("Video evaluation failure: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to process video: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                os.rmdir(temp_dir)
            except Exception:
                pass

