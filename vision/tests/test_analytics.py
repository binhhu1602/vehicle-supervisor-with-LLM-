"""Kiểm thử logic trích xuất chỉ số bằng quỹ đạo tổng hợp (không cần mô hình/GPU)."""

from trafficeye_vision.analytics import Calibration, Detection, TrafficAnalyzer, point_in_polygon, segments_intersect

W, H = 1000, 600
FPS = 10


def calib(**over):
    base = dict(
        camera_id="CAM-05",
        count_line=((0, 300), (W, 300)),
        roi=[(0, 100), (W, 100), (W, H), (0, H)],
        meters_per_pixel=0.05,
        direction=(0, 1),  # đi xuống
        stalled_seconds=5,
    )
    base.update(over)
    return Calibration(**base)


def box_at(x, y, w=40, h=30):
    return (x - w / 2, y - h, x + w / 2, y)  # anchor = (x, y)


def drive(analyzer, tracks, seconds):
    """tracks: {id: (cls, x, y0, vy px/s)} – chạy mô phỏng, trả về các sự kiện."""
    events = []
    for k in range(int(seconds * FPS)):
        t = k / FPS
        dets = [Detection(tid, cls, box_at(x, y0 + vy * t)) for tid, (cls, x, y0, vy) in tracks.items() if 0 <= y0 + vy * t <= H]
        events += analyzer.update(t, dets)
    return events


def test_geometry():
    assert segments_intersect((5, 0), (5, 10), (0, 5), (10, 5))
    assert not segments_intersect((5, 0), (5, 4), (0, 5), (10, 5))
    assert point_in_polygon((5, 5), [(0, 0), (10, 0), (10, 10), (0, 10)])
    assert not point_in_polygon((15, 5), [(0, 0), (10, 0), (10, 10), (0, 10)])


def test_counts_each_vehicle_once_by_class_and_reports_per_minute():
    a = TrafficAnalyzer(calib(), window_seconds=10)
    tracks = {1: ("car", 200, 150, 100), 2: ("motorbike", 400, 120, 120), 3: ("bus", 600, 160, 90), 4: ("motorbike", 800, 50, 0)}
    drive(a, tracks, 10)
    m = a.flush(10)
    assert m["vehicles"] == {"motorbike": 6, "car": 6, "truck": 0, "bus": 6}  # 1 xe/10 s = 6 xe/phút
    assert m["flow"] == 18  # xe số 4 đứng yên phía trên vạch → không được đếm


def test_speed_from_pixel_motion():
    a = TrafficAnalyzer(calib(), window_seconds=5)
    drive(a, {1: ("car", 500, 110, 200)}, 2.4)  # 200 px/s × 0.05 m/px = 10 m/s = 36 km/h
    m = a.flush(5)
    assert 33 <= m["avgSpeed"] <= 39


def test_empty_road_reports_free_flow_not_congestion():
    a = TrafficAnalyzer(calib(free_flow_kmh=45), window_seconds=10)
    drive(a, {}, 10)
    m = a.flush(10)
    assert m["flow"] == 0 and m["avgSpeed"] == 45 and m["occupancy"] == 0


def test_wrong_way_detected():
    a = TrafficAnalyzer(calib(), window_seconds=10)
    events = drive(a, {7: ("motorbike", 300, 500, -150)}, 3)  # đi lên, ngược hướng quy định
    assert [e["type"] for e in events] == ["WRONG_WAY"]
    assert events[0]["cameraId"] == "CAM-05"


def test_stalled_vehicle_detected_once():
    a = TrafficAnalyzer(calib(), window_seconds=30)
    events = drive(a, {9: ("truck", 500, 400, 0)}, 12)
    assert [e["type"] for e in events] == ["STALLED_VEHICLE"]


def test_occupancy_grows_with_queue():
    a = TrafficAnalyzer(calib(), window_seconds=5)
    queue = {i: ("car", 100 + i * 90, 400 + (i % 2) * 120, 0) for i in range(10)}
    drive(a, queue, 1)
    busy = a.flush(1)["occupancy"]
    drive(a, {1: ("car", 500, 400, 0)}, 1)
    light = a.flush(1)["occupancy"]
    assert busy > light > 0
