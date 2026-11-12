"""Bộ giả lập giao thông – đóng vai "Camera + AI Vision" khi chưa có thiết bị thật (prototype, Ch02).

Cùng thuật toán với frontend/src/services/simulation/TrafficSimulator.js. Bộ sinh số ngẫu nhiên
được tiêm vào (random.Random(seed)) để kiểm thử cho kết quả tất định.
Đầu ra đi qua đúng đường ống của dữ liệu thật: IngestService → CSDL → EventBus → WebSocket.
"""

import math
import random
from dataclasses import dataclass
from datetime import datetime

from app.domain.congestion import DEFAULT_THRESHOLDS, Thresholds, congestion_level


def time_of_day_factor(dt: datetime) -> float:
    h = dt.hour + dt.minute / 60

    def peak(center: float, width: float) -> float:
        return math.exp(-((h - center) ** 2) / (2 * width**2))

    return 0.35 + 0.9 * peak(7.5, 1.1) + 0.95 * peak(17.5, 1.3) + 0.35 * peak(12, 1.5)


INCIDENT_WEIGHTS = [("RED_LIGHT", 34), ("WRONG_WAY", 18), ("STALLED_VEHICLE", 18), ("ACCIDENT", 14), ("CAMERA_OFFLINE", 6)]

DESCRIPTIONS = {
    "ACCIDENT": "Phát hiện va chạm giữa các phương tiện tại {name}. Một làn đường bị chiếm dụng.",
    "CONGESTION": "Tốc độ trung bình tại {name} giảm sâu và duy trì trong nhiều chu kỳ liên tiếp.",
    "WRONG_WAY": "Phương tiện di chuyển ngược chiều tại {name}.",
    "RED_LIGHT": "Phương tiện vượt đèn đỏ tại {name}. Đã lưu ảnh biển số.",
    "STALLED_VEHICLE": "Phương tiện dừng bất thường quá 3 phút tại {name}.",
    "CAMERA_OFFLINE": "Mất tín hiệu video từ camera {id} ({name}).",
}

SEVERITY_BY_TYPE = {
    "ACCIDENT": ("HIGH", "CRITICAL"),
    "CONGESTION": ("MEDIUM", "HIGH"),
    "WRONG_WAY": ("MEDIUM", "HIGH"),
    "RED_LIGHT": ("LOW", "MEDIUM"),
    "STALLED_VEHICLE": ("MEDIUM", "MEDIUM"),
    "CAMERA_OFFLINE": ("MEDIUM", "HIGH"),
}


@dataclass
class _CamState:
    flow: float
    jam_ticks: int = 0
    offline_ticks: int = 0
    congested_streak: int = 0
    congestion_reported: bool = False


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


class TrafficSimulator:
    def __init__(self, cameras: list[dict], rng: random.Random | None = None, thresholds: Thresholds = DEFAULT_THRESHOLDS):
        self.cameras = cameras
        self.rng = rng or random.Random()
        self.thresholds = thresholds
        self.state = {c["id"]: _CamState(flow=c["baseFlow"] * 0.8) for c in cameras}

    def _noise(self, scale: float) -> float:
        return (self.rng.random() - 0.5) * 2 * scale

    def _pick_type(self) -> str:
        total = sum(w for _, w in INCIDENT_WEIGHTS)
        r = self.rng.random() * total
        for value, w in INCIDENT_WEIGHTS:
            r -= w
            if r <= 0:
                return value
        return INCIDENT_WEIGHTS[-1][0]

    def _incident(self, type_: str, cam: dict, metric: dict) -> dict:
        lo, hi = SEVERITY_BY_TYPE[type_]
        return {
            "type": type_,
            "severity": lo if self.rng.random() < 0.5 else hi,
            "cameraId": cam["id"],
            "description": DESCRIPTIONS[type_].format(name=cam["name"], id=cam["id"]),
            "confidence": round(0.72 + self.rng.random() * 0.27, 2),
            "snapshot": {"flow": metric["flow"], "avgSpeed": metric["avgSpeed"], "level": metric["level"]},
        }

    def tick(self, at: datetime) -> tuple[list[dict], list[dict]]:
        """Sinh một chu kỳ dữ liệu. Trả về (metrics, incidents) theo định dạng của API ingest."""
        tod = time_of_day_factor(at)
        ts = int(at.timestamp() * 1000)
        metrics: list[dict] = []
        incidents: list[dict] = []

        for cam in self.cameras:
            s = self.state[cam["id"]]
            online = s.offline_ticks <= 0
            if s.offline_ticks > 0:
                s.offline_ticks -= 1

            target = cam["baseFlow"] * tod * (1 + self._noise(0.15))
            s.flow = _clamp(s.flow + (target - s.flow) * 0.25 + self._noise(4), 5, cam["baseFlow"] * 2)

            occupancy = _clamp(s.flow / (cam["lanes"] * 22) + self._noise(0.04), 0.03, 0.98)
            if s.jam_ticks > 0:
                occupancy = _clamp(occupancy + 0.35, 0, 0.98)
                s.jam_ticks -= 1
            avg_speed = round(_clamp(52 * (1 - occupancy**1.6) + self._noise(3), 3, 60))
            level = congestion_level(avg_speed, occupancy, self.thresholds)

            flow = round(s.flow)
            mb, car, truck = 0.68 + self._noise(0.05), 0.2 + self._noise(0.03), 0.06 + self._noise(0.02)
            vehicles = {
                "motorbike": round(flow * mb),
                "car": round(flow * car),
                "truck": max(0, round(flow * truck)),
                "bus": max(0, round(flow * (1 - mb - car - truck))),
            }
            metric = {
                "cameraId": cam["id"],
                "ts": ts,
                "online": online,
                "flow": flow if online else 0,
                "avgSpeed": avg_speed if online else 0,
                "occupancy": round(occupancy, 2) if online else 0,
                "level": level if online else 0,
                "vehicles": vehicles if online else {"motorbike": 0, "car": 0, "truck": 0, "bus": 0},
            }
            metrics.append(metric)

            # Ùn tắc kéo dài: 3 chu kỳ liên tiếp ở mức ≥ 2 → sinh 1 sự cố cho cả đợt
            if online and level >= 2:
                s.congested_streak += 1
                if s.congested_streak >= 3 and not s.congestion_reported:
                    s.congestion_reported = True
                    incidents.append(self._incident("CONGESTION", cam, metric))
            else:
                s.congested_streak = 0
                s.congestion_reported = False

        if self.rng.random() < 0.08:
            type_ = self._pick_type()
            cam = self.cameras[int(self.rng.random() * len(self.cameras))]
            s = self.state[cam["id"]]
            if type_ in ("ACCIDENT", "STALLED_VEHICLE"):
                s.jam_ticks = 12 if type_ == "ACCIDENT" else 6
            if type_ == "CAMERA_OFFLINE":
                s.offline_ticks = 8
            metric = next(m for m in metrics if m["cameraId"] == cam["id"])
            incidents.append(self._incident(type_, cam, metric))

        return metrics, incidents
