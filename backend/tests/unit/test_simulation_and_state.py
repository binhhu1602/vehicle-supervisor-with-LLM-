import random
from datetime import UTC, datetime

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.domain.cameras import DEFAULT_CAMERAS
from app.services.ingest_service import normalize_metrics
from app.services.live_state import EventBus, LiveState
from app.simulation.simulator import TrafficSimulator, time_of_day_factor

CAMS = [{**c, "baseFlow": c["base_flow"]} for c in DEFAULT_CAMERAS]
T0 = datetime(2026, 11, 12, 8, 0, tzinfo=UTC)


def make_sim(seed=7):
    return TrafficSimulator(CAMS, rng=random.Random(seed))


class TestSimulator:
    def test_metrics_are_valid(self):
        metrics, _ = make_sim().tick(T0)
        assert len(metrics) == len(CAMS)
        for m in metrics:
            assert 0 <= m["level"] <= 3
            assert 0 <= m["occupancy"] <= 1
            if m["online"]:
                assert m["avgSpeed"] >= 3
                assert sum(m["vehicles"].values()) > 0

    def test_deterministic_with_seed(self):
        a, b = make_sim(), make_sim()
        assert [a.tick(T0) for _ in range(20)] == [b.tick(T0) for _ in range(20)]

    def test_rush_hour_busier_than_night(self):
        night = datetime(2026, 11, 12, 2, 0, tzinfo=UTC)
        rush = datetime(2026, 11, 12, 7, 30, tzinfo=UTC)
        assert time_of_day_factor(rush) > 2 * time_of_day_factor(night)

    def test_generates_incidents_with_required_fields(self):
        sim = make_sim(3)
        incidents = [i for _ in range(300) for i in sim.tick(T0)[1]]
        assert incidents
        for i in incidents:
            assert {"type", "severity", "cameraId", "description", "confidence", "snapshot"} <= i.keys()
            assert 0 <= i["confidence"] <= 1


class TestLiveState:
    def test_kpis_ignore_offline_and_weight_speed(self):
        live = LiveState()
        live.set_cameras([{"id": "A"}, {"id": "B"}, {"id": "C"}])
        live.push_metrics(
            [
                {"cameraId": "A", "online": True, "flow": 100, "avgSpeed": 40, "level": 0},
                {"cameraId": "B", "online": True, "flow": 300, "avgSpeed": 20, "level": 3},
                {"cameraId": "C", "online": False, "flow": 0, "avgSpeed": 0, "level": 0},
            ]
        )
        k = live.kpis([{"severity": "HIGH"}, {"severity": "LOW"}])
        assert k["totalFlow"] == 400
        assert k["avgSpeed"] == 25
        assert k["camerasOnline"] == 2
        assert k["criticalIncidents"] == 1

    def test_history_is_bounded(self):
        live = LiveState()
        for i in range(LiveState.HISTORY_TICKS + 10):
            live.push_metrics([{"cameraId": "A", "ts": i}])
        assert len(live.history) == LiveState.HISTORY_TICKS

    async def test_event_bus_isolates_failing_observer(self):
        bus, got = EventBus(), []

        async def bad(event, payload):
            raise RuntimeError("boom")

        async def good(event, payload):
            got.append(event)

        bus.subscribe(bad)
        unsubscribe = bus.subscribe(good)
        await bus.publish("x", 1)
        unsubscribe()
        await bus.publish("y", 2)
        assert got == ["x"]

    def test_server_computes_level_when_missing(self):
        live = LiveState()
        live.set_cameras([{"id": "CAM-01"}])
        [m] = normalize_metrics([{"cameraId": "CAM-01", "flow": 120, "avgSpeed": 6, "occupancy": 0.9, "vehicles": {}}], live)
        assert m["level"] == 3
        assert m["ts"] > 0


class TestSecurity:
    def test_password_hashing(self):
        h = hash_password("operator123")
        assert h != "operator123"
        assert verify_password("operator123", h)
        assert not verify_password("sai", h)

    def test_jwt_roundtrip(self):
        claims = decode_access_token(create_access_token(5, "OPERATOR"))
        assert claims["sub"] == "5"
        assert claims["role"] == "OPERATOR"
