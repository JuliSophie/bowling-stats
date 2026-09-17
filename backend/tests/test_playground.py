import os
from pathlib import Path

import pytest

os.environ.setdefault("LOCALAPPDATA", str(Path.home() / "AppData/Local"))
runtime = Path(os.environ["LOCALAPPDATA"]) / "BowlingStatsPlayground" / "pytest"
os.environ["BOWLING_PLAYGROUND"] = "1"
os.environ["BOWLING_PLAYGROUND_RUNTIME"] = str(runtime)

httpx = pytest.importorskip("httpx")
from fastapi.testclient import TestClient

from app.playground import app


HOST = {"host": "127.0.0.1:8317"}


def test_lifespan_cors_and_isolated_database():
    with TestClient(app) as client:
        assert client.get("/health", headers=HOST).json()["playground"] == "bowling-stats-local"
        cors = client.options(
            "/api/tracking/sessions",
            headers={**HOST, "Origin": "http://127.0.0.1:4317", "Access-Control-Request-Method": "POST"},
        )
        assert cors.status_code == 200
        assert cors.headers["access-control-allow-origin"] == "http://127.0.0.1:4317"
        assert cors.headers["access-control-allow-credentials"] == "true"
        assert (runtime / "playground.db").exists()
        assert not (Path(__file__).parents[1] / "dev.db").resolve() == (runtime / "playground.db").resolve()


def test_real_session_throw_duplicate_reset_and_save():
    with TestClient(app) as client:
        created = client.post(
            "/api/tracking/sessions",
            headers=HOST,
            json={"playerNames": ["Testspieler"], "location": "Testbahn"},
        ).json()
        sid = created["sessionId"]
        payload = {
            "sessionId": sid,
            "clientEventId": "persistent-test-event",
            "capturedAt": "2026-09-17T12:00:00Z",
            "pinsKnockedDown": 10,
            "path": [{"distanceM": 0, "board": 20}, {"distanceM": 18.29, "board": 20}],
        }
        assert client.post("/api/tracking/mock-throws", headers=HOST, json=payload).status_code == 202
        assert client.post("/api/tracking/mock-throws", headers=HOST, json=payload).status_code == 202
        snapshot = client.get(f"/api/tracking/sessions/{sid}", headers=HOST).json()
        assert snapshot["scoreboard"]["throwCount"] == 1
        assert client.post(f"/api/tracking/sessions/{sid}/reset", headers=HOST).json()["scoreboard"]["throwCount"] == 0
        game = client.post(
            "/api/games",
            headers=HOST,
            json={"played_at": "2026-09-17", "location": "Testbahn", "scores": [
                {"player_name": "Testspieler", "total_score": 0, "frames": []}
            ]},
        )
        assert game.status_code == 201


def test_boundary_rejects_unexpected_host_and_websocket_origin():
    with TestClient(app) as client:
        assert client.get("/health", headers={"host": "evil.test"}).status_code == 421
        assert client.get("/health", headers={**HOST, "origin": "http://evil.test"}).status_code == 403
        session = client.post(
            "/api/tracking/sessions", headers=HOST, json={"playerNames": ["A"]}
        ).json()
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/api/tracking/sessions/{session['sessionId']}/ws",
                headers={"host": HOST["host"], "origin": "http://evil.test"},
            ):
                pass
