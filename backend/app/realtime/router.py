"""Endpoint WebSocket /ws?token=<JWT> – hợp đồng thông điệp {type, payload} giống frontend.

Server → client: traffic:snapshot (ngay khi kết nối), metrics:update, incident:new, incident:update
Client → server: incident:transition {id, action, note}, config:thresholds {...}
"""

import logging

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.domain.constants import RealtimeEvent
from app.domain.incident_state_machine import InvalidTransitionError
from app.realtime.manager import Client
from app.repositories import users as users_repo
from app.services import incident_service, settings_service
from app.services.auth_service import user_to_dict

log = logging.getLogger("trafficeye.ws")
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = ""):
    c = ws.app.state.container
    # Xác thực trước khi nhận kết nối
    try:
        claims = decode_access_token(token)
        async with c.db.session_factory() as s:
            user_row = await users_repo.get_by_id(s, int(claims["sub"]))
        if user_row is None or not user_row.is_active:
            raise ValueError("user")
        user = user_to_dict(user_row)
    except (jwt.PyJWTError, ValueError, KeyError):
        await ws.close(code=4401, reason="Unauthorized")
        return

    await ws.accept()
    client = Client(ws=ws, user=user)
    try:
        await c.ws.send(client, RealtimeEvent.CONNECTION, {"status": "connected"})
        async with c.db.session_factory() as s:
            incidents = await incident_service.list_recent(s, limit=200)
        await c.ws.send(
            client,
            RealtimeEvent.SNAPSHOT,
            {"cameras": list(c.live.cameras.values()), "metricsHistory": list(c.live.history), "incidents": incidents},
        )
        c.ws.add(client)
        while True:
            msg = await ws.receive_json()
            await _handle_command(c, client, msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("WS lỗi: %s", exc)
    finally:
        c.ws.remove(client)


async def _handle_command(c, client: Client, msg: dict) -> None:
    type_, payload = msg.get("type"), msg.get("payload") or {}
    try:
        async with c.db.session_factory() as s:
            if type_ == "incident:transition":
                # Kết quả được phát qua EventBus (incident:update) tới MỌI client
                await incident_service.transition(s, c.live, str(payload.get("id")), str(payload.get("action")), client.user, str(payload.get("note", ""))[:1000])
            elif type_ == "config:thresholds":
                await settings_service.update_thresholds(s, c.live, payload, client.user)
            else:
                raise AppError(f"Lệnh không hỗ trợ: {type_}")
    except (AppError, InvalidTransitionError, ValidationError, ValueError) as exc:
        message = exc.message if isinstance(exc, AppError) else str(exc)
        await c.ws.send(client, "error", {"command": type_, "message": message})
