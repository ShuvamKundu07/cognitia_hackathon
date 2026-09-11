"""SQLite repository for audit logging and performance evaluation metrics persistence."""

import logging
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional

from app.config import settings
from app.hazards.models import EvaluationMetrics, TrackedHazard

logger = logging.getLogger("db.repository")


class HazardEventRepository:
    """Persistence repository designed for easy migration to PostgreSQL or MongoDB."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Parse sqlite:///./data/pedestrian_safety.db
            raw_url = settings.database_url
            if raw_url.startswith("sqlite:///"):
                db_path = raw_url.replace("sqlite:///", "")
            else:
                db_path = "./data/pedestrian_safety.db"

        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Initializes database tables."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Hazard events table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS hazard_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    hazard_id TEXT NOT NULL,
                    hazard_type TEXT NOT NULL,
                    label TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    urgency TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    direction TEXT NOT NULL,
                    motion TEXT NOT NULL,
                    risk_score REAL NOT NULL,
                    alerted INTEGER NOT NULL,
                    alert_message TEXT
                )
            """)

            # System failures table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_failures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    component TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    message TEXT NOT NULL,
                    timestamp REAL NOT NULL
                )
            """)

            # Evaluation metrics history
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_name TEXT NOT NULL,
                    precision REAL NOT NULL,
                    recall REAL NOT NULL,
                    f1_score REAL NOT NULL,
                    false_alarm_rate TEXT NOT NULL,
                    avg_detection_latency_ms REAL NOT NULL,
                    avg_alert_latency_ms REAL NOT NULL,
                    timestamp REAL NOT NULL
                )
            """)
            conn.commit()

    def log_hazard_event(
        self,
        hazard: TrackedHazard,
        alert_dispatched: bool = False,
        alert_message: Optional[str] = None,
        timestamp: float = 0.0,
    ) -> None:
        if timestamp <= 0.0:
            timestamp = time.time()
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO hazard_events (
                        hazard_id, hazard_type, label, timestamp, urgency,
                        confidence, direction, motion, risk_score, alerted, alert_message
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        hazard.hazard_id,
                        hazard.hazard_type,
                        hazard.label,
                        timestamp,
                        hazard.urgency.value,
                        hazard.confidence,
                        hazard.direction.value,
                        hazard.motion.value,
                        hazard.risk_score,
                        1 if alert_dispatched else 0,
                        alert_message,
                    ),
                )
                conn.commit()
        except Exception as e:
            logger.error("Failed to log hazard event: %s", e)

    def log_system_failure(
        self,
        component: str,
        severity: str,
        message: str,
        timestamp: float = 0.0,
    ) -> None:
        if timestamp <= 0.0:
            timestamp = time.time()
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO system_failures (component, severity, message, timestamp)
                    VALUES (?, ?, ?, ?)
                    """,
                    (component, severity, message, timestamp),
                )
                conn.commit()
        except Exception as e:
            logger.error("Failed to log system failure: %s", e)

    def log_evaluation_run(self, metrics: EvaluationMetrics, run_name: str = "staged_run") -> None:
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO evaluation_runs (
                        run_name, precision, recall, f1_score, false_alarm_rate,
                        avg_detection_latency_ms, avg_alert_latency_ms, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_name,
                        metrics.precision,
                        metrics.recall,
                        metrics.f1_score,
                        metrics.false_alarm_rate,
                        metrics.avg_detection_latency_ms,
                        metrics.avg_alert_latency_ms,
                        time.time(),
                    ),
                )
                conn.commit()
        except Exception as e:
            logger.error("Failed to log evaluation run: %s", e)

    def get_recent_hazards(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM hazard_events ORDER BY id DESC LIMIT ?", (limit,)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error("Failed to query hazard events: %s", e)
            return []

    def get_latest_metrics(self) -> Optional[Dict[str, Any]]:
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM evaluation_runs ORDER BY id DESC LIMIT 1"
                )
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error("Failed to query evaluation metrics: %s", e)
            return None

