"""Database persistence data structures and table definitions."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class HazardEventRecord:
    id: Optional[int]
    hazard_id: str
    hazard_type: str
    label: str
    timestamp: float
    urgency: str
    confidence: float
    direction: str
    motion: str
    risk_score: float
    alerted: bool
    alert_message: Optional[str]


@dataclass
class SystemFailureRecord:
    id: Optional[int]
    component: str
    severity: str
    message: str
    timestamp: float


@dataclass
class EvaluationRunRecord:
    id: Optional[int]
    run_name: str
    precision: float
    recall: float
    f1_score: float
    false_alarm_rate: str
    avg_detection_latency_ms: float
    avg_alert_latency_ms: float
    timestamp: float

