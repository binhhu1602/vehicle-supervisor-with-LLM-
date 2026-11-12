"""Điểm khởi động ứng dụng FastAPI.

Chạy: uvicorn app.main:app --reload  (tài liệu API tự sinh tại /docs)
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import routes_core, routes_llm
from app.core.config import Settings, get_settings
from app.core.container import Container
from app.core.errors import register_error_handlers
from app.db.session import Database
from app.realtime import router as ws_router
from app.realtime.manager import ConnectionManager
from app.services.live_state import LiveState
from app.services.llm.service import LlmService
from app.simulation import jobs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("trafficeye")


def build_container(settings: Settings, **overrides) -> Container:
    db = overrides.get("db") or Database(settings.database_url)
    return Container(
        settings=settings,
        db=db,
        live=overrides.get("live") or LiveState(),
        llm=overrides.get("llm") or LlmService(settings, db.session_factory, provider=overrides.get("llm_provider")),
        ws=ConnectionManager(),
    )


def create_app(settings: Settings | None = None, **overrides) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        c = build_container(settings, **overrides)
        app.state.container = c
        await jobs.bootstrap_live_state(c)
        jobs.wire_realtime(c)
        if settings.simulator_enabled:
            c.background.append(asyncio.create_task(jobs.simulator_loop(c), name="simulator"))
        c.background.append(asyncio.create_task(jobs.retention_loop(c), name="retention"))
        log.info("TrafficEye API %s sẵn sàng · LLM: %s · giả lập: %s", __version__, c.llm.provider.name, settings.simulator_enabled)
        yield
        for task in c.background:
            task.cancel()
        await asyncio.gather(*c.background, return_exceptions=True)
        await c.db.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="API hệ thống giám sát giao thông thời gian thực tích hợp LLM (TrafficEye).",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(routes_core.router)
    app.include_router(routes_llm.router)
    app.include_router(ws_router.router)
    return app


app = create_app()
