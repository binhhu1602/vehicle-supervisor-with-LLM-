"""Worker AI Vision: đọc video/RTSP → YOLO11 + ByteTrack → chỉ số giao thông → backend TrafficEye.

Ví dụ:
  python -m trafficeye_vision.worker --source samples/traffic-demo.mp4 --camera CAM-05 --loop --realtime
  python -m trafficeye_vision.worker --source rtsp://user:pass@10.0.0.5/stream1 --camera CAM-01 --calib calibration/CAM-01.json
  python -m trafficeye_vision.worker --source video.mp4 --camera CAM-02 --dry-run --save out.mp4   # chỉ in số liệu + lưu video kết quả

Mỗi `--interval` giây: POST /api/ingest/metrics (lưu lượng, tốc độ, chiếm dụng, cơ cấu phương tiện).
Sự cố phát hiện được (đi ngược chiều, xe dừng bất thường): POST /api/ingest/incidents.
Mỗi `--frame-every` giây: POST /api/ingest/frames/{camera} – ảnh JPEG đã vẽ khung nhận diện để điều hành viên xem.
LLM KHÔNG nhận hình ảnh, chỉ nhận số liệu tổng hợp.
"""

from __future__ import annotations

import argparse
import json
import logging
import time

import httpx

from trafficeye_vision.analytics import VEHICLE_KEYS, Calibration, Detection, TrafficAnalyzer

log = logging.getLogger("trafficeye.vision")

# Màu khung theo loại (BGR) – cùng bảng màu phân loại với giao diện
BOX_COLORS = {"motorbike": (214, 120, 42), "car": (52, 104, 235), "truck": (122, 175, 27), "bus": (0, 161, 237)}
LABELS = {"motorbike": "xe may", "car": "o to", "truck": "xe tai", "bus": "xe buyt"}


class IngestClient:
    def __init__(self, api: str, key: str, dry_run: bool = False):
        self.dry_run = dry_run
        self.http = httpx.Client(base_url=api.rstrip("/"), headers={"X-Ingest-Key": key}, timeout=10)

    def _post(self, path: str, **kw) -> None:
        if self.dry_run:
            if "json" in kw:
                print(f"[dry-run] POST {path} {json.dumps(kw['json'], ensure_ascii=False)}")
            return
        try:
            r = self.http.post(path, **kw)
            if r.status_code >= 400:
                log.warning("Backend từ chối %s: %s %s", path, r.status_code, r.text[:200])
        except httpx.HTTPError as exc:  # mất mạng không làm dừng worker
            log.warning("Không gửi được %s: %s", path, exc)

    def send_metric(self, metric: dict) -> None:
        self._post("/api/ingest/metrics", json=[metric])

    def send_incident(self, incident: dict) -> None:
        self._post("/api/ingest/incidents", json=incident)

    def send_frame(self, camera_id: str, jpeg: bytes) -> None:
        self._post(f"/api/ingest/frames/{camera_id}", content=jpeg, headers={"Content-Type": "image/jpeg"})


def draw_overlay(frame, calib: Calibration, detections: list[Detection], analyzer: TrafficAnalyzer, last_metric: dict | None, fps: float):
    """Vẽ vùng làn, vạch đếm, khung nhận diện + ID bám vết, bảng số liệu (chữ không dấu vì font OpenCV)."""
    import cv2
    import numpy as np

    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.fillPoly(overlay, [np.array(calib.roi, dtype=np.int32)], (60, 200, 255))
    frame = cv2.addWeighted(overlay, 0.12, frame, 0.88, 0)
    cv2.polylines(frame, [np.array(calib.roi, dtype=np.int32)], True, (60, 200, 255), 1)
    (x1, y1), (x2, y2) = calib.count_line
    cv2.line(frame, (int(x1), int(y1)), (int(x2), int(y2)), (40, 40, 230), 2)
    cv2.putText(frame, "VACH DEM", (int(x1) + 6, int(y1) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 40, 230), 1, cv2.LINE_AA)

    for d in detections:
        bx1, by1, bx2, by2 = map(int, d.box)
        c = BOX_COLORS.get(d.cls, (255, 255, 255))
        counted = analyzer.tracks.get(d.track_id) and analyzer.tracks[d.track_id].counted
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), c, 2)
        label = f"#{d.track_id} {LABELS.get(d.cls, d.cls)} {d.conf:.2f}" + (" v" if counted else "")
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
        cv2.rectangle(frame, (bx1, by1 - th - 6), (bx1 + tw + 4, by1), c, -1)
        cv2.putText(frame, label, (bx1 + 2, by1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
        # vệt di chuyển (ByteTrack)
        tr = analyzer.tracks.get(d.track_id)
        if tr and len(tr.history) > 1:
            pts = np.array([p for _, p in tr.history], dtype=np.int32)
            cv2.polylines(frame, [pts], False, c, 1)

    # Bảng số liệu
    panel_w = 250
    cv2.rectangle(frame, (8, 8), (8 + panel_w, 128), (20, 24, 22), -1)
    tot = analyzer.total_counts
    lines = [
        f"{calib.camera_id}  YOLO11 + ByteTrack  {fps:4.1f} fps",
        f"Da dem: {sum(tot.values())} xe  (dang thay: {len(detections)})",
        "  ".join(f"{LABELS[k]}:{tot[k]}" for k in VEHICLE_KEYS),
    ]
    if last_metric:
        lines += [f"Luu luong: {last_metric['flow']} xe/phut", f"Toc do TB: {last_metric['avgSpeed']} km/h  Chiem dung: {round(last_metric['occupancy'] * 100)}%"]
    for i, text in enumerate(lines):
        cv2.putText(frame, text, (16, 30 + i * 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (230, 240, 235), 1, cv2.LINE_AA)
    cv2.putText(frame, time.strftime("%H:%M:%S"), (w - 90, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return frame


def run(args) -> None:
    import cv2

    from trafficeye_vision.detector import YoloTracker

    source = int(args.source) if args.source.isdigit() else args.source
    is_file = isinstance(source, str) and not source.lower().startswith(("rtsp://", "http://", "https://"))
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Không mở được nguồn video: {args.source}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    calib = Calibration.load(args.calib) if args.calib else Calibration.default(args.camera, width, height)
    calib.camera_id = args.camera
    analyzer = TrafficAnalyzer(calib, window_seconds=args.interval)
    tracker = YoloTracker(args.weights, conf=args.conf, imgsz=args.imgsz, device=args.device)
    client = IngestClient(args.api, args.key, dry_run=args.dry_run)
    writer = None
    if args.save:
        writer = cv2.VideoWriter(args.save, cv2.VideoWriter_fourcc(*"mp4v"), fps / max(1, args.stride), (width, height))
    log.info("Bắt đầu %s: %dx%d @ %.1f fps, cửa sổ %ss, mô hình %s", args.camera, width, height, fps, args.interval, args.weights)

    frame_idx, t_offset, started = 0, 0.0, time.time()
    last_frame_sent, last_metric, proc_fps, tick = -1e9, None, 0.0, time.time()
    while True:
        ok, frame = cap.read()
        if not ok:
            if is_file and args.loop:  # phát lặp video demo: thời gian tiếp tục tăng
                t_offset += frame_idx / fps
                frame_idx = 0
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            break
        frame_idx += 1
        if args.stride > 1 and frame_idx % args.stride:
            continue
        loop_start = time.time()
        # Video file: thời gian của video (tái lập được); luồng trực tiếp: đồng hồ thật
        t = t_offset + frame_idx / fps if is_file else time.time() - started

        detections = tracker.track(frame)
        for event in analyzer.update(t, detections):
            log.info("Sự cố: %s", event["description"])
            client.send_incident(event)
        if analyzer.window_ready(t):
            last_metric = analyzer.flush(t)
            log.info("Số liệu: %s", last_metric)
            client.send_metric(last_metric)

        now = time.time()
        proc_fps = 0.9 * proc_fps + 0.1 * (1 / max(1e-6, now - tick))
        tick = now
        need_frame = args.show or writer or args.snapshot or (args.frame_every > 0 and now - last_frame_sent >= args.frame_every)
        if need_frame:
            annotated = draw_overlay(frame, calib, detections, analyzer, last_metric, proc_fps)
            if args.frame_every > 0 and now - last_frame_sent >= args.frame_every and not args.dry_run:
                small = cv2.resize(annotated, (min(960, width), int(height * min(960, width) / width)))
                ok_jpg, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok_jpg:
                    client.send_frame(args.camera, buf.tobytes())
                last_frame_sent = now
            if writer:
                writer.write(annotated)
            if args.snapshot:
                cv2.imwrite(args.snapshot, annotated)
            if args.show:
                cv2.imshow("TrafficEye AI Vision", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        if args.realtime and is_file:  # giữ đúng tốc độ phát của video
            time.sleep(max(0.0, args.stride / fps - (time.time() - loop_start)))
        if args.max_seconds and t >= args.max_seconds:
            break

    cap.release()
    if writer:
        writer.release()
    if args.show:
        cv2.destroyAllWindows()
    log.info("Kết thúc. Tổng đã đếm: %s", analyzer.total_counts)


def main() -> None:
    p = argparse.ArgumentParser(description="TrafficEye AI Vision worker (YOLO11 + ByteTrack)")
    p.add_argument("--source", required=True, help="đường dẫn video, URL RTSP/HTTP, hoặc số thứ tự webcam")
    p.add_argument("--camera", required=True, help="mã camera trong hệ thống, vd. CAM-05")
    p.add_argument("--calib", help="file JSON hiệu chỉnh (vạch đếm, vùng làn, mét/pixel, hướng đi)")
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--key", default="dev-ingest-key", help="INGEST_API_KEY của backend")
    p.add_argument("--weights", default="yolo11n.pt", help="yolo11n.pt (nhanh) | yolo11s.pt (chính xác hơn) | mô hình tinh chỉnh")
    p.add_argument("--conf", type=float, default=0.3)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--device", default=None, help="cpu | 0 (GPU CUDA)")
    p.add_argument("--interval", type=float, default=10.0, help="độ dài cửa sổ tổng hợp số liệu (giây)")
    p.add_argument("--frame-every", type=float, default=1.0, help="gửi ảnh nhận diện lên backend mỗi N giây (0 = tắt)")
    p.add_argument("--stride", type=int, default=1, help="xử lý 1/N khung hình để giảm tải CPU")
    p.add_argument("--loop", action="store_true", help="phát lặp video file (demo liên tục)")
    p.add_argument("--realtime", action="store_true", help="phát video file theo tốc độ thật")
    p.add_argument("--max-seconds", type=float, default=0, help="dừng sau N giây video (0 = không giới hạn)")
    p.add_argument("--show", action="store_true", help="mở cửa sổ hiển thị khung nhận diện")
    p.add_argument("--save", help="lưu video kết quả đã vẽ khung nhận diện (.mp4)")
    p.add_argument("--snapshot", help="ghi khung hình kết quả mới nhất ra file ảnh (.jpg/.png)")
    p.add_argument("--dry-run", action="store_true", help="không gửi backend, chỉ in số liệu")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(args)


if __name__ == "__main__":
    main()
