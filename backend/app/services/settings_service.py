from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError
from app.domain.congestion import DEFAULT_THRESHOLDS, Thresholds
from app.domain.permissions import can
from app.repositories import settings as settings_repo
from app.services.live_state import LiveState

THRESHOLDS_KEY = "thresholds"


async def load_thresholds(session: AsyncSession) -> Thresholds:
    value = await settings_repo.get_value(session, THRESHOLDS_KEY)
    return Thresholds(**value) if value else DEFAULT_THRESHOLDS


async def update_thresholds(session: AsyncSession, live: LiveState, data: dict, user: dict) -> Thresholds:
    if not can(user["role"], "settings:edit"):
        raise ForbiddenError("Chỉ Quản trị viên được thay đổi ngưỡng phân tích")
    thresholds = Thresholds(**{**live.thresholds.model_dump(), **data})  # validate thứ tự ngưỡng
    await settings_repo.set_value(session, THRESHOLDS_KEY, thresholds.model_dump(), user["name"])
    await session.commit()
    live.thresholds = thresholds
    return thresholds
