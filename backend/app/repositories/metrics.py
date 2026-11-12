"""Truy vấn chuỗi thời gian số liệu giao thông."""

from datetime import datetime

from sqlalchemy import Float, cast, delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TrafficMetric


async def insert_batch(session: AsyncSession, rows: list[dict]) -> None:
    if rows:
        await session.execute(insert(TrafficMetric), rows)


async def recent_batches(session: AsyncSession, since: datetime) -> list[TrafficMetric]:
    """Số liệu kể từ `since`, sắp theo thời gian – dùng để khôi phục LiveState khi khởi động lại."""
    stmt = select(TrafficMetric).where(TrafficMetric.ts >= since).order_by(TrafficMetric.ts, TrafficMetric.camera_id)
    return list(await session.scalars(stmt))


async def history_per_minute(session: AsyncSession, since: datetime, camera_id: str | None = None) -> list[dict]:
    """Gộp theo phút: tổng lưu lượng TB, tốc độ TB có trọng số, mức ùn tắc TB."""
    minute = func.date_trunc("minute", TrafficMetric.ts).label("minute")
    stmt = (
        select(
            minute,
            func.avg(TrafficMetric.flow).label("flow"),
            (func.sum(TrafficMetric.avg_speed * TrafficMetric.flow) / func.nullif(func.sum(TrafficMetric.flow), 0)).label("avg_speed"),
            func.avg(cast(TrafficMetric.level, Float)).label("level"),
        )
        .where(TrafficMetric.ts >= since, TrafficMetric.online)
        .group_by(minute)
        .order_by(minute)
    )
    if camera_id:
        stmt = stmt.where(TrafficMetric.camera_id == camera_id)
    rows = (await session.execute(stmt)).all()
    return [
        {
            "ts": int(r.minute.timestamp() * 1000),
            "flow": round(float(r.flow or 0)),
            "avgSpeed": round(float(r.avg_speed or 0), 1),
            "level": round(float(r.level or 0), 2),
        }
        for r in rows
    ]


async def camera_stats(session: AsyncSession, since: datetime) -> list[dict]:
    m = TrafficMetric
    stmt = (
        select(
            m.camera_id,
            func.avg(m.flow).label("avg_flow"),
            func.avg(m.avg_speed).label("avg_speed"),
            func.min(m.avg_speed).label("min_speed"),
            func.avg(cast(m.level, Float)).label("avg_level"),
            func.count().label("samples"),
            func.sum(m.motorbike).label("motorbike"),
            func.sum(m.car).label("car"),
            func.sum(m.truck).label("truck"),
            func.sum(m.bus).label("bus"),
        )
        .where(m.ts >= since, m.online)
        .group_by(m.camera_id)
        .order_by(m.camera_id)
    )
    return [
        {
            "cameraId": r.camera_id,
            "avgFlow": round(float(r.avg_flow)),
            "avgSpeed": round(float(r.avg_speed), 1),
            "minSpeed": round(float(r.min_speed), 1),
            "avgLevel": round(float(r.avg_level), 2),
            "samples": r.samples,
            "vehicles": {"motorbike": r.motorbike, "car": r.car, "truck": r.truck, "bus": r.bus},
        }
        for r in (await session.execute(stmt)).all()
    ]


async def hourly_congestion(session: AsyncSession, since: datetime) -> list[dict]:
    hour = func.date_trunc("hour", TrafficMetric.ts).label("hour")
    stmt = (
        select(
            hour,
            (func.sum(cast(TrafficMetric.level, Float) / 3 * TrafficMetric.flow) / func.nullif(func.sum(TrafficMetric.flow), 0) * 100).label("idx"),
            func.avg(TrafficMetric.flow).label("flow"),
        )
        .where(TrafficMetric.ts >= since, TrafficMetric.online)
        .group_by(hour)
        .order_by(hour)
    )
    return [
        {"ts": int(r.hour.timestamp() * 1000), "congestionIndex": round(float(r.idx or 0)), "avgFlow": round(float(r.flow or 0))}
        for r in (await session.execute(stmt)).all()
    ]


async def delete_older_than(session: AsyncSession, cutoff: datetime) -> int:
    result = await session.execute(delete(TrafficMetric).where(TrafficMetric.ts < cutoff))
    return result.rowcount or 0
