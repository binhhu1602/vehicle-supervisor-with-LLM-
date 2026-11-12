"""Phát hiện + bám vết phương tiện bằng YOLO11 (Ultralytics) và ByteTrack.

- YOLO11n/s: mô hình phát hiện đối tượng thời gian thực, huấn luyện sẵn trên COCO
  (có lớp motorcycle, car, bus, truck). Nên tinh chỉnh (fine-tune) thêm bằng ảnh giao thông
  Việt Nam để nhận xe máy dày đặc tốt hơn – chỉ cần đổi file trọng số `--weights`.
- ByteTrack: gán ID ổn định cho từng xe giữa các khung hình → mỗi xe chỉ được đếm 1 lần.
"""

from __future__ import annotations

from trafficeye_vision.analytics import COCO_TO_VEHICLE, Detection


class YoloTracker:
    def __init__(self, weights: str = "yolo11n.pt", conf: float = 0.3, imgsz: int = 640, device: str | None = None):
        from ultralytics import YOLO  # import trễ: phần phân tích/kiểm thử không cần torch

        self.model = YOLO(weights)
        self.conf = conf
        self.imgsz = imgsz
        self.device = device

    def track(self, frame) -> list[Detection]:
        result = self.model.track(
            frame,
            persist=True,  # giữ trạng thái tracker giữa các khung hình
            tracker="bytetrack.yaml",
            classes=list(COCO_TO_VEHICLE),
            conf=self.conf,
            imgsz=self.imgsz,
            device=self.device,
            verbose=False,
        )[0]
        boxes = result.boxes
        if boxes is None or boxes.id is None:
            return []
        out = []
        for xyxy, tid, cls, conf in zip(boxes.xyxy.tolist(), boxes.id.int().tolist(), boxes.cls.int().tolist(), boxes.conf.tolist()):
            vehicle = COCO_TO_VEHICLE.get(cls)
            if vehicle:
                out.append(Detection(track_id=tid, cls=vehicle, box=tuple(xyxy), conf=conf))
        return out
