"""Chuyển đối tượng ORM → dict theo hợp đồng JSON của frontend (camelCase, epoch ms)."""

from app.db.models import Camera, Incident, TrafficMetric
from app.schemas import to_ms


def camera_to_dict(c: Camera) -> dict:
    return {"id": c.id, "name": c.name, "district": c.district, "lat": c.lat, "lng": c.lng, "lanes": c.lanes, "baseFlow": c.base_flow, "layout": c.layout}


def metric_to_dict(m: TrafficMetric) -> dict:
    return {
        "cameraId": m.camera_id,
        "ts": to_ms(m.ts),
        "online": m.online,
        "flow": m.flow,
        "avgSpeed": m.avg_speed,
        "occupancy": m.occupancy,
        "level": m.level,
        "vehicles": {"motorbike": m.motorbike, "car": m.car, "truck": m.truck, "bus": m.bus},
    }


def incident_to_dict(i: Incident) -> dict:
    return {
        "id": i.id,
        "type": i.type,
        "severity": i.severity,
        "status": i.status,
        "cameraId": i.camera_id,
        "cameraName": i.camera.name,
        "district": i.camera.district,
        "location": {"lat": i.camera.lat, "lng": i.camera.lng},
        "description": i.description,
        "confidence": i.confidence,
        "snapshot": i.snapshot or {},
        "createdAt": to_ms(i.created_at),
        "updatedAt": to_ms(i.updated_at),
        "timeline": [
            {"at": to_ms(e.at), "action": e.action, "from": e.from_status, "to": e.to_status, "actor": e.actor, "note": e.note}
            for e in i.events
        ],
    }
