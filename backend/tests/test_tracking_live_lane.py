import asyncio
import unittest

from app.routers.tracking import LiveSession, _ingest_throw
from app.schemas import TrackingSessionCreate, ThrowObservation


class TrackingLiveLaneTests(unittest.TestCase):
    def session(self):
        return LiveSession("test", "123456", TrackingSessionCreate(player_names=["Anna", "Ben"]))

    def test_duplicate_client_event_reuses_stable_throw_and_revision(self):
        session = self.session()
        observation = ThrowObservation(sessionId="test", clientEventId="delivery-1", pinsKnockedDown=7)
        first = asyncio.run(_ingest_throw(session, observation))
        revision = session.revision
        second = asyncio.run(_ingest_throw(session, observation))
        self.assertEqual(first.event_id, second.event_id)
        self.assertEqual(revision, session.revision)
        self.assertEqual(first.payload["throwId"], session.snapshot().scoreboard.throws[0].throw_id)

    def test_correction_preserves_id_when_log_is_replayed(self):
        session = self.session()
        asyncio.run(_ingest_throw(session, ThrowObservation(sessionId="test", clientEventId="a", pinsKnockedDown=7)))
        throw_id = session.throw_log[0]["throwId"]
        session.throw_log[0].update(pinsKnockedDown=8, fallenPins=[], manualCorrection=True)
        session.revision += 1
        self.assertEqual(throw_id, session.snapshot().scoreboard.throws[0].throw_id)

    def test_observed_pins_are_normalized_against_same_rack(self):
        session = self.session()
        asyncio.run(_ingest_throw(session, ThrowObservation(
            sessionId="test", clientEventId="a", pinsKnockedDown=4, fallenPins=[1, 2, 3, 4],
        )))
        asyncio.run(_ingest_throw(session, ThrowObservation(
            sessionId="test", clientEventId="b", pinsKnockedDown=3, fallenPins=[1, 2, 3, 5, 6],
        )))
        throws = session.snapshot().scoreboard.throws
        self.assertEqual(4, throws[0].pins_knocked_down)
        self.assertEqual([5, 6], throws[1].fallen_pins)
        self.assertEqual([1, 2, 3, 4], throws[1].already_down_pins)


if __name__ == "__main__":
    unittest.main()
