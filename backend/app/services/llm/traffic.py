"""Phân tích LƯU LƯỢNG theo thời gian cho một nút giao (hoặc toàn mạng).

Nguyên tắc chia việc:
  1. Mô hình thị giác (YOLO + ByteTrack) TRÍCH XUẤT số liệu từ video → PostgreSQL.
  2. Python TÍNH thống kê chính xác (xu hướng, đỉnh, bất thường, dự báo tuyến tính) – tất định, kiểm thử được.
  3. LLM chỉ DIỄN GIẢI các con số đã tính + đề xuất điều hành → không bịa số liệu.
"""

from datetime import UTC, datetime, timedelta
from statistics import mean, pstdev

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.repositories import metrics as metrics_repo
from app.services.live_state import LiveState

MIN_POINTS = 3


def _hhmm(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000).astimezone().strftime("%H:%M")


def _slope(values: list[float]) -> float:
    """Hệ số góc hồi quy tuyến tính (đơn vị / phút)."""
    n = len(values)
    if n < 2:
        return 0.0
    xs = range(n)
    mx, my = (n - 1) / 2, mean(values)
    den = sum((x - mx) ** 2 for x in xs) or 1
    return sum((x - mx) * (y - my) for x, y in zip(xs, values)) / den


def compute_stats(series: list[dict]) -> dict:
    """Thống kê tất định từ chuỗi số liệu theo phút [{ts, flow, avgSpeed, level}]."""
    if len(series) < MIN_POINTS:
        raise AppError(f"Chưa đủ dữ liệu để phân tích (cần ít nhất {MIN_POINTS} phút số liệu)")
    flows = [p["flow"] for p in series]
    speeds = [p["avgSpeed"] for p in series]
    third = max(1, len(series) // 3)
    early, late = mean(flows[:third]), mean(flows[-third:])
    change_pct = round((late - early) / early * 100, 1) if early else 0.0
    trend = "tăng" if change_pct > 10 else "giảm" if change_pct < -10 else "ổn định"

    f_mu, f_sd = mean(flows), pstdev(flows)
    s_mu, s_sd = mean(speeds), pstdev(speeds)
    anomalies = []
    for p in series:
        if f_sd and p["flow"] > f_mu + 2 * f_sd:
            anomalies.append({"time": _hhmm(p["ts"]), "kind": "lưu lượng tăng đột biến", "value": p["flow"], "unit": "xe/phút"})
        if s_sd and p["avgSpeed"] < s_mu - 2 * s_sd:
            anomalies.append({"time": _hhmm(p["ts"]), "kind": "tốc độ giảm đột ngột", "value": p["avgSpeed"], "unit": "km/h"})

    recent = flows[-10:]
    slope = _slope(recent)
    peak = max(series, key=lambda p: p["flow"])
    slowest = min(series, key=lambda p: p["avgSpeed"])
    return {
        "points": len(series),
        "from": _hhmm(series[0]["ts"]),
        "to": _hhmm(series[-1]["ts"]),
        "avgFlow": round(f_mu, 1),
        "avgSpeed": round(s_mu, 1),
        "trend": trend,
        "changePct": change_pct,
        "peakFlow": {"time": _hhmm(peak["ts"]), "value": peak["flow"]},
        "slowest": {"time": _hhmm(slowest["ts"]), "value": slowest["avgSpeed"]},
        "congestedMinutes": sum(1 for p in series if p["level"] >= 1.5),
        "anomalies": anomalies[:5],
        "forecast15min": max(0, round(recent[-1] + slope * 15)),
        "slopePerMin": round(slope, 2),
    }


async def build_traffic_data(session: AsyncSession, live: LiveState, camera_id: str | None, minutes: int) -> dict:
    if camera_id and camera_id not in live.cameras:
        raise NotFoundError(f"Không tồn tại camera {camera_id}")
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    series = await metrics_repo.history_per_minute(session, since, camera_id)
    stats_rows = await metrics_repo.camera_stats(session, since)
    rows = [r for r in stats_rows if not camera_id or r["cameraId"] == camera_id]
    vehicles = {k: sum(r["vehicles"][k] or 0 for r in rows) for k in ("motorbike", "car", "truck", "bus")}
    total = sum(vehicles.values()) or 1
    cam = live.cameras.get(camera_id) if camera_id else None
    return {
        "scope": cam["name"] if cam else "Toàn mạng lưới",
        "cameraId": camera_id,
        "layout": cam.get("layout") if cam else None,
        "minutes": minutes,
        "dataSource": ("AI Vision (camera thật)" if live.is_real(camera_id) else "bộ giả lập") if camera_id else "tổng hợp",
        "vehicleMixPct": {k: round(v / total * 100, 1) for k, v in vehicles.items()},
        "series": series,
        "stats": compute_stats(series),
    }


def rule_based_traffic_analysis(data: dict) -> dict:
    s = data["stats"]
    mix = data["vehicleMixPct"]
    trend_text = {"tăng": f"đang **tăng** ({s['changePct']:+}%)", "giảm": f"đang **giảm** ({s['changePct']:+}%)", "ổn định": "**ổn định**"}[s["trend"]]
    recs = []
    if s["congestedMinutes"] >= max(2, s["points"] // 4):
        recs.append(
            "Điều tiết luồng vào vòng xuyến, ưu tiên xe đi thẳng dùng cầu vượt"
            if data.get("layout") == "interchange"
            else "Kéo dài pha xanh cho hướng ùn thêm 15–20 giây và theo dõi hàng chờ"
        )
    if s["trend"] == "tăng" and s["forecast15min"] > s["avgFlow"] * 1.2:
        recs.append("Chuẩn bị phương án phân luồng sớm vì lưu lượng dự báo tiếp tục tăng trong 15 phút tới")
    if s["anomalies"]:
        recs.append("Kiểm tra video tại các thời điểm bất thường để xác định nguyên nhân (va chạm, xe dừng, lỗi camera)")
    if mix.get("truck", 0) + mix.get("bus", 0) > 15:
        recs.append("Tỉ lệ xe lớn cao – cân nhắc phân luồng xe tải vào giờ thấp điểm")
    if not recs:
        recs.append("Giao thông ổn định, tiếp tục giám sát")
    return {
        "summary": f"Trong {s['points']} phút ({s['from']}–{s['to']}) tại {data['scope']}, lưu lượng trung bình {s['avgFlow']} xe/phút, tốc độ trung bình {s['avgSpeed']} km/h; xu hướng {trend_text}.",
        "trend": f"Lưu lượng {s['trend']} ({s['changePct']:+}% so với đầu giai đoạn); có {s['congestedMinutes']} phút ở mức ùn ứ trở lên.",
        "peaks": [f"Lưu lượng cao nhất {s['peakFlow']['value']} xe/phút lúc {s['peakFlow']['time']}", f"Tốc độ thấp nhất {s['slowest']['value']} km/h lúc {s['slowest']['time']}"],
        "anomalies": [f"{a['time']}: {a['kind']} ({a['value']} {a['unit']})" for a in s["anomalies"]],
        "forecast": f"Ước tính khoảng {s['forecast15min']} xe/phút sau 15 phút (ngoại suy tuyến tính, độ dốc {s['slopePerMin']:+} xe/phút mỗi phút).",
        "recommendations": recs,
    }
