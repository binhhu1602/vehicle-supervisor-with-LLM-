from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Camera, Incident, IncidentEvent
from app.domain.incident_state_machine import OPEN_STATUSES


async def create(session: AsyncSession, data: dict, actor: str = "AI Vision") -> Incident:
    incident = Incident(**data)
    session.add(incident)
    await session.flush()  # lấy id do CSDL sinh ('INC-' || nextval)
    session.add(IncidentEvent(incident_id=incident.id, action="detected", from_status=None, to_status=incident.status, actor=actor))
    await session.flush()
    await session.refresh(incident, ["events", "camera"])
    return incident


async def get(session: AsyncSession, incident_id: str, *, for_update: bool = False) -> Incident | None:
    stmt = select(Incident).where(Incident.id == incident_id)
    if for_update:
        # Khóa dòng: hai điều hành viên cùng bấm xử lý một sự cố sẽ được tuần tự hóa
        stmt = stmt.with_for_update(of=Incident)
    return await session.scalar(stmt)


async def add_event(session: AsyncSession, event: IncidentEvent) -> None:
    session.add(event)
    await session.flush()


async def search(
    session: AsyncSession,
    *,
    scope: str = "all",
    severity: str | None = None,
    type_: str | None = None,
    q: str | None = None,
    camera_id: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Incident], int]:
    conds = []
    if scope == "open":
        conds.append(Incident.status.in_([s.value for s in OPEN_STATUSES]))
    elif scope == "closed":
        conds.append(Incident.status.not_in([s.value for s in OPEN_STATUSES]))
    if severity:
        conds.append(Incident.severity == severity)
    if type_:
        conds.append(Incident.type == type_)
    if camera_id:
        conds.append(Incident.camera_id == camera_id)
    if since:
        conds.append(Incident.created_at >= since)
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Incident.id.ilike(like), Incident.description.ilike(like), Camera.name.ilike(like)))

    base = select(Incident).join(Camera, Camera.id == Incident.camera_id).where(*conds)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.scalars(base.order_by(Incident.created_at.desc()).limit(limit).offset(offset))
    return list(rows.unique()), int(total or 0)


async def counts_by(session: AsyncSession, column, since: datetime) -> dict[str, int]:
    rows = (await session.execute(select(column, func.count()).where(Incident.created_at >= since).group_by(column))).all()
    return {k: v for k, v in rows}
