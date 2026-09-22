import asyncio
import unittest

from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.tracking import LiveSession, _ingest_throw, router
from app.schemas import ThrowCorrection, ThrowObservation, TrackingSessionCreate
from app.services.live_commentary_context import build_live_commentary_context

app = FastAPI()
app.include_router(router, prefix="/api")


class LiveCommentaryContextTests(unittest.TestCase):
    def test_actual_http_api_preserves_unknown_evidence_and_context_fields(self):
        session_id = "api-context-test"
        with TestClient(app) as client:
            created = client.post("/api/tracking/sessions", json={
                "sessionId": session_id, "playerNames": ["A"], "location": "Test"
            })
            self.assertEqual(201, created.status_code, created.text)
            first = client.post("/api/tracking/mock-throws", json={
                "sessionId": session_id, "clientEventId": "one", "pinsKnockedDown": 7
            })
            self.assertEqual(202, first.status_code, first.text)
            second = client.post("/api/tracking/mock-throws", json={
                "sessionId": session_id, "clientEventId": "two",
                "pinsKnockedDown": 3, "fallenPins": list(range(1, 11))
            })
            self.assertEqual(202, second.status_code, second.text)
            snapshot = client.get(f"/api/tracking/sessions/{session_id}")
            self.assertEqual(200, snapshot.status_code, snapshot.text)
            rows = snapshot.json()["scoreboard"]["throws"]
            self.assertEqual([7, 3], [row["pinsKnockedDown"] for row in rows])
            self.assertIsNone(rows[1]["fallenPins"])
            self.assertIn("commentaryContext", rows[0])
            self.assertIn("playerIndex", rows[0])

    def test_actual_http_correction_requires_explicit_pattern(self):
        session_id = "api-correction-test"
        with TestClient(app) as client:
            created = client.post("/api/tracking/sessions", json={
                "sessionId": session_id, "playerNames": ["A"]
            })
            self.assertEqual(201, created.status_code, created.text)
            client.post("/api/tracking/mock-throws", json={
                "sessionId": session_id, "pinsKnockedDown": 7
            })
            rejected = client.post(
                f"/api/tracking/sessions/{session_id}/throws/correct",
                json={"action": "edit_at_pattern", "throwIndex": 0},
            )
            self.assertEqual(422, rejected.status_code, rejected.text)
    def test_interleaved_full_snapshot_recalculates_later_lead_loss(self):
        log = [
            {"throwId": "a1", "pinsKnockedDown": 10},
            {"throwId": "b1", "pinsKnockedDown": 4},
            {"throwId": "b2", "pinsKnockedDown": 0},
            {"throwId": "a2", "pinsKnockedDown": 1},
            {"throwId": "a3", "pinsKnockedDown": 0},
            {"throwId": "b3", "pinsKnockedDown": 10},
        ]
        contexts = build_live_commentary_context(log, 2, ["A", "B"], revision=7)
        self.assertEqual(7, contexts[2]["revision"])
        self.assertEqual("unique-leader", contexts[3]["before"]["position"])
        self.assertEqual("behind", contexts[3]["current"]["position"])
        self.assertEqual({"throwId": "a1", "kind": "strike"}, contexts[3]["previousClearance"])

    def test_clearance_is_physical_and_not_count_only(self):
        cases = [
            ([10, 1], "strike"),
            ([9, 1, 1], "spare"),
            ([10, 10, 1], "strike"),
            ([10, 1, 0], None),
            ([10, 0, 1], None),
        ]
        for values, expected in cases:
            log = [{"throwId": f"t{i}", "pinsKnockedDown": value} for i, value in enumerate(values)]
            contexts = build_live_commentary_context(log, 1, ["A"])
            actual = contexts[-1]["previousClearance"]
            self.assertEqual(expected is not None, actual is not None, values)
            if expected is not None:
                self.assertEqual(expected, actual["kind"], values)

    def test_weak_open_is_attached_to_completing_throw(self):
        contexts = build_live_commentary_context(
            [{"pinsKnockedDown": 4}, {"pinsKnockedDown": 0}], 1, ["A"]
        )
        self.assertEqual({"kind": "open-frame", "framePins": 4}, contexts[1]["weakPerformance"])

    def test_unknown_and_non_integer_history_suppress_comparisons(self):
        self.assertFalse(build_live_commentary_context([{"pinsKnockedDown": None}], 2)[0]["valid"])
        self.assertFalse(build_live_commentary_context([{"pinsKnockedDown": "1"}], 2)[0]["valid"])

    def test_legal_prefix_and_finished_overflow_matrix(self):
        for values in ([8, 2], [10, 7, 3], [9, 1, 1], [10, 10, 1]):
            self.assertTrue(build_live_commentary_context(
                [{"pinsKnockedDown": value} for value in values], 1, ["A"]
            )[-1]["valid"], values)
        overflow = [{"pinsKnockedDown": value} for value in ([1, 1] * 9 + [1, 1, 1])]
        self.assertFalse(build_live_commentary_context(overflow, 1, ["A"])[-1]["valid"])

    def test_illegal_racks_and_later_unknown_invalidate_all_dependent_contexts(self):
        for values in ([8, 5], [10, 7, 4], [0, 0] * 9 + [10, 7, 4],
                       [0, 0] * 9 + [9, 0, 1], [10, 4, 0, 1, None, 10]):
            players = 2 if None in values else 1
            contexts = build_live_commentary_context(
                [{"pinsKnockedDown": value} for value in values], players, ["A", "B"])
            self.assertTrue(all(not item["valid"] for item in contexts), values)
            self.assertTrue(all(item["current"] is None for item in contexts), values)
            self.assertTrue(all(item["previousClearance"] is None for item in contexts), values)

    def test_tenth_frame_clearance_uses_the_immediately_previous_physical_rack(self):
        for tail, expected in (([10, 1], "strike"), ([9, 1, 1], "spare"),
                               ([10, 10, 1], "strike"), ([10, 1, 0], None),
                               ([10, 0, 1], None), ([10, 10, 0], "strike")):
            values = [0, 0] * 9 + tail
            contexts = build_live_commentary_context([
                {"throwId": f"t{i}", "pinsKnockedDown": value} for i, value in enumerate(values)
            ], 1, ["A"])
            last = contexts[-1]
            self.assertTrue(last["valid"], tail)
            self.assertEqual(expected, (last["previousClearance"] or {}).get("kind"), tail)

    def test_earned_points_lower_bound_vectors(self):
        vectors = [
            ([10], 10), ([10, 1], 12), ([10, 10], 30), ([10, 10, 1], 33),
            ([9, 1, 1], 12), ([10, 7, 2], 28),
            ([0, 0] * 9 + [10, 1], 11), ([0, 0] * 9 + [10, 1, 0], 11),
            ([0, 0] * 9 + [10, 10, 1], 21), ([0, 0] * 9 + [9, 1, 1], 11),
            ([0, 0] * 8 + [10, 10, 1], 32),
        ]
        for values, expected in vectors:
            last = build_live_commentary_context([{"pinsKnockedDown": v} for v in values], 1, ["A"])[-1]
            self.assertTrue(last["valid"])
            self.assertEqual(expected, last["current"]["points"], values)

    def test_equal_progress_is_not_inferred_from_equal_points(self):
        contexts = build_live_commentary_context([
            {"pinsKnockedDown": value} for value in [10, 9, 1, 10, 9, 1]
        ], 2, ["A", "B"])
        self.assertEqual(30, contexts[0]["current"]["points"])
        self.assertEqual(29, contexts[0]["current"]["highestOtherPoints"])
        self.assertFalse(contexts[0]["current"]["unequalProgress"])

    def test_http_unknown_manual_insert_is_rejected_without_mutation(self):
        session_id = "api-unknown-insert-test"
        with TestClient(app) as client:
            self.assertEqual(201, client.post("/api/tracking/sessions", json={
                "sessionId": session_id, "playerNames": ["A"]
            }).status_code)
            before = client.get(f"/api/tracking/sessions/{session_id}").json()
            for action in ("insert_at_end", "insert_before_last"):
                for payload in ({"action": action}, {"action": action, "pinsKnockedDown": None}):
                    response = client.post(f"/api/tracking/sessions/{session_id}/throws/correct", json=payload)
                    self.assertEqual(422, response.status_code, response.text)
                    after = client.get(f"/api/tracking/sessions/{session_id}").json()
                    self.assertEqual(before["scoreboard"]["throws"], after["scoreboard"]["throws"])
                    self.assertEqual(before["revision"], after["revision"])

    def test_actual_ingest_preserves_manual_unknown_rack_and_serializes_context(self):
        session = LiveSession("ctx", "123456", TrackingSessionCreate(player_names=["A"]))
        asyncio.run(_ingest_throw(session, ThrowObservation(pinsKnockedDown=7)))
        asyncio.run(_ingest_throw(session, ThrowObservation(
            pinsKnockedDown=3, fallenPins=list(range(1, 11))
        )))
        rows = session.snapshot().scoreboard.throws
        self.assertEqual([7, 3], [row.pins_knocked_down for row in rows])
        self.assertIsNone(rows[1].fallen_pins)
        payload = session.snapshot().model_dump(mode="json", by_alias=True)
        self.assertIn("commentaryContext", payload["scoreboard"]["throws"][0])
        self.assertIn("playerIndex", payload["scoreboard"]["throws"][0])

    def test_strict_observation_and_correction_inputs(self):
        for value in (True, "1", 1.0):
            with self.assertRaises(Exception):
                ThrowObservation(pinsKnockedDown=value)
            with self.assertRaises(Exception):
                ThrowCorrection(action="edit_last", pinsKnockedDown=value)
        with self.assertRaises(Exception):
            ThrowObservation(fallenPins=[1, 1])
        self.assertIsNone(ThrowCorrection(action="edit_at_pattern", throwIndex=0).fallen_pins)


if __name__ == "__main__":
    unittest.main()
