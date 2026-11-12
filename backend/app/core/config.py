"""Cấu hình ứng dụng – điểm đọc biến môi trường DUY NHẤT (quản lý cấu hình, Ch07)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TrafficEye API"
    environment: Literal["development", "test", "production"] = "development"

    # PostgreSQL (driver asyncpg cho SQLAlchemy async)
    database_url: str = "postgresql+asyncpg://trafficeye:trafficeye@localhost:5432/trafficeye"
    db_echo: bool = False

    # Bảo mật
    jwt_secret: str = Field(default="dev-secret-change-me", min_length=16)
    jwt_expire_minutes: int = 8 * 60
    ingest_api_key: str = "dev-ingest-key"  # khóa cho hệ thống AI Vision đẩy dữ liệu
    cors_origins: list[str] = ["http://localhost:5173"]

    # Bộ giả lập dữ liệu (thay cho camera + AI Vision khi chưa có thiết bị thật)
    simulator_enabled: bool = True
    simulator_tick_ms: int = 2000
    metrics_retention_days: int = 7

    # LLM
    llm_provider: Literal["auto", "claude", "rule_based"] = "auto"
    llm_model: str = "claude-opus-5-5"
    llm_rate_limit_per_minute: int = 20
    llm_max_history_messages: int = 12

    @property
    def is_test(self) -> bool:
        return self.environment == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
