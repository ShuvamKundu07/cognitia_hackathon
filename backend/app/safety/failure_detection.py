"""System failure detection and camera quality diagnostics."""

import logging
import time
from typing import Any, Dict, List, Optional
from app.hazards.models import SystemFailure

logger = logging.getLogger("safety.failure_detection")


class SystemFailureDetector:
    """Monitors system components, frame freshness, frame processing latencies, and quality."""

    def __init__(
        self,
        fps_warning_threshold: float = 4.0,
        frame_timeout_seconds: float = 3.0,
    ):
        self.fps_warning_threshold = fps_warning_threshold
        self.frame_timeout_seconds = frame_timeout_seconds

        self.last_frame_time: float = time.time()
        self.frame_intervals: List[float] = []
        self.active_failures: Dict[str, SystemFailure] = {}
        self.recent_failure_events: List[SystemFailure] = []

    def check_frame_quality(self, quality_info: Dict[str, Any], timestamp: float = 0.0) -> Optional[SystemFailure]:
        """Audits video frame visual metrics for camera occlusion, darkness, or extreme blur."""
        if timestamp <= 0.0:
            timestamp = time.time()

        is_degraded = quality_info.get("is_degraded", False)
        reason = quality_info.get("reason", "unknown")
        quality_label = quality_info.get("quality", "good")

        if is_degraded:
            msg = f"WARNING: Camera visibility is {quality_label} ({reason}). Hazard detection may be degraded."
            severity = "high" if "blocked" in reason or "dark" in reason else "medium"
            failure = SystemFailure(
                component="camera",
                severity=severity,
                message=msg,
                timestamp=int(timestamp * 1000),
            )
            self.active_failures["camera_quality"] = failure
            return failure
        else:
            self.active_failures.pop("camera_quality", None)
            return None

    def record_frame_arrival(self, timestamp: float = 0.0) -> Optional[SystemFailure]:
        """Tracks frame arrival intervals and flags frame drop / low FPS / camera freeze."""
        if timestamp <= 0.0:
            timestamp = time.time()

        interval = max(1e-4, timestamp - self.last_frame_time)
        self.last_frame_time = timestamp

        self.frame_intervals.append(interval)
        if len(self.frame_intervals) > 20:
            self.frame_intervals.pop(0)

        # Detect camera freeze
        if interval > self.frame_timeout_seconds:
            failure = SystemFailure(
                component="camera",
                severity="high",
                message=f"Camera stream interrupted. No frame received in {interval:.1f} seconds.",
                timestamp=int(timestamp * 1000),
            )
            self.active_failures["camera_freeze"] = failure
            return failure
        else:
            self.active_failures.pop("camera_freeze", None)

        # Detect chronically low FPS
        if len(self.frame_intervals) >= 10:
            avg_interval = sum(self.frame_intervals) / len(self.frame_intervals)
            current_fps = 1.0 / avg_interval
            if current_fps < self.fps_warning_threshold:
                failure = SystemFailure(
                    component="camera",
                    severity="medium",
                    message=f"Low video frame rate ({current_fps:.1f} FPS). Real-time tracking may lag.",
                    timestamp=int(timestamp * 1000),
                )
                self.active_failures["low_fps"] = failure
                return failure
            else:
                self.active_failures.pop("low_fps", None)

        return None

    def check_processing_backlog(self, queue_size: int, dropped_frames: int) -> Optional[SystemFailure]:
        """Flags when system is dropping frames due to processing overload."""
        if dropped_frames > 5:
            failure = SystemFailure(
                component="backend",
                severity="medium",
                message=f"Frame processing backlog: {dropped_frames} frames dropped to preserve real-time freshness.",
                timestamp=int(time.time() * 1000),
            )
            return failure
        return None

    def record_module_failure(self, component: str, error_message: str) -> SystemFailure:
        """Registers a catastrophic or unexpected failure in a subsystem."""
        failure = SystemFailure(
            component=component,
            severity="high",
            message=f"Module '{component}' error: {error_message}",
            timestamp=int(time.time() * 1000),
        )
        self.active_failures[component] = failure
        return failure

    def get_system_health(self) -> Dict[str, str]:
        """Returns health states matching frontend SystemStatus expectations."""
        cam_quality_fail = "camera_quality" in self.active_failures
        cam_freeze_fail = "camera_freeze" in self.active_failures

        camera_status = "FAILED" if cam_freeze_fail else "DEGRADED" if cam_quality_fail else "ACTIVE"
        quality_label = "poor" if cam_quality_fail else "good"

        return {
            "camera": camera_status,
            "microphone": "ACTIVE",
            "backend": "CONNECTED",
            "vision_ai": "DEGRADED" if cam_quality_fail else "ACTIVE",
            "audio_ai": "ACTIVE",
            "ocr": "READY",
            "assistant": "READY",
            "camera_quality": quality_label,
        }

