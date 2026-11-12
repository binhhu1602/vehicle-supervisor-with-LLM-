"""Mô hình dữ liệu (ORM) – ánh xạ 1-1 với các bảng PostgreSQL.

Ràng buộc toàn vẹn (CHECK, FK, UNIQUE) đặt ngay trong CSDL để dữ liệu luôn hợp lệ
dù được ghi từ API, job giả lập hay công cụ khác.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Sequence,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


ROLES_SQL = "'ADMIN','OPERATOR','VIEWER'"
STATUS_SQL = "'NEW','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','FALSE_ALARM'"
SEVERITY_SQL = "'LOW','MEDIUM','HIGH','CRITICAL'"
TYPE_SQL = "'ACCIDENT','CONGESTION','WRONG_WAY','RED_LIGHT','STALLED_VEHICLE','CAMERA_OFFLINE'"

incident_seq = Sequence("incident_seq", start=1001, metadata=Base.metadata)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(f"role IN ({ROLES_SQL})", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Camera(Base):
    __tablename__ = "cameras"
    __table_args__ = (CheckConstraint("layout IN ('crossroad','interchange')", name="ck_cameras_layout"),)

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    lanes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    base_flow: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    # Loại nút giao: 'crossroad' (ngã tư có đèn) | 'interchange' (nút giao khác mức)
    layout: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'crossroad'"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrafficMetric(Base):
    """Chuỗi thời gian số liệu giao thông. Có thể chuyển thành hypertable TimescaleDB khi dữ liệu lớn."""

    __tablename__ = "traffic_metrics"
    __table_args__ = (
        CheckConstraint("level BETWEEN 0 AND 3", name="ck_metrics_level"),
        CheckConstraint("occupancy BETWEEN 0 AND 1", name="ck_metrics_occupancy"),
        CheckConstraint("flow >= 0 AND avg_speed >= 0", name="ck_metrics_non_negative"),
        Index("ix_metrics_camera_ts", "camera_id", text("ts DESC")),
        Index("ix_metrics_ts", "ts"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False)
    flow: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_speed: Mapped[float] = mapped_column(Float, nullable=False)
    occupancy: Mapped[float] = mapped_column(Float, nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    motorbike: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    car: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    truck: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    bus: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(f"status IN ({STATUS_SQL})", name="ck_incidents_status"),
        CheckConstraint(f"severity IN ({SEVERITY_SQL})", name="ck_incidents_severity"),
        CheckConstraint(f"type IN ({TYPE_SQL})", name="ck_incidents_type"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_incidents_confidence"),
        Index("ix_incidents_status", "status"),
        Index("ix_incidents_created_at", text("created_at DESC")),
        Index("ix_incidents_camera", "camera_id"),
    )

    id: Mapped[str] = mapped_column(
        String(20), primary_key=True, server_default=text("'INC-' || nextval('incident_seq')")
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'NEW'"))
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    ai_analysis: Mapped[dict | None] = mapped_column(JSONB)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    camera: Mapped[Camera] = relationship(lazy="joined", innerjoin=True)
    events: Mapped[list["IncidentEvent"]] = relationship(
        back_populates="incident", order_by="IncidentEvent.at", lazy="selectin", cascade="all, delete-orphan"
    )


class IncidentEvent(Base):
    """Nhật ký xử lý sự cố (dòng thời gian, phục vụ truy vết/kiểm toán)."""

    __tablename__ = "incident_events"
    __table_args__ = (Index("ix_incident_events_incident", "incident_id", "at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))

    incident: Mapped[Incident] = relationship(back_populates="events")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by: Mapped[str | None] = mapped_column(String(120))


class LlmRequest(Base):
    """Nhật ký gọi LLM: theo dõi chi phí token, độ trễ, lỗi (NFR-11)."""

    __tablename__ = "llm_requests"
    __table_args__ = (Index("ix_llm_requests_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # chat | analyze | summarize
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str] = mapped_column(String(60), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # ok | error | refusal
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
