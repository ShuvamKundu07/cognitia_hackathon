"""Configuration module for Pedestrian Shield AI Backend.

Uses pydantic-settings to manage environment variables, defaults,
sensitivity levels, and system thresholds.
"""

from enum import Enum
from pathlib import Path
from typing import Any, Dict
from pydantic_settings import BaseSettings, SettingsConfigDict


class SensitivityLevel(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class AlertFrequency(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class Settings(BaseSettings):
    # Server network settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    allowed_origins: str = "*"

    # Operational mode
    mock_mode: bool = False

    # Vision & Object Detection
    model_path: str = "models/yolov8n.pt"
    custom_hazard_model_path: str = "models/best.pt"
    confidence_threshold: float = 0.35
    custom_hazard_confidence_threshold: float = 0.30
    enable_heuristic_pavement_detector: bool = False
    processing_fps: int = 10
    frame_queue_maxsize: int = 1
    stale_frame_drop_ms: int = 250

    # Walking Corridor (normalized image coordinates)
    walking_path_x: float = 0.30
    walking_path_y: float = 0.45
    walking_path_width: float = 0.40
    walking_path_height: float = 0.55

    # Object Tracking & Persistence
    track_grace_period: float = 1.5
    track_max_age_seconds: float = 3.0
    track_iou_threshold: float = 0.30

    # Risk & Alert Generation
    alert_cooldown_seconds: float = 8.0
    alert_frequency_default: AlertFrequency = AlertFrequency.NORMAL
    sensitivity_default: SensitivityLevel = SensitivityLevel.NORMAL

    # Audio Engine
    audio_sample_rate: int = 16000
    audio_confidence_threshold: float = 0.75
    audio_energy_threshold: float = 0.015
    yamnet_model_dir: str = "models/yamnet_model"
    enable_hardware_mic: bool = True

    # OCR Engine
    ocr_engine: str = "paddleocr"
    ocr_confidence_threshold: float = 0.60

    # Conversational Assistant (Bro)
    gene_name: str = "Bro"
    gene_wake_word: str = "hey bro"
    gene_timeout_seconds: int = 10
    llm_provider: str = "gemini"
    llm_api_key: str = ""
    gemini_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"

    # Persistence
    database_url: str = "sqlite:///./data/pedestrian_safety.db"

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def get_sensitivity_multiplier(self, level: SensitivityLevel | str) -> float:
        """Returns risk score multiplier based on sensitivity setting."""
        lvl = str(level).upper()
        if lvl == SensitivityLevel.HIGH.value:
            return 1.25
        elif lvl == SensitivityLevel.LOW.value:
            return 0.80
        return 1.00

    def get_alert_cooldown_ms(self, frequency: AlertFrequency | str) -> int:
        """Returns alert cooldown in milliseconds based on frequency setting."""
        freq = str(frequency).upper()
        if freq == AlertFrequency.HIGH.value:
            return 4000
        elif freq == AlertFrequency.LOW.value:
            return 12000
        return int(self.alert_cooldown_seconds * 1000)

    @property
    def walking_path_dict(self) -> Dict[str, float]:
        """Returns walking path corridor as dictionary."""
        return {
            "x": self.walking_path_x,
            "y": self.walking_path_y,
            "width": self.walking_path_width,
            "height": self.walking_path_height,
        }


settings = Settings()

