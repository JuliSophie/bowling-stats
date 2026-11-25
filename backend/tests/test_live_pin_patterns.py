from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.routers.tracking import router
from app.services.live_commentary_context import build_live_commentary_context
from app.services.live_pin_patterns import PinDelivery


def single(pin: int, converted: bool) -> list[PinDelivery]:
    down = [number for number in range(1, 11) if number != pin]
    return [
        {"pinsKnockedDown": 9, "fallenPins": down, "alreadyDownPins": []},
        {"pinsKnockedDown": int(converted), "fallenPins": [pin] if converted else [], "alreadyDownPins": down},
    ]


def test_recurring_leave_is_based_on_prior_misses_by_this_roster_slot() -> None:
    log = (single(10, False) + single(10, True)) * 3
    log += single(10, False) + single(10, False)[:1]
    contexts = build_live_commentary_context(log, 2, ["Alex", "Alex"])
    assert [index for index, row in enumerate(contexts) if row.get("pinPattern")] == [12]
    assert contexts[12]["pinPattern"] == {"kind": "recurring-leave", "pin": 10}


@pytest.mark.parametrize("strong,other,side", [(7, 10, "left"), (3, 2, "right"), (4, 6, "left"), (9, 8, "right")])
def test_spare_on_proven_side_requires_earlier_results_on_both_sides(strong: int, other: int, side: str) -> None:
    log = single(strong, True) * 3 + single(other, False) * 2 + single(strong, True)
    contexts = build_live_commentary_context(log, 1)
    assert [index for index, row in enumerate(contexts) if row.get("pinPattern")] == [11]
    assert contexts[-1]["pinPattern"] == {"kind": "strong-side-spare", "pin": strong, "side": side}


@pytest.mark.parametrize("log", [
    single(10, False) * 2 + single(10, False)[:1],
    single(7, False) * 3 + single(10, False) * 3 + single(10, False)[:1],
    single(7, True) * 3 + single(10, False) + single(7, True),
    single(7, True) * 3 + single(10, True) * 3 + single(7, True),
    single(7, True) * 3 + single(10, False) * 2 + single(5, True),
    single(7, True) * 3 + single(10, False) * 2 + single(7, False),
    single(10, False) * 3 + [{"pinsKnockedDown": 9}],
    single(10, False) * 3 + [{**single(10, False)[0], "lowConfidence": True}],
    single(10, False) * 3 + [{**single(10, False)[0], "observedPinsKnockedDown": 5,
                               "observedFallenPins": list(range(1, 10))}],
    single(7, True) * 3 + single(10, False) * 2 + single(7, True)[:1] + [{"pinsKnockedDown": 1}],
    single(10, False) * 2 + single(10, False)[:1] + [
        {"pinsKnockedDown": 0, "fallenPins": [], "alreadyDownPins": [1, 2]},
    ] + single(10, False)[:1],
])
def test_inconclusive_evidence_keeps_the_ordinary_scenario(log: list[PinDelivery]) -> None:
    assert build_live_commentary_context(log, 1)[-1].get("pinPattern") is None


def test_live_event_and_snapshot_lose_the_pattern_after_correcting_an_earlier_miss() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/api")
    session_id = "recurring-pin-proof"
    with TestClient(app) as client:
        client.post("/api/tracking/sessions", json={"sessionId": session_id, "playerNames": ["A"]}).raise_for_status()
        for row in single(10, False) * 3 + single(10, False)[:1]:
            response = client.post("/api/tracking/mock-throws", json={
                "sessionId": session_id, "pinsKnockedDown": row["pinsKnockedDown"],
                "fallenPins": sorted(row["alreadyDownPins"] + row["fallenPins"]),
            })
            response.raise_for_status()
        event = response.json()["payload"]
        url = f"/api/tracking/sessions/{session_id}"
        snapshot = client.get(url).json()["scoreboard"]["throws"][-1]
        assert event["commentaryContext"]["pinPattern"] == snapshot["commentaryContext"]["pinPattern"] == {
            "kind": "recurring-leave", "pin": 10,
        }
        client.post(f"{url}/throws/correct", json={
            "action": "edit_at_pattern", "throwIndex": 1, "fallenPins": [10],
        }).raise_for_status()
        corrected = client.get(url).json()["scoreboard"]["throws"][-1]
        assert corrected["throwId"] == event["throwId"]
        assert corrected["commentaryContext"].get("pinPattern") is None
