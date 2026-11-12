import pytest

from app.core.errors import AppError
from app.services.live_state import LiveState
from app.services.llm.traffic import compute_stats, rule_based_traffic_analysis

T0 = 1_794_449_280_000


def series(flows, speeds=None, levels=None):
    speeds = speeds or [40] * len(flows)
    levels = levels or [0] * len(flows)
    return [{"ts": T0 + i * 60_000, "flow": f, "avgSpeed": s, "level": lv} for i, (f, s, lv) in enumerate(zip(flows, speeds, levels))]


def test_needs_minimum_points():
    with pytest.raises(AppError):
        compute_stats(series([10, 20]))


def test_rising_trend_and_forecast():
    s = compute_stats(series([20, 22, 25, 30, 34, 40, 45, 50, 56]))
    assert s["trend"] == "tăng" and s["changePct"] > 10
    assert s["peakFlow"]["value"] == 56
    assert s["forecast15min"] > 56  # ngoại suy tiếp tục tăng


def test_detects_speed_drop_anomaly():
    speeds = [42, 41, 43, 40, 42, 41, 6, 42, 41, 43]
    s = compute_stats(series([50] * 10, speeds=speeds, levels=[0] * 6 + [3] + [0] * 3))
    kinds = [a["kind"] for a in s["anomalies"]]
    assert "tốc độ giảm đột ngột" in kinds
    assert s["slowest"]["value"] == 6
    assert s["congestedMinutes"] == 1


def test_rule_based_analysis_uses_computed_numbers():
    data = {
        "scope": "Ngã ba Huế",
        "layout": "interchange",
        "vehicleMixPct": {"motorbike": 70, "car": 20, "truck": 6, "bus": 4},
        "stats": compute_stats(series([80, 85, 90, 95, 100, 110], speeds=[12] * 6, levels=[2] * 6)),
    }
    r = rule_based_traffic_analysis(data)
    assert "Ngã ba Huế" in r["summary"]
    assert "110" in r["peaks"][0]
    assert any("vòng xuyến" in x for x in r["recommendations"])


def test_real_source_priority_window():
    live = LiveState()
    assert not live.is_real("CAM-01")
    live.mark_real("CAM-01")
    assert live.is_real("CAM-01")
    assert not live.is_real("CAM-01", within_seconds=-1)
