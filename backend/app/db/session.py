"""Kết nối CSDL: engine + session bất đồng bộ (SQLAlchemy 2.0 / asyncpg)."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


def build_engine(url: str | None = None) -> AsyncEngine:
    s = get_settings()
    return create_async_engine(url or s.database_url, echo=s.db_echo, pool_pre_ping=True, pool_size=10, max_overflow=10)


class Database:
    """Gói engine + session factory; tạo một lần lúc khởi động (xem app.main.lifespan)."""

    def __init__(self, url: str | None = None):
        self.engine = build_engine(url)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.session_factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()
