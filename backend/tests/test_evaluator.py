"""Unit tests for evaluation metrics calculations and ground truth benchmark scoring."""

import pytest
from app.evaluation.evaluator import BenchmarkEvaluator, GroundTruthAnnotation
from app.evaluation.metrics import SystemAlertRecord, compute_metrics


def test_metrics_calculation_formula():
    # TP = 90, FP = 10 -> Precision = 90/100 = 0.90
    # TP = 90, FN = 10 -> Recall = 90/100 = 0.90
    # F1 = 2 * 0.9 * 0.9 / 1.8 = 0.90
    metrics = compute_metrics(
        tp=90,
        fp=10,
        fn=10,
        total_duration_minutes=2.0,
        duplicate_count=2,
        total_alerts=100,
        detection_latencies=[250.0, 270.0],
        alert_latencies=[400.0, 420.0],
    )

    assert metrics.precision == 0.90
    assert metrics.recall == 0.90
    assert metrics.f1_score == 0.90
    assert "5.0" in metrics.false_alarm_rate  # 10 FP / 2 min = 5.0 / min
    assert metrics.duplicate_alert_rate == "2.0%"


def test_benchmark_evaluator_matching():
    evaluator = BenchmarkEvaluator(temporal_tolerance_seconds=1.5)

    gt = [
        GroundTruthAnnotation(
            hazard_type="vehicle",
            start_time=10.0,
            end_time=14.0,
            direction="right",
            urgency="critical",
        ),
        GroundTruthAnnotation(
            hazard_type="surface",
            start_time=20.0,
            end_time=25.0,
            direction="ahead",
            urgency="high",
        ),
    ]

    alerts = [
        # True positive match for vehicle at t=10.5s
        SystemAlertRecord(
            hazard_id="car_1",
            hazard_type="vehicle",
            urgency="CRITICAL",
            direction="Right",
            timestamp=10.5,
            detection_latency_ms=250.0,
            alert_latency_ms=400.0,
        ),
        # False alarm at t=35.0s (no ground truth)
        SystemAlertRecord(
            hazard_id="ghost_1",
            hazard_type="obstacle",
            urgency="LOW",
            direction="Left",
            timestamp=35.0,
            detection_latency_ms=200.0,
            alert_latency_ms=350.0,
        ),
    ]

    metrics = evaluator.evaluate(
        ground_truth=gt,
        system_alerts=alerts,
        total_duration_minutes=1.0,
    )

    # 1 TP (vehicle), 1 FP (ghost), 1 FN (surface obstacle missed)
    assert metrics.precision == 0.50
    assert metrics.recall == 0.50
    assert metrics.f1_score == 0.50

