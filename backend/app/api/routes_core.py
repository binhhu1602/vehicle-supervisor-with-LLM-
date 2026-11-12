"""REST API: sức khỏe hệ thống, xác thực, camera, số liệu, cài đặt, báo cáo, ingest."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.api.deps import get_container, get_current_user, get_session, require, require_ingest_key, require_query_or_bearer
from app.core.errors import AppError, NotFoundError
from app.domain.constants import RealtimeEvent
from app.core.container import Container
from app.domain.congestion import Thresholds
from app.repositories import incidents as incidents_repo
from app.repositories import metrics as metrics_repo
from app.schemas import (
    CameraOut,
    IncidentIn,
    IncidentOut,
    LoginRequest,
    LoginResponse,
    MetricIn,
    MetricOut,
    TransitionRequest,
    UserOut,
)
from app.services import auth_service, incident_service, ingest_service, report_service, settings_service
from app.services.mappers import incident_to_dict

router = APIRouter(prefix="/api")


@router.get("/health", tags=["Hệ thống"])
async def health(c: Container = Depends(get_container), session: AsyncSession = Depends(get_session)):
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "version": __version__,
        "database": db_ok,
        "llmProvider": c.llm.provider.name,
        "simulator": c.settings.simulator_enabled,
        "wsClients": len(c.ws.clients),
        "cameras": len(c.live.cameras),
    }


# ---------- Xác thực ----------
@router.post("/auth/login", response_model=LoginResponse, tags=["Xác thực"])
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    return await auth_service.login(session, body.username, body.password)


@router.get("/auth/me", response_model=UserOut, tags=["Xác thực"])
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Camera & số liệu ----------
@router.get("/cameras", response_model=list[CameraOut], tags=["Giám sát"])
async def list_cameras(c: Container = Depends(get_container), _: dict = Depends(require("camera:view"))):
    return list(c.live.cameras.values())


@router.get("/metrics/latest", response_model=list[MetricOut], tags=["Giám sát"])
async def latest_metrics(c: Container = Depends(get_container), _: dict = Depends(require("dashboard:view"))):
    return list(c.live.latest.values())


@router.get("/metrics/history", tags=["Giám sát"])
async def metrics_history(
    minutes: int = Query(60, ge=1, le=7 * 24 * 60),
    camera_id: str | None = Query(None, alias="cameraId"),
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require("dashboard:view")),
):
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    return await metrics_repo.history_per_minute(session, since, camera_id)


# ---------- Sự cố ----------
@router.get("/incidents", tags=["Sự cố"])
async def list_incidents(
    scope: str = Query("all", pattern="^(open|closed|all)$"),
    severity: str | None = None,
    type: str | None = None,
    q: str | None = Query(None, max_length=100),
    camera_id: str | None = Query(None, alias="cameraId"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require("incident:view")),
):
    rows, total = await incidents_repo.search(session, scope=scope, severity=severity, type_=type, q=q, camera_id=camera_id, limit=limit, offset=offset)
    return {"items": [incident_to_dict(i) for i in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/incidents/{incident_id}", response_model=IncidentOut, tags=["Sự cố"])
async def get_incident(incident_id: str, session: AsyncSession = Depends(get_session), _: dict = Depends(require("incident:view"))):
    return await incident_service.get_incident(session, incident_id)


@router.post("/incidents/{incident_id}/transition", response_model=IncidentOut, tags=["Sự cố"])
async def transition_incident(
    incident_id: str,
    body: TransitionRequest,
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("incident:update")),
):
    return await incident_service.transition(session, c.live, incident_id, body.action, user, body.note)


# ---------- Cài đặt ----------
@router.get("/settings/thresholds", response_model=Thresholds, tags=["Cài đặt"])
async def get_thresholds(c: Container = Depends(get_container), _: dict = Depends(get_current_user)):
    return c.live.thresholds


@router.put("/settings/thresholds", response_model=Thresholds, tags=["Cài đặt"])
async def put_thresholds(
    body: Thresholds,
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("settings:edit")),
):
    return await settings_service.update_thresholds(session, c.live, body.model_dump(), user)


# ---------- Báo cáo ----------
@router.get("/reports/summary", tags=["Báo cáo"])
async def report_summary(
    hours: int = Query(24, ge=1, le=24 * 30),
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require("report:view")),
):
    return await report_service.summary(session, c.live, hours)


# ---------- Ingest (AI Vision → backend) ----------
@router.post("/ingest/metrics", status_code=202, tags=["Ingest"], dependencies=[Depends(require_ingest_key)])
async def ingest_metrics(body: list[MetricIn], c: Container = Depends(get_container), session: AsyncSession = Depends(get_session)):
    for m in body:
        c.live.mark_real(m.camera_id)
    batch = await ingest_service.ingest_metrics(session, c.live, [m.model_dump(by_alias=True) for m in body])
    return {"accepted": len(batch)}


@router.post("/ingest/incidents", status_code=201, response_model=IncidentOut, tags=["Ingest"], dependencies=[Depends(require_ingest_key)])
async def ingest_incident(body: IncidentIn, c: Container = Depends(get_container), session: AsyncSession = Depends(get_session)):
    return await incident_service.create_incident(session, c.live, body.model_dump(by_alias=True))



# ---------- Khung hình camera (AI Vision → backend → trình duyệt) ----------
MAX_FRAME_BYTES = 1_500_000
JPEG_MAGIC = bytes([0xFF, 0xD8])  # 2 byte đầu của mọi file JPEG


@router.post("/ingest/frames/{camera_id}", status_code=204, tags=["Ingest"], dependencies=[Depends(require_ingest_key)])
async def ingest_frame(camera_id: str, request: Request, c: Container = Depends(get_container)):
    """Worker gửi ảnh JPEG đã vẽ khung nhận diện (~1 ảnh/giây). Chỉ giữ ảnh mới nhất trong bộ nhớ, không lưu CSDL."""
    if camera_id not in c.live.cameras:
        raise NotFoundError(f"Không tồn tại camera {camera_id}")
    body = await request.body()
    if not body.startswith(JPEG_MAGIC) or len(body) > MAX_FRAME_BYTES:
        raise AppError("Ảnh phải là JPEG và không quá 1.5 MB")
    ts = c.live.set_frame(camera_id, body)
    c.live.mark_real(camera_id)
    await c.live.bus.publish(RealtimeEvent.CAMERA_FRAME, {"cameraId": camera_id, "ts": ts})
    return Response(status_code=204)


@router.get("/cameras/{camera_id}/frame", tags=["Giám sát"], responses={200: {"content": {"image/jpeg": {}}}})
async def camera_frame(camera_id: str, c: Container = Depends(get_container), _: dict = Depends(require_query_or_bearer("camera:view"))):
    """Khung hình mới nhất. Nhận token qua header hoặc `?token=` để dùng trực tiếp trong thẻ <img>."""
    item = c.live.get_frame(camera_id)
    if item is None:
        raise NotFoundError("Camera chưa có hình ảnh từ AI Vision")
    jpeg, ts = item
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store", "X-Frame-Ts": str(ts)})
