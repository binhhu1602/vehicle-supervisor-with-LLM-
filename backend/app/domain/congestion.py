"""Quy tắc phân loại mức ùn tắc (0..3) từ tốc độ trung bình và tỉ lệ chiếm dụng làn."""

from pydantic import BaseModel, model_validator


class Thresholds(BaseModel):
    jamSpeed: float = 10  # dưới ngưỡng + chiếm dụng cao → tắc nghiêm trọng
    slowSpeed: float = 20
    busySpeed: float = 30
    highOccupancy: float = 0.75

    @model_validator(mode="after")
    def _check_order(self) -> "Thresholds":
        if not (0 < self.jamSpeed < self.slowSpeed < self.busySpeed):
            raise ValueError("Ngưỡng tốc độ phải thỏa: 0 < jamSpeed < slowSpeed < busySpeed")
        if not (0 < self.highOccupancy <= 1):
            raise ValueError("highOccupancy phải trong khoảng (0, 1]")
        return self


DEFAULT_THRESHOLDS = Thresholds()


def congestion_level(avg_speed: float, occupancy: float, t: Thresholds = DEFAULT_THRESHOLDS) -> int:
    if avg_speed < t.jamSpeed and occupancy >= t.highOccupancy:
        return 3
    if avg_speed < t.slowSpeed or occupancy >= t.highOccupancy:
        return 2
    if avg_speed < t.busySpeed or occupancy >= 0.5:
        return 1
    return 0


def network_congestion_index(items: list[tuple[int, int]]) -> int:
    """Chỉ số ùn tắc toàn mạng 0..100, trọng số theo lưu lượng. items = [(level, flow), ...]."""
    if not items:
        return 0
    total = sum(flow for _, flow in items) or 1
    weighted = sum(level / 3 * flow for level, flow in items)
    return round(weighted / total * 100)
