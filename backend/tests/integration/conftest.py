"""Hạ tầng integration test: PostgreSQL THẬT (database riêng `trafficeye_test`).

- Tạo lại database test, chạy migration Alembic (kiểm tra luôn migration) và nạp seed.
- Tắt bộ giả lập để kết quả tất định; LLM dùng bộ trả lời theo luật (không tốn chi phí API).
- Tự động bỏ qua nếu không kết nối được PostgreSQL (vd. chưa `docker compose up -d db`).
"""

import asyncio
import os
from pathlib import Path

import asyncpg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.seed import seed
from app.db.session import Database
from app.main import create_app

BASE = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://trafficeye:trafficeye@localhost:5432/trafficeye_test")
DB_NAME = BASE.rsplit("/", 1)[1]
ADMIN_DSN = BASE.replace("postgresql+asyncpg", "postgresql").rsplit("/", 1)[0] + "/postgres"


async def _recreate_database() -> None:
    conn = await asyncpg.connect(ADMIN_DSN, timeout=3)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{DB_NAME}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{DB_NAME}"')
    finally:
        await conn.close()


async def _seed() -> None:
    db = Database(BASE)
    try:
        await seed(db)
    finally:
        await db.dispose()


@pytest.fixture(scope="session")
def database_url() -> str:
    try:
        asyncio.run(_recreate_database())
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        pytest.skip(f"Không kết nối được PostgreSQL ({exc}); chạy `docker compose up -d db` để chạy integration test")
    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    cfg.attributes["database_url"] = BASE
    command.upgrade(cfg, "head")
    asyncio.run(_seed())
    return BASE


@pytest.fixture(scope="session")
def client(database_url):
    settings = Settings(database_url=database_url, simulator_enabled=False, llm_provider="rule_based", environment="test", llm_rate_limit_per_minute=1000)
    app = create_app(settings)
    with TestClient(app) as c:
        yield c


def login(client: TestClient, username: str) -> dict:
    password = {"admin": "admin123", "operator": "operator123", "viewer": "viewer123"}[username]
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


INGEST = {"X-Ingest-Key": "dev-ingest-key"}


def new_incident(client: TestClient, **over) -> dict:
    body = {"type": "ACCIDENT", "severity": "HIGH", "cameraId": "CAM-05", "description": "Va chạm thử nghiệm", "confidence": 0.9, **over}
    r = client.post("/api/ingest/incidents", headers=INGEST, json=body)
    assert r.status_code == 201, r.text
    return r.json()
