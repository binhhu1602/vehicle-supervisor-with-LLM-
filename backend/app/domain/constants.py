"""Khái niệm nghiệp vụ – phải khớp với frontend/src/domain/constants.js (hợp đồng dữ liệu)."""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "ADMIN"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"


class IncidentStatus(StrEnum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    FALSE_ALARM = "FALSE_ALARM"


class IncidentType(StrEnum):
    ACCIDENT = "ACCIDENT"
    CONGESTION = "CONGESTION"
    WRONG_WAY = "WRONG_WAY"
    RED_LIGHT = "RED_LIGHT"
    STALLED_VEHICLE = "STALLED_VEHICLE"
    CAMERA_OFFLINE = "CAMERA_OFFLINE"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


SEVERITY_RANK = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3, Severity.CRITICAL: 4}

INCIDENT_TYPE_LABEL = {
    IncidentType.ACCIDENT: "Tai nạn giao thông",
    IncidentType.CONGESTION: "Ùn tắc kéo dài",
    IncidentType.WRONG_WAY: "Đi ngược chiều",
    IncidentType.RED_LIGHT: "Vượt đèn đỏ",
    IncidentType.STALLED_VEHICLE: "Phương tiện chết máy",
    IncidentType.CAMERA_OFFLINE: "Mất tín hiệu camera",
}

SEVERITY_LABEL = {
    Severity.LOW: "Thấp",
    Severity.MEDIUM: "Trung bình",
    Severity.HIGH: "Cao",
    Severity.CRITICAL: "Khẩn cấp",
}

CONGESTION_LABEL = {0: "Thông thoáng", 1: "Đông xe", 2: "Ùn ứ", 3: "Ùn tắc nghiêm trọng"}

VEHICLE_KEYS = ("motorbike", "car", "truck", "bus")


class RealtimeEvent(StrEnum):
    """Tên sự kiện WebSocket – trùng với REALTIME_EVENTS của frontend."""

    CONNECTION = "connection:status"
    SNAPSHOT = "traffic:snapshot"
    METRICS = "metrics:update"
    INCIDENT_NEW = "incident:new"
    INCIDENT_UPDATE = "incident:update"
    CAMERA_FRAME = "camera:frame"  # có khung hình mới từ AI Vision (chỉ gửi mốc thời gian, không gửi ảnh)
