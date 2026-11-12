"""DTO (Pydantic) – hợp đồng dữ liệu với frontend.

JSON dùng camelCase và thời gian dạng epoch milliseconds để khớp với frontend/src (xem docs/03-kien-truc.md).
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.domain.constants import IncidentStatus, IncidentType, Role, Severity
from app.domain.incident_state_machine import TRANSITIONS


def to_ms(dt: datetime | None) -> int | None:
    return int(dt.timestamp() * 1000) if dt else None


def from_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=UTC)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Xác thực ----------
class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)


class UserOut(CamelModel):
    id: int
    username: str
    name: str
    role: Role


class LoginResponse(CamelModel):
    user: UserOut
    token: str


# ---------- Camera & số liệu ----------
class CameraOut(CamelModel):
    id: str
    name: str
    district: str
    lat: float
    lng: float
    lanes: int
    base_flow: int
    layout: Literal["crossroad", "interchange"] = "crossroad"


class Vehicles(BaseModel):
    motorbike: int = Field(0, ge=0)
    car: int = Field(0, ge=0)
    truck: int = Field(0, ge=0)
    bus: int = Field(0, ge=0)


class MetricOut(CamelModel):
    camera_id: str
    ts: int
    online: bool
    flow: int
    avg_speed: float
    occupancy: float
    level: int
    vehicles: Vehicles


class MetricIn(CamelModel):
    """Số liệu do hệ thống AI Vision gửi lên. `level` có thể bỏ trống – server tự tính theo ngưỡng."""

    camera_id: str
    ts: int | None = None
    online: bool = True
    flow: int = Field(ge=0)
    avg_speed: float = Field(ge=0, le=200)
    occupancy: float = Field(ge=0, le=1)
    level: int | None = Field(None, ge=0, le=3)
    vehicles: Vehicles = Vehicles()


# ---------- Sự cố ----------
class Location(BaseModel):
    lat: float
    lng: float


class TimelineEntry(BaseModel):
    at: int
    action: str
    from_: str | None = Field(None, alias="from", serialization_alias="from")
    to: str
    actor: str
    note: str = ""

    model_config = ConfigDict(populate_by_name=True)


class IncidentOut(CamelModel):
    id: str
    type: IncidentType
    severity: Severity
    status: IncidentStatus
    camera_id: str
    camera_name: str
    district: str
    location: Location
    description: str
    confidence: float
    snapshot: dict
    created_at: int
    updated_at: int
    timeline: list[TimelineEntry]


class IncidentIn(CamelModel):
    type: IncidentType
    severity: Severity
    camera_id: str
    description: str = Field(min_length=1, max_length=2000)
    confidence: float = Field(ge=0, le=1)
    snapshot: dict = {}


class TransitionRequest(BaseModel):
    action: Literal[tuple(TRANSITIONS.keys())]  # type: ignore[valid-type]
    note: str = Field("", max_length=1000)


# ---------- LLM ----------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    # Frontend có gửi kèm context, nhưng server KHÔNG tin dữ liệu phía client:
    # ngữ cảnh luôn được dựng lại từ dữ liệu thời gian thực trên server.
    context: dict | None = None


class AnalyzeRequestIncident(BaseModel):
    id: str


class AnalyzeRequest(BaseModel):
    incident: AnalyzeRequestIncident
    refresh: bool = False


class IncidentAnalysis(CamelModel):
    summary: str
    probable_cause: str
    impact: str
    recommended_actions: list[str]
    confidence: float
    model: str


class TrafficAnalysisRequest(CamelModel):
    camera_id: str | None = None  # None = toàn mạng lưới
    minutes: int = Field(60, ge=5, le=24 * 60)


class TrafficAnalysis(CamelModel):
    scope: str
    data_source: str
    summary: str
    trend: str
    peaks: list[str]
    anomalies: list[str]
    forecast: str
    recommendations: list[str]
    model: str
    stats: dict
    series: list[dict]


class SummarizeResponse(BaseModel):
    text: str
