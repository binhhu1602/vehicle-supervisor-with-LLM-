from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def get_by_username(session: AsyncSession, username: str) -> User | None:
    return await session.scalar(select(User).where(User.username == username))


async def get_by_id(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)


async def touch_last_login(session: AsyncSession, user_id: int) -> None:
    await session.execute(update(User).where(User.id == user_id).values(last_login_at=datetime.now(UTC)))
