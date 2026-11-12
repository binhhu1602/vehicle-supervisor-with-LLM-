"""Tác vụ nền: khởi tạo LiveState, chạy bộ giả lập, dọn dữ liệu cũ."""

import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta

from app.core.container import Container
from app.domain.constants import RealtimeEvent
from app.repositories import cameras as cameras_repo
from app.repositories import metrics as metrics_repo
from app.services import incident_service, ingest_service, settings_service
from app.services.mappers import camera_to_dict, metric_to_dict
from app.simulation.simulator import TrafficSimulator

log = logging.getLogger("trafficeye.jobs")


async def bootstrap_live_state(c: Container) -> None:
    """Nạp camera, ngưỡng và ~90 giây số liệu gần nhất từ CSDL vào bộ nhớ."""
    async with c.db.session_factory() as s:
        c.live.set_cameras([camera_to_dict(cam) for cam in await cameras_repo.list_active(s)])
        c.live.thresholds = await settings_service.load_thresholds(s)
        since = datetime.now(UTC) - timedelta(seconds=c.settings.simulator_tick_ms / 1000 * c.live.HISTORY_TICKS)
        rows = await metrics_repo.recent_batches(s, since)
    batches: dict[int, list[dict]] = {}
    for r in rows:
        m = metric_to_dict(r)
        batches.setdefault(m["ts"], []).append(m)
    for ts in sorted(batches):
        c.live.push_metrics(batches[ts])
    log.info("LiveState: %d camera, %d mốc số liệu gần nhất", len(c.live.cameras), len(c.live.history))


async def simulator_loop(c: Container) -> None:
    """Đóng vai Camera + AI Vision: mỗi chu kỳ đẩy số liệu & sự cố qua đúng đường ống ingest."""
    tick = c.settings.simulator_tick_ms / 1000
    sim = TrafficSimulator(list(c.live.cameras.values()), rng=random.Random(), thresholds=c.live.thresholds)

    # Nếu CSDL chưa có lịch sử gần đây, chạy "ngược thời gian" để biểu đồ có dữ liệu ngay
    if len(c.live.history) < 5:
        now = datetime.now(UTC)
        async with c.db.session_factory() as s:
            for k in range(c.live.HISTORY_TICKS, 0, -1):
                metrics, _ = sim.tick(now - timedelta(seconds=k * tick))
                await ingest_service.ingest_metrics(s, c.live, metrics, publish=False)

    while True:
        started = asyncio.get_running_loop().time()
        try:
            sim.thresholds = c.live.thresholds  # áp dụng ngay khi Quản trị viên đổi ngưỡng
            metrics, incidents = sim.tick(datetime.now(UTC))
            # Camera đã có AI Vision thật gửi dữ liệu → bộ giả lập không ghi đè
            metrics = [m for m in metrics if not c.live.is_real(m["cameraId"])]
            incidents = [i for i in incidents if not c.live.is_real(i["cameraId"])]
            async with c.db.session_factory() as s:
                if metrics:
                    await ingest_service.ingest_metrics(s, c.live, metrics)
                for inc in incidents:
                    await incident_service.create_incident(s, c.live, inc)
        except Exception as exc:  # một chu kỳ lỗi không được dừng cả vòng lặp
            log.exception("Lỗi chu kỳ giả lập: %s", exc)
        elapsed = asyncio.get_running_loop().time() - started
        await asyncio.sleep(max(0.05, tick - elapsed))


async def retention_loop(c: Container) -> None:
    """Xóa số liệu chi tiết cũ hơn N ngày (mặc định 7) mỗi giờ – giữ CSDL gọn."""
    while True:
        try:
            async with c.db.session_factory() as s:
                cutoff = datetime.now(UTC) - timedelta(days=c.settings.metrics_retention_days)
                deleted = await metrics_repo.delete_older_than(s, cutoff)
                await s.commit()
                if deleted:
                    log.info("Đã xóa %d bản ghi số liệu cũ", deleted)
        except Exception as exc:
            log.exception("Lỗi dọn dữ liệu: %s", exc)
        await asyncio.sleep(3600)


def wire_realtime(c: Container) -> None:
    """Gắn WebSocket gateway làm observer của EventBus."""
    events = {RealtimeEvent.METRICS, RealtimeEvent.INCIDENT_NEW, RealtimeEvent.INCIDENT_UPDATE, RealtimeEvent.CAMERA_FRAME}

    async def forward(event: str, payload) -> None:
        if event in events:
            await c.ws.broadcast(event, payload)

    c.live.bus.subscribe(forward)
