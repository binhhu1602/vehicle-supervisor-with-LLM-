from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppSetting, LlmRequest


async def get_value(session: AsyncSession, key: str) -> dict | None:
    row = await session.get(AppSetting, key)
    return row.value if row else None


async def set_value(session: AsyncSession, key: str, value: dict, updated_by: str) -> None:
    stmt = insert(AppSetting).values(key=key, value=value, updated_by=updated_by)
    stmt = stmt.on_conflict_do_update(index_elements=[AppSetting.key], set_={"value": value, "updated_by": updated_by})
    await session.execute(stmt)


async def log_llm_request(session: AsyncSession, **fields) -> None:
    session.add(LlmRequest(**fields))
