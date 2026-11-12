from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Incident
from app.repositories import incidents as incidents_repo
from app.repositories import metrics as metrics_repo
from app.services.live_state import LiveState


async def summary(session: AsyncSession, live: LiveState, hours: int) -> dict:
    since = datetime.now(UTC) - timedelta(hours=hours)
    stats = await metrics_repo.camera_stats(session, since)
    names = {cid: c["name"] for cid, c in live.cameras.items()}
    for s in stats:
        s["name"] = names.get(s["cameraId"], s["cameraId"])
    return {
        "from": int(since.timestamp() * 1000),
        "to": int(datetime.now(UTC).timestamp() * 1000),
        "hours": hours,
        "incidentsByType": await incidents_repo.counts_by(session, Incident.type, since),
        "incidentsBySeverity": await incidents_repo.counts_by(session, Incident.severity, since),
        "incidentsByStatus": await incidents_repo.counts_by(session, Incident.status, since),
        "cameras": stats,
        "hourlyCongestion": await metrics_repo.hourly_congestion(session, since),
    }
