"""Biến kết quả phát hiện + bám vết (khung bao có ID) thành chỉ số giao thông.

Không phụ thuộc torch/OpenCV → kiểm thử đơn vị được bằng dữ liệu tổng hợp.

Chỉ số (theo cửa sổ thời gian, mặc định 10 giây, quy đổi ra "mỗi phút"):
  - flow      : số phương tiện CẮT QUA VẠCH ĐẾM (mỗi ID chỉ đếm 1 lần) → xe/phút
  - vehicles  : cơ cấu theo loại (xe máy, ô tô, xe tải, xe buýt) → xe/phút
  - avgSpeed  : trung vị vận tốc các xe trong vùng làn (pixel/s × mét/pixel × 3.6) → km/h
                xe đứng yên được tính tốc độ 0 → phản ánh đúng tình trạng ùn tắc;
                không có xe trong vùng làn → báo tốc độ dòng tự do (đường trống không phải ùn tắc)
  - occupancy : tỉ lệ diện tích vùng làn (ROI) bị khung xe che phủ, trung bình theo thời gian → 0..1
Sự kiện:
  - WRONG_WAY       : xe cắt vạch đếm ngược hướng quy định
  - STALLED_VEHICLE : xe đứng gần như yên trong vùng làn quá `stalled_seconds`
`level` (mức ùn tắc) KHÔNG tính ở đây: backend tự tính theo ngưỡng do Quản trị viên cấu hình.
"""

from __future__ import annotations

import json
import math
import statistics
from dataclasses import dataclass, field
from pathlib import Path

Point = tuple[float, float]

# Ánh xạ lớp COCO → loại phương tiện của hệ thống
COCO_TO_VEHICLE = {2: "car", 3: "motorbike", 5: "bus", 7: "truck"}
VEHICLE_KEYS = ("motorbike", "car", "truck", "bus")


@dataclass
class Detection:
    track_id: int
    cls: str  # motorbike | car | truck | bus
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 (pixel)
    conf: float = 1.0

    @property
    def anchor(self) -> Point:
        """Điểm chạm mặt đường (giữa cạnh dưới khung) – ổn định hơn tâm khung khi xe ở xa/gần."""
        x1, _, x2, y2 = self.box
        return ((x1 + x2) / 2, y2)


@dataclass
class Calibration:
    camera_id: str
    count_line: tuple[Point, Point]
    roi: list[Point]
    meters_per_pixel: float = 0.05  # ước lượng từ bề rộng làn đã biết (vd. 3.5 m ≈ 70 px → 0.05)
    direction: Point | None = None  # hướng đi hợp lệ khi cắt vạch (vector ảnh); None = cho phép 2 chiều
    stalled_seconds: float = 180
    free_flow_kmh: float = 40  # tốc độ báo cáo khi vùng làn không có xe (đường trống ≠ ùn tắc)

    @staticmethod
    def load(path: str | Path) -> Calibration:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return Calibration(
            camera_id=d["cameraId"],
            count_line=(tuple(d["countLine"][0]), tuple(d["countLine"][1])),
            roi=[tuple(p) for p in d["roi"]],
            meters_per_pixel=d.get("metersPerPixel", 0.05),
            direction=tuple(d["direction"]) if d.get("direction") else None,
            stalled_seconds=d.get("stalledSeconds", 180),
            free_flow_kmh=d.get("freeFlowKmh", 40),
        )

    @staticmethod
    def default(camera_id: str, width: int, height: int) -> Calibration:
        """Mặc định: vạch đếm ngang giữa khung, vùng làn = nửa dưới khung hình."""
        return Calibration(
            camera_id=camera_id,
            count_line=((0, height * 0.6), (width, height * 0.6)),
            roi=[(0, height * 0.35), (width, height * 0.35), (width, height), (0, height)],
        )


# ---------------- hình học ----------------
def _cross(o: Point, a: Point, b: Point) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def segments_intersect(p1: Point, p2: Point, q1: Point, q2: Point) -> bool:
    """Đoạn di chuyển p1→p2 có cắt vạch q1–q2 không.
    Bao gồm trường hợp điểm cuối nằm ĐÚNG trên vạch (xe dừng trên vạch ở một khung hình),
    nhưng chỉ tính một lần nhờ điều kiện bất đối xứng (d1 khác 0)."""
    d1, d2 = _cross(q1, q2, p1), _cross(q1, q2, p2)
    d3, d4 = _cross(p1, p2, q1), _cross(p1, p2, q2)
    changes_side = (d1 < 0 <= d2) or (d1 > 0 >= d2)
    return changes_side and d3 * d4 <= 0


def point_in_polygon(p: Point, poly: list[Point]) -> bool:
    x, y = p
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def _roi_samples(poly: list[Point], n: int = 32) -> list[Point]:
    """Lưới điểm mẫu bên trong ROI – xấp xỉ diện tích che phủ mà không cần raster hóa."""
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pts = []
    for i in range(n):
        for j in range(n):
            p = (x0 + (x1 - x0) * (i + 0.5) / n, y0 + (y1 - y0) * (j + 0.5) / n)
            if point_in_polygon(p, poly):
                pts.append(p)
    return pts


# ---------------- bộ phân tích ----------------
@dataclass
class _Track:
    cls_votes: dict[str, int] = field(default_factory=dict)
    history: list[tuple[float, Point]] = field(default_factory=list)  # (t, anchor)
    counted: bool = False
    stalled_reported: bool = False
    still_since: float | None = None
    last_seen: float = 0.0

    @property
    def cls(self) -> str:
        return max(self.cls_votes, key=self.cls_votes.get)


class TrafficAnalyzer:
    def __init__(self, calib: Calibration, window_seconds: float = 10.0):
        self.calib = calib
        self.window_seconds = window_seconds
        self.tracks: dict[int, _Track] = {}
        self._samples = _roi_samples(calib.roi)
        self.total_counts = dict.fromkeys(VEHICLE_KEYS, 0)  # cộng dồn từ khi khởi động (hiển thị)
        self._reset_window(0.0)

    def _reset_window(self, t: float) -> None:
        self.window_start = t
        self.counts = dict.fromkeys(VEHICLE_KEYS, 0)
        self.speed_samples: list[float] = []
        self.occ_samples: list[float] = []

    # -------- xử lý từng khung hình --------
    def update(self, t: float, detections: list[Detection]) -> list[dict]:
        """t: thời điểm khung hình (giây). Trả về danh sách sự cố phát hiện được ở khung này."""
        events: list[dict] = []
        frame_speeds: list[float] = []

        for d in detections:
            tr = self.tracks.setdefault(d.track_id, _Track())
            tr.cls_votes[d.cls] = tr.cls_votes.get(d.cls, 0) + 1
            tr.last_seen = t
            cur = d.anchor
            prev = tr.history[-1][1] if tr.history else None
            tr.history.append((t, cur))
            tr.history = [h for h in tr.history if t - h[0] <= 2.0]  # giữ ~2 giây gần nhất

            # 1) Đếm khi cắt vạch (mỗi ID một lần) + kiểm tra hướng
            if prev and not tr.counted and segments_intersect(prev, cur, *self.calib.count_line):
                tr.counted = True
                self.counts[tr.cls] += 1
                self.total_counts[tr.cls] += 1
                move = (cur[0] - prev[0], cur[1] - prev[1])
                if self.calib.direction and move[0] * self.calib.direction[0] + move[1] * self.calib.direction[1] < 0:
                    events.append(self._event("WRONG_WAY", d, tr, "Phương tiện cắt vạch đếm ngược hướng quy định"))

            # 2) Vận tốc (chỉ xe trong vùng làn), dựa trên dịch chuyển ~1 giây gần nhất
            if point_in_polygon(cur, self.calib.roi) and len(tr.history) >= 2:
                t0, p0 = tr.history[0]
                dt = t - t0
                if dt >= 0.3:
                    px_per_s = math.dist(p0, cur) / dt
                    kmh = px_per_s * self.calib.meters_per_pixel * 3.6
                    if kmh < 150:  # loại nhiễu do ID tracker nhảy
                        frame_speeds.append(kmh)

                    # 3) Xe đứng yên bất thường
                    if kmh < 1.5:
                        tr.still_since = tr.still_since if tr.still_since is not None else t0
                        if not tr.stalled_reported and t - tr.still_since >= self.calib.stalled_seconds:
                            tr.stalled_reported = True
                            events.append(self._event("STALLED_VEHICLE", d, tr, f"Phương tiện dừng bất thường hơn {int(self.calib.stalled_seconds)} giây trong làn"))
                    else:
                        tr.still_since = None

        if frame_speeds:
            self.speed_samples.append(statistics.median(frame_speeds))
        self.occ_samples.append(self._occupancy([d.box for d in detections]))

        # Dọn track đã rời khung hình
        self.tracks = {k: v for k, v in self.tracks.items() if t - v.last_seen <= 3.0}
        return events

    def _occupancy(self, boxes: list[tuple[float, float, float, float]]) -> float:
        if not self._samples:
            return 0.0
        covered = sum(1 for (x, y) in self._samples if any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in boxes))
        return covered / len(self._samples)

    def _event(self, type_: str, d: Detection, tr: _Track, text: str) -> dict:
        severity = {"WRONG_WAY": "HIGH", "STALLED_VEHICLE": "MEDIUM"}[type_]
        return {
            "type": type_,
            "severity": severity,
            "cameraId": self.calib.camera_id,
            "description": f"{text} (ID theo dõi #{d.track_id}, loại: {tr.cls}).",
            "confidence": round(min(0.99, max(0.5, d.conf)), 2),
            "snapshot": {},
        }

    # -------- tổng hợp theo cửa sổ --------
    def window_ready(self, t: float) -> bool:
        return t - self.window_start >= self.window_seconds

    def flush(self, t: float, wall_ts_ms: int | None = None) -> dict:
        """Kết thúc cửa sổ, trả về số liệu theo định dạng API /api/ingest/metrics rồi mở cửa sổ mới."""
        span = max(1e-6, t - self.window_start)
        per_min = 60.0 / span
        metric = {
            "cameraId": self.calib.camera_id,
            "online": True,
            "flow": round(sum(self.counts.values()) * per_min),
            "avgSpeed": round(statistics.mean(self.speed_samples), 1) if self.speed_samples else self.calib.free_flow_kmh,
            "occupancy": round(min(1.0, statistics.mean(self.occ_samples)), 3) if self.occ_samples else 0.0,
            "vehicles": {k: round(v * per_min) for k, v in self.counts.items()},
        }
        if wall_ts_ms is not None:
            metric["ts"] = wall_ts_ms
        self._reset_window(t)
        return metric
