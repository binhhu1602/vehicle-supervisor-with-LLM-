"""Integration test qua HTTP/WebSocket với PostgreSQL thật – kiểm tra các tiêu chí chấp nhận của user story."""

import json

import pytest

from tests.integration.conftest import INGEST, login, new_incident

pytestmark = pytest.mark.integration


class TestAuth:
    def test_login_success_returns_user_and_token(self, client):
        r = client.post("/api/auth/login", json={"username": "operator", "password": "operator123"})
        assert r.status_code == 200
        body = r.json()
        assert body["user"] == {"id": body["user"]["id"], "username": "operator", "name": "Trần Điều Hành", "role": "OPERATOR"}
        assert body["token"]

    def test_wrong_password_same_message_as_unknown_user(self, client):
        a = client.post("/api/auth/login", json={"username": "admin", "password": "sai"})
        b = client.post("/api/auth/login", json={"username": "khongco", "password": "sai"})
        assert a.status_code == b.status_code == 401
        assert a.json() == b.json()

    def test_protected_endpoint_requires_token(self, client):
        assert client.get("/api/cameras").status_code == 401
        assert client.get("/api/cameras", headers={"Authorization": "Bearer abc"}).status_code == 401

    def test_me(self, client):
        assert client.get("/api/auth/me", headers=login(client, "viewer")).json()["role"] == "VIEWER"


class TestMonitoring:
    def test_cameras_include_layout(self, client):
        cams = client.get("/api/cameras", headers=login(client, "viewer")).json()
        assert len(cams) == 8
        assert next(c for c in cams if c["id"] == "CAM-03")["layout"] == "interchange"

    def test_ingest_metrics_requires_key_and_computes_level(self, client):
        payload = [{"cameraId": "CAM-01", "flow": 130, "avgSpeed": 7, "occupancy": 0.92, "vehicles": {"motorbike": 90, "car": 30, "truck": 5, "bus": 5}}]
        assert client.post("/api/ingest/metrics", json=payload).status_code == 401
        assert client.post("/api/ingest/metrics", headers=INGEST, json=payload).status_code == 202
        latest = client.get("/api/metrics/latest", headers=login(client, "viewer")).json()
        m = next(x for x in latest if x["cameraId"] == "CAM-01")
        assert m["level"] == 3 and m["flow"] == 130

    def test_ingest_rejects_invalid_values(self, client):
        r = client.post("/api/ingest/metrics", headers=INGEST, json=[{"cameraId": "CAM-01", "flow": -5, "avgSpeed": 10, "occupancy": 2}])
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "validation_error"

    def test_history_and_report(self, client):
        h = login(client, "viewer")
        history = client.get("/api/metrics/history?minutes=30", headers=h).json()
        assert history and {"ts", "flow", "avgSpeed", "level"} <= history[0].keys()
        report = client.get("/api/reports/summary?hours=1", headers=h).json()
        assert any(c["cameraId"] == "CAM-01" for c in report["cameras"])


class TestIncidentWorkflow:
    def test_full_lifecycle_and_timeline(self, client):
        inc = new_incident(client)
        assert inc["id"].startswith("INC-") and inc["status"] == "NEW"
        h = login(client, "operator")
        for action in ("acknowledge", "start", "resolve"):
            r = client.post(f"/api/incidents/{inc['id']}/transition", headers=h, json={"action": action, "note": f"bước {action}"})
            assert r.status_code == 200, r.text
        done = client.get(f"/api/incidents/{inc['id']}", headers=h).json()
        assert done["status"] == "RESOLVED"
        assert [t["action"] for t in done["timeline"]] == ["detected", "acknowledge", "start", "resolve"]
        assert done["timeline"][-1]["actor"] == "Trần Điều Hành"
        assert done["timeline"][1]["from"] == "NEW"

    def test_invalid_transition_returns_409(self, client):
        inc = new_incident(client)
        r = client.post(f"/api/incidents/{inc['id']}/transition", headers=login(client, "operator"), json={"action": "resolve"})
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "invalid_transition"

    def test_viewer_cannot_update(self, client):
        inc = new_incident(client)
        r = client.post(f"/api/incidents/{inc['id']}/transition", headers=login(client, "viewer"), json={"action": "acknowledge"})
        assert r.status_code == 403

    def test_filters(self, client):
        new_incident(client, type="WRONG_WAY", severity="MEDIUM", description="Xe máy đi ngược chiều")
        h = login(client, "viewer")
        r = client.get("/api/incidents?scope=open&type=WRONG_WAY&q=ngược", headers=h).json()
        assert r["total"] >= 1 and all(i["type"] == "WRONG_WAY" for i in r["items"])
        assert client.get("/api/incidents/INC-0", headers=h).status_code == 404

    def test_unknown_camera_rejected(self, client):
        r = client.post("/api/ingest/incidents", headers=INGEST, json={"type": "ACCIDENT", "severity": "HIGH", "cameraId": "CAM-99", "description": "x", "confidence": 0.5})
        assert r.status_code == 404


class TestSettings:
    def test_only_admin_updates_thresholds(self, client):
        body = {"jamSpeed": 8, "slowSpeed": 18, "busySpeed": 28, "highOccupancy": 0.8}
        assert client.put("/api/settings/thresholds", headers=login(client, "operator"), json=body).status_code == 403
        r = client.put("/api/settings/thresholds", headers=login(client, "admin"), json=body)
        assert r.status_code == 200 and r.json()["jamSpeed"] == 8
        assert client.get("/api/settings/thresholds", headers=login(client, "viewer")).json()["busySpeed"] == 28

    def test_invalid_order_rejected(self, client):
        r = client.put("/api/settings/thresholds", headers=login(client, "admin"), json={"jamSpeed": 30, "slowSpeed": 20, "busySpeed": 40, "highOccupancy": 0.7})
        assert r.status_code == 422


class TestLlm:
    def test_chat_streams_sse_grounded_answer(self, client):
        new_incident(client, cameraId="CAM-03", severity="CRITICAL", description="Va chạm liên hoàn trong vòng xuyến")
        with client.stream("POST", "/api/llm/chat", headers=login(client, "operator"), json={"messages": [{"role": "user", "content": "Có sự cố nào nghiêm trọng?"}]}) as r:
            assert r.status_code == 200
            assert r.headers["content-type"].startswith("text/event-stream")
            lines = [ln for ln in r.iter_lines() if ln.startswith("data:")]
        assert lines[-1] == "data: [DONE]"
        text = "".join(json.loads(ln[5:])["delta"] for ln in lines[:-1])
        assert "Khẩn cấp" in text and "Ngã ba Huế" in text

    def test_analysis_is_cached(self, client):
        inc = new_incident(client)
        h = login(client, "operator")
        a = client.post("/api/llm/analyze-incident", headers=h, json={"incident": {"id": inc["id"]}})
        assert a.status_code == 200 and a.json()["recommendedActions"]
        b = client.post("/api/llm/analyze-incident", headers=h, json={"incident": {"id": inc["id"]}})
        assert b.json() == a.json()

    def test_last_message_must_be_user(self, client):
        r = client.post("/api/llm/chat", headers=login(client, "operator"), json={"messages": [{"role": "assistant", "content": "x"}]})
        assert r.status_code == 400

    def test_summarize(self, client):
        r = client.post("/api/llm/summarize", headers=login(client, "viewer"))
        assert r.status_code == 200 and "Tóm tắt" in r.json()["text"]


class TestWebSocket:
    def test_rejects_bad_token(self, client):
        from starlette.websockets import WebSocketDisconnect

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws?token=bad") as ws:
                ws.receive_json()

    def test_snapshot_broadcast_and_command(self, client):
        token = login(client, "operator")["Authorization"].split()[1]
        with client.websocket_connect(f"/ws?token={token}") as ws:
            assert ws.receive_json()["type"] == "connection:status"
            snap = ws.receive_json()
            assert snap["type"] == "traffic:snapshot" and len(snap["payload"]["cameras"]) == 8

            inc = new_incident(client)
            msg = ws.receive_json()
            while msg["type"] != "incident:new":
                msg = ws.receive_json()
            assert msg["payload"]["id"] == inc["id"]

            # Lệnh qua WS: người thực hiện lấy từ token, KHÔNG dùng "actor" do client gửi
            ws.send_json({"type": "incident:transition", "payload": {"id": inc["id"], "action": "acknowledge", "actor": "giả mạo"}})
            msg = ws.receive_json()
            while msg["type"] != "incident:update":
                msg = ws.receive_json()
            assert msg["payload"]["status"] == "ACKNOWLEDGED"
            assert msg["payload"]["timeline"][-1]["actor"] == "Trần Điều Hành"

            ws.send_json({"type": "config:thresholds", "payload": {"jamSpeed": 5}})
            err = ws.receive_json()
            assert err["type"] == "error"


class TestTrafficAnalysis:
    def test_analyzes_flow_extracted_by_vision(self, client):
        import time as _t

        now = int(_t.time() * 1000)
        # Giả lập worker AI Vision gửi 8 phút số liệu cho CAM-02, lưu lượng tăng dần, tốc độ giảm
        batch = [
            {"cameraId": "CAM-02", "ts": now - (8 - i) * 60_000, "flow": 40 + i * 8, "avgSpeed": 38 - i * 3, "occupancy": 0.3 + i * 0.05,
             "vehicles": {"motorbike": 28 + i * 5, "car": 8 + i * 2, "truck": 2, "bus": 2}}
            for i in range(8)
        ]
        assert client.post("/api/ingest/metrics", headers=INGEST, json=batch).status_code == 202
        r = client.post("/api/llm/analyze-traffic", headers=login(client, "viewer"), json={"cameraId": "CAM-02", "minutes": 15})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["scope"] == "Cầu Sông Hàn – Lê Duẩn"
        assert body["dataSource"].startswith("AI Vision")  # camera đã nhận dữ liệu qua ingest
        assert body["stats"]["trend"] == "tăng"
        assert body["stats"]["points"] >= 8
        assert body["recommendations"] and body["forecast"]

    def test_unknown_camera_and_insufficient_data(self, client):
        h = login(client, "viewer")
        assert client.post("/api/llm/analyze-traffic", headers=h, json={"cameraId": "CAM-99"}).status_code == 404
        r = client.post("/api/llm/analyze-traffic", headers=h, json={"cameraId": "CAM-07", "minutes": 5})
        assert r.status_code == 400


class TestCameraFrames:
    JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"\x00" * 200 + bytes([0xFF, 0xD9])

    def test_ingest_and_view_latest_frame(self, client):
        hdr = {**INGEST, "Content-Type": "image/jpeg"}
        assert client.post("/api/ingest/frames/CAM-06", content=self.JPEG, headers={"Content-Type": "image/jpeg"}).status_code == 401
        assert client.post("/api/ingest/frames/CAM-06", content=b"not-a-jpeg", headers=hdr).status_code == 400
        assert client.post("/api/ingest/frames/CAM-99", content=self.JPEG, headers=hdr).status_code == 404
        assert client.post("/api/ingest/frames/CAM-06", content=self.JPEG, headers=hdr).status_code == 204

        token = login(client, "viewer")["Authorization"].split()[1]
        assert client.get("/api/cameras/CAM-06/frame").status_code == 401
        r = client.get(f"/api/cameras/CAM-06/frame?token={token}")  # dùng được trong thẻ <img>
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg" and r.content == self.JPEG
        assert client.get(f"/api/cameras/CAM-07/frame?token={token}").status_code == 404

    def test_frame_event_broadcast(self, client):
        token = login(client, "operator")["Authorization"].split()[1]
        with client.websocket_connect(f"/ws?token={token}") as ws:
            ws.receive_json(), ws.receive_json()
            client.post("/api/ingest/frames/CAM-08", content=self.JPEG, headers={**INGEST, "Content-Type": "image/jpeg"})
            msg = ws.receive_json()
            while msg["type"] != "camera:frame":
                msg = ws.receive_json()
            assert msg["payload"]["cameraId"] == "CAM-08" and msg["payload"]["ts"] > 0
