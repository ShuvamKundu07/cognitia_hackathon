"""Replay engine processing recorded video footage through the identical production AI pipeline."""

import logging
import time
from typing import Any, Callable, Dict, List, Optional
import cv2
import numpy as np

from app.evaluation.evaluator import BenchmarkEvaluator, GroundTruthAnnotation
from app.evaluation.metrics import SystemAlertRecord
from app.hazards.alerts import AlertGenerator
from app.hazards.memory import HazardMemory
from app.hazards.models import EvaluationMetrics, HazardAlert, TrackedHazard
from app.hazards.priority import PriorityEngine
from app.hazards.risk import RiskEngine
from app.vision.detector import BaseObjectDetector, get_detector
from app.vision.path import WalkingPathEstimator
from app.vision.preprocessing import FramePreprocessor
from app.vision.tracker import ObjectTracker

logger = logging.getLogger("evaluation.replay")


class ReplayEngine:
    """Executes staged or recorded video files through the production perception pipeline."""

    def __init__(
        self,
        detector: Optional[BaseObjectDetector] = None,
        tracker: Optional[ObjectTracker] = None,
        risk_engine: Optional[RiskEngine] = None,
        alert_generator: Optional[AlertGenerator] = None,
    ):
        # Uses EXACT same production components
        self.preprocessor = FramePreprocessor()
        self.detector = detector or get_detector()
        self.tracker = tracker or ObjectTracker()
        self.path_estimator = WalkingPathEstimator()
        self.risk_engine = risk_engine or RiskEngine()
        self.memory = HazardMemory()
        self.priority_engine = PriorityEngine()
        self.alert_generator = alert_generator or AlertGenerator(cooldown_seconds=4.0)
        self.evaluator = BenchmarkEvaluator()

    def run_replay(
        self,
        video_path: str,
        ground_truth: Optional[List[GroundTruthAnnotation]] = None,
        on_frame_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> EvaluationMetrics:
        """Processes a recorded video file and evaluates pipeline accuracy."""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Could not open video file for replay: %s", video_path)
            return EvaluationMetrics()

        fps = cap.get(cv2.CAP_PROP_FPS) or 10.0
        frame_delay = 1.0 / max(1.0, fps)
        frame_idx = 0

        recorded_alerts: List[SystemAlertRecord] = []
        start_wall_time = time.time()
        start_sim_time = 0.0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            sim_time = frame_idx * frame_delay
            t_det_start = time.time()

            # 1. Preprocess & Normalize
            norm_frame = self.preprocessor.normalize_resolution(frame)

            # 2. Object Detection
            raw_detections = self.detector.detect(norm_frame, timestamp=sim_time)
            det_latency_ms = (time.time() - t_det_start) * 1000.0

            # 3. Object Tracking
            tracked = self.tracker.update(raw_detections, timestamp=sim_time)

            # 4. Walking Path & Risk Scoring
            for th in tracked:
                th.path_intersection_score = self.path_estimator.calculate_intersection_score(th.latest_bbox)
                self.risk_engine.evaluate_hazard(th, audio_confirmed=False)

            # 5. Temporal Hazard Memory
            active_hazards, _ = self.memory.update(tracked, timestamp=sim_time)

            # 6. Priority Engine
            sorted_hazards = self.priority_engine.sort_hazards(active_hazards)
            top_hazard = sorted_hazards[0] if sorted_hazards else None

            # 7. Alert Generation
            alert = None
            if top_hazard:
                alert = self.alert_generator.generate_alert(top_hazard, timestamp=sim_time)
                if alert:
                    tot_latency_ms = det_latency_ms + 120.0
                    recorded_alerts.append(
                        SystemAlertRecord(
                            hazard_id=alert.hazard_id,
                            hazard_type=alert.hazard_type,
                            urgency=alert.urgency,
                            direction=alert.direction,
                            timestamp=sim_time,
                            detection_latency_ms=det_latency_ms,
                            alert_latency_ms=tot_latency_ms,
                        )
                    )

            if on_frame_callback:
                on_frame_callback({
                    "frame_idx": frame_idx,
                    "sim_time": sim_time,
                    "active_objects": [h.to_frontend_object() for h in active_hazards],
                    "top_alert": alert.model_dump() if alert else None,
                })

            frame_idx += 1

        cap.release()
        total_duration_minutes = (frame_idx * frame_delay) / 60.0

        # Compute benchmark evaluation against ground truth
        metrics = self.evaluator.evaluate(
            ground_truth=ground_truth or [],
            system_alerts=recorded_alerts,
            total_duration_minutes=max(0.1, total_duration_minutes),
        )
        return metrics

