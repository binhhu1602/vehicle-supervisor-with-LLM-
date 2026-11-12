"""Trạng thái thời gian thực trong bộ nhớ + Event Bus (mẫu Observer, Ch07).

- LiveState giữ số liệu mới nhất của từng camera và ~90 giây lịch sử gần nhất để gửi
  "snapshot" ngay khi client kết nối, không phải truy vấn CSDL mỗi lần.
- EventBus: các thành phần (WebSocket gateway, …) đăng ký nhận sự kiện; dịch vụ phát sự kiện
  mà không cần biết ai đang nghe → giảm phụ thuộc giữa các tầng.

Lưu ý mở rộng: khi chạy nhiều tiến trình/máy chủ, thay EventBus bằng Redis Pub/Sub.
"""

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any

from app.domain.congestion import DEFAULT_THRESHOLDS, Thresholds, network_congestion_index

log = logging.getLogger("trafficeye.bus")

Handler = Callable[[str, Any], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._handlers: list[Handler] = []

    def subscribe(self, handler: Handler) -> Callable[[], None]:
        self._handlers.append(handler)
        return lambda: self._handlers.remove(handler) if handler in self._handlers else None

    async def publish(self, event: str, payload: Any) -> None:
        results = await asyncio.gather(*(h(event, payload) for h in list(self._handlers)), return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                log.warning("Observer lỗi khi xử lý %s: %s", event, r)


class LiveState:
    HISTORY_TICKS = 45  # ~90 giây với chu kỳ 2 giây

    def __init__(self) -> None:
        self.cameras: dict[str, dict] = {}
        self.latest: dict[str, dict] = {}
        self.history: deque[list[dict]] = deque(maxlen=self.HISTORY_TICKS)
        self.thresholds: Thresholds = DEFAULT_THRESHOLDS
        self.bus = EventBus()
        self.frames: dict[str, tuple[bytes, int]] = {}
        self.real_sources: dict[str, float] = {}  # camera_id → thời điểm nhận dữ liệu thật gần nhất

    def mark_real(self, camera_id: str) -> None:
        """Đánh dấu camera đang có dữ liệu từ AI Vision thật → bộ giả lập nhường camera này."""
        self.real_sources[camera_id] = time.monotonic()

    def is_real(self, camera_id: str, within_seconds: float = 30) -> bool:
        t = self.real_sources.get(camera_id)
        return t is not None and time.monotonic() - t <= within_seconds

    def set_cameras(self, cameras: list[dict]) -> None:
        self.cameras = {c["id"]: c for c in cameras}

    # ---- Khung hình camera thật (đã vẽ khung nhận diện) – chỉ giữ ảnh MỚI NHẤT trong bộ nhớ ----
    FRAME_TTL_SECONDS = 15

    def set_frame(self, camera_id: str, jpeg: bytes) -> int:
        ts = int(time.time() * 1000)
        self.frames[camera_id] = (jpeg, ts)
        return ts

    def get_frame(self, camera_id: str) -> tuple[bytes, int] | None:
        item = self.frames.get(camera_id)
        if item is None or time.time() * 1000 - item[1] > self.FRAME_TTL_SECONDS * 1000:
            return None
        return item

    def push_metrics(self, batch: list[dict]) -> None:
        for m in batch:
            self.latest[m["cameraId"]] = m
        self.history.append(batch)

    def camera_list(self) -> list[dict]:
        """Camera kèm số liệu mới nhất – dạng dùng cho ngữ cảnh LLM và báo cáo."""
        return [{**c, "metric": self.latest.get(cid)} for cid, c in self.cameras.items()]

    def kpis(self, open_incidents: list[dict]) -> dict:
        online = [m for m in self.latest.values() if m["online"]]
        total = sum(m["flow"] for m in online)
        avg_speed = round(sum(m["avgSpeed"] * m["flow"] for m in online) / total) if total else 0
        return {
            "totalFlow": total,
            "avgSpeed": avg_speed,
            "congestionIndex": network_congestion_index([(m["level"], m["flow"]) for m in online]),
            "congestedNodes": sum(1 for m in online if m["level"] >= 2),
            "openIncidents": len(open_incidents),
            "criticalIncidents": sum(1 for i in open_incidents if i["severity"] in ("HIGH", "CRITICAL")),
            "camerasOnline": len(online),
            "camerasTotal": len(self.cameras),
        }
