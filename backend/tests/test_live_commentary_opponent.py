from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.tracking import router
from app.services.live_commentary_context import build_live_commentary_context


@pytest.mark.parametrize(
    ("player_count", "names", "pins"),
    [
        (1, ["Anna", "Ben"], 6),
        (2, ["Anna"], 6),
        (2, ["Anna", " \t "], 6),
        (2, ["Anna  Maria", " anna maria "], 6),
        (3, ["Anna", "Ben", "Cem"], 6),
        (3, ["Anna", "Ben", " "], 6),
        (2, ["Anna", "Ben"], None),
    ],
)
def test_opponent_is_omitted_without_two_distinct_named_slots_and_valid_log(
    player_count: int, names: list[str], pins: int | None,
) -> None:
    [context] = build_live_commentary_context(
        [{"pinsKnockedDown": pins}], player_count, names,
    )

    assert context["valid"] is (pins is not None)
    assert "opponentName" not in context


def test_correction_reassigns_the_opponent_on_the_replayed_delivery() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/api")
    session_id = uuid4().hex
    session_url = f"/api/tracking/sessions/{session_id}"

    with TestClient(app) as client:
        created = client.post("/api/tracking/sessions", json={
            "sessionId": session_id, "playerNames": [" Anna  Maria ", " Ben "],
        })
        assert created.status_code == 201, created.text
        strike = client.post("/api/tracking/mock-throws", json={
            "sessionId": session_id, "pinsKnockedDown": 10,
        })
        delivered = client.post("/api/tracking/mock-throws", json={
            "sessionId": session_id, "pinsKnockedDown": 4,
        })
        assert delivered.status_code == 202, delivered.text
        original = delivered.json()["payload"]
        assert original["playerIndex"] == 1
        assert original["commentaryContext"]["opponentName"] == "Anna Maria"
        assert strike.json()["payload"]["commentaryContext"]["opponentName"] == "Ben"

        corrected = client.post(f"{session_url}/throws/correct", json={
            "action": "edit_at_pattern", "throwIndex": 0, "fallenPins": [1, 2, 3, 4],
        })

        assert corrected.status_code == 200, corrected.text
        snapshot = corrected.json()
        replayed = snapshot["scoreboard"]["throws"][1]
        assert replayed["throwId"] == original["throwId"]
        assert replayed["playerIndex"] == 0
        assert replayed["commentaryContext"]["revision"] == snapshot["revision"]
        assert replayed["commentaryContext"]["opponentName"] == "Ben"
        assert snapshot["scoreboard"]["commentaryContext"]["opponentName"] == "Ben"
