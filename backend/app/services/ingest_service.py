"""Tiếp nhận dữ liệu từ nguồn (AI Vision thật hoặc bộ giả lập) – một đường ống duy nhất:
kiểm tra → tính mức ùn tắc nếu thiếu → lưu PostgreSQL → cập nhật LiveState → phát sự kiện realtime.
"""

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.domain.congestion import congestion_level
from app.domain.constants import RealtimeEvent
from app.repositories import metrics as metrics_repo
from app.schemas import from_ms
from app.services.live_state import LiveState


def normalize_metrics(batch: list[dict], live: LiveState) -> list[dict]:
    """Chuẩn hóa một lô số liệu: cùng mốc thời gian, tự tính `level` theo ngưỡng hiện hành."""
    now_ms = int(time.time() * 1000)
    out = []
    for m in batch:
        if m["cameraId"] not in live.cameras:
            raise AppError(f"Không tồn tại camera {m['cameraId']}")
        online = m.get("online", True)
        level = m.get("level")
        if level is None:
            level = congestion_level(m["avgSpeed"], m["occupancy"], live.thresholds) if online else 0
        out.append({**m, "ts": m.get("ts") or now_ms, "online": online, "level": level})
    return out


async def ingest_metrics(session: AsyncSession, live: LiveState, batch: list[dict], *, publish: bool = True) -> list[dict]:
    batch = normalize_metrics(batch, live)
    rows = [
        {
            "camera_id": m["cameraId"],
            "ts": from_ms(m["ts"]),
            "online": m["online"],
            "flow": m["flow"],
            "avg_speed": m["avgSpeed"],
            "occupancy": m["occupancy"],
            "level": m["level"],
            **m["vehicles"],
        }
        for m in batch
    ]
    await metrics_repo.insert_batch(session, rows)
    await session.commit()
    live.push_metrics(batch)
    if publish:
        await live.bus.publish(RealtimeEvent.METRICS, batch)
    return batch
