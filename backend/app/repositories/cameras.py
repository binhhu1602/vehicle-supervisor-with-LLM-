from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Camera


async def list_active(session: AsyncSession) -> list[Camera]:
    return list(await session.scalars(select(Camera).where(Camera.is_active).order_by(Camera.id)))


async def exists(session: AsyncSession, camera_id: str) -> bool:
    return await session.get(Camera, camera_id) is not None
