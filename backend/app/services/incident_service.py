"""Nghiệp vụ Sự cố: tạo (từ AI Vision), tra cứu, chuyển trạng thái theo máy trạng thái."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.db.models import IncidentEvent
from app.domain.constants import RealtimeEvent
from app.domain.incident_state_machine import next_status
from app.domain.permissions import can
from app.repositories import cameras as cameras_repo
from app.repositories import incidents as incidents_repo
from app.services.live_state import LiveState
from app.services.mappers import incident_to_dict


async def create_incident(session: AsyncSession, live: LiveState, data: dict) -> dict:
    if not await cameras_repo.exists(session, data["cameraId"]):
        raise NotFoundError(f"Không tồn tại camera {data['cameraId']}")
    incident = await incidents_repo.create(
        session,
        {
            "type": data["type"],
            "severity": data["severity"],
            "camera_id": data["cameraId"],
            "description": data["description"],
            "confidence": data["confidence"],
            "snapshot": data.get("snapshot") or {},
        },
    )
    await session.commit()
    out = incident_to_dict(incident)
    await live.bus.publish(RealtimeEvent.INCIDENT_NEW, out)
    return out


async def get_incident(session: AsyncSession, incident_id: str) -> dict:
    incident = await incidents_repo.get(session, incident_id)
    if incident is None:
        raise NotFoundError(f"Không tìm thấy sự cố {incident_id}")
    return incident_to_dict(incident)


async def list_open(session: AsyncSession, limit: int = 50) -> list[dict]:
    rows, _ = await incidents_repo.search(session, scope="open", limit=limit)
    return [incident_to_dict(i) for i in rows]


async def list_recent(session: AsyncSession, limit: int = 200) -> list[dict]:
    """Sự cố gần nhất (mọi trạng thái) – dùng cho snapshot khi client kết nối WebSocket."""
    rows, _ = await incidents_repo.search(session, scope="all", limit=limit)
    return [incident_to_dict(i) for i in rows]


async def transition(session: AsyncSession, live: LiveState, incident_id: str, action: str, user: dict, note: str = "") -> dict:
    """Áp dụng hành động xử lý. Người thực hiện lấy từ token, KHÔNG tin tên do client gửi."""
    if not can(user["role"], "incident:update"):
        raise ForbiddenError("Tài khoản không có quyền cập nhật sự cố")
    incident = await incidents_repo.get(session, incident_id, for_update=True)
    if incident is None:
        raise NotFoundError(f"Không tìm thấy sự cố {incident_id}")

    previous = incident.status
    incident.status = next_status(previous, action)  # ném InvalidTransitionError nếu sai quy trình
    incident.updated_at = datetime.now(UTC)
    await incidents_repo.add_event(
        session,
        IncidentEvent(
            incident_id=incident.id,
            action=action,
            from_status=previous,
            to_status=incident.status,
            actor=user["name"],
            actor_id=user["id"],
            note=note.strip(),
        ),
    )
    await session.commit()
    await session.refresh(incident, ["events"])
    out = incident_to_dict(incident)
    await live.bus.publish(RealtimeEvent.INCIDENT_UPDATE, out)
    return out
