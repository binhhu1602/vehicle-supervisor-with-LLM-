"""Dựng ngữ cảnh thời gian thực cho LLM (grounding) – TỪ DỮ LIỆU SERVER, không lấy từ client."""

from datetime import UTC, datetime

from app.domain.constants import CONGESTION_LABEL, INCIDENT_TYPE_LABEL, SEVERITY_LABEL
from app.services.live_state import LiveState


def build_context(live: LiveState, open_incidents: list[dict]) -> dict:
    cams = []
    for c in live.camera_list():
        m = c.get("metric") or {}
        level = m.get("level", 0) if m.get("online") else 0
        cams.append(
            {
                "id": c["id"],
                "name": c["name"],
                "district": c["district"],
                "layout": c.get("layout", "crossroad"),
                "online": bool(m.get("online")),
                "flow": m.get("flow", 0),
                "avgSpeed": m.get("avgSpeed", 0),
                "occupancy": m.get("occupancy", 0),
                "level": level,
                "levelLabel": CONGESTION_LABEL[level],
            }
        )
    incidents = [
        {
            "id": i["id"],
            "type": i["type"],
            "typeLabel": INCIDENT_TYPE_LABEL.get(i["type"], i["type"]),
            "severity": i["severity"],
            "severityLabel": SEVERITY_LABEL.get(i["severity"], i["severity"]),
            "status": i["status"],
            "cameraId": i["cameraId"],
            "cameraName": i["cameraName"],
            "createdAt": i["createdAt"],
            "description": i["description"],
        }
        for i in open_incidents[:20]  # giới hạn để kiểm soát số token
    ]
    return {
        "generatedAt": datetime.now(UTC).isoformat(),
        "kpis": live.kpis(open_incidents),
        "cameras": cams,
        "openIncidents": incidents,
    }
