import os
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = os.path.dirname(_backend_dir)
_env_file = os.path.join(_project_root, ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    DEMO_MODE: bool = False
    SECRET_KEY: str = "dev-secret-key-change-in-production-12345"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours
    REQUIRE_TWO_PERSON_APPROVAL: bool = False  # False in dev for simplicity, True in strict production
    API_TITLE: str = "ARGUS Exam Surveillance Platform"
    API_VERSION: str = "1.0.0"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Database
    DATABASE_URL: str = "sqlite:///./data/exam_surveillance.db"
    SQLALCHEMY_ECHO: bool = False

    # Camera
    NUM_CAMERAS: int = 1
    CAMERA_FPS: int = 30
    CAMERA_RESOLUTION_WIDTH: int = 1280
    CAMERA_RESOLUTION_HEIGHT: int = 720
    CAMERA_BUFFER_SIZE: int = 15
    CAMERA_TIMEOUT_SECONDS: int = 5
    CAMERA_0_SOURCE: str = "0"

    # Model Paths
    YOLOV8_MODEL_PATH: str = os.path.join(_project_root, "models", "yolov8n.pt")
    YOLOV8_CONFIDENCE_THRESHOLD: float = 0.5
    YOLOV8_NMS_THRESHOLD: float = 0.45

    MOONDREAM_MODEL_PATH: str = os.path.join(_project_root, "models", "moondream")

    # GPU
    USE_GPU: bool = True
    GPU_DEVICE_ID: int = 0
    GPU_MEMORY_FRACTION: float = 0.7
    CUDA_VISIBLE_DEVICES: str = "0"

    # Storage
    DATA_STORAGE_PATH: str = os.path.join(_project_root, "data")
    VIDEO_STORAGE_PATH: str = os.path.join(_project_root, "data", "videos")
    CLIPS_STORAGE_PATH: str = os.path.join(_project_root, "data", "clips")
    SCREENSHOTS_STORAGE_PATH: str = os.path.join(_project_root, "data", "screenshots")

    # Logging
    LOG_LEVEL: str = "INFO"

    # Feature Flags
    ENABLE_AUDIO_ANALYSIS: bool = True
    ENABLE_MULTIMODAL_ANALYSIS: bool = True

    # Anomaly Detection Thresholds
    GAZE_DEVIATION_THRESHOLD_FRAMES: int = 30
    GAZE_DEVIATION_ANGLE: int = 30
    HAND_FACE_PROXIMITY_THRESHOLD: int = 80
    HAND_FACE_CONSECUTIVE_FRAMES: int = 3
    HEAD_POSE_EXTREME_ANGLE: int = 45
    HEAD_POSE_FRAME_DURATION: int = 5
    AUDIO_ANOMALY_THRESHOLD_DB: int = 65
    AUDIO_ANOMALY_DURATION_SECONDS: int = 2
    POSTURE_BEND_ANGLE_THRESHOLD: int = 45
    POSTURE_DURATION_THRESHOLD: int = 5

    # Performance
    FRAME_SKIP_RATIO: int = 3
    BATCH_INFERENCE_SIZE: int = 4
    MAX_CONCURRENT_TRACKS: int = 100
    WEBSOCKET_FRAME_RATE: int = 2
    WEBSOCKET_BATCH_SIZE: int = 5

    CORS_ORIGINS: List[str] = Field(default=["http://localhost:3000", "http://localhost:8080"])
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = Field(default=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    CORS_ALLOW_HEADERS: List[str] = Field(default=["Content-Type", "Authorization"])

    # LM Studio VLM
    VLM_ENABLED: bool = True
    VLM_BASE_URL: str = "http://127.0.0.1:1234/v1"
    VLM_MODEL: str = "qwen/qwen3-vl-4b"
    VLM_MAX_TOKENS: int = 512
    VLM_TIMEOUT: int = 60

    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379/0"
    REDIS_CACHE_TTL: int = 5
    REDIS_POOL_SIZE: int = 10

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 100


@lru_cache()
def get_settings() -> Settings:
    return Settings()
