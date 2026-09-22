import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.routers.games import create_game, list_games
from app.schemas import ConfirmedScore, GameCreate
from app.services.trash_talk_evidence import score_evidence


def empty_game():
    return [{"throw1": "0", "throw2": "0", "throw3": ""} for _ in range(10)]


class EvidenceTests(unittest.TestCase):
    def test_bonus_aware_spare_and_prior_strike(self):
        frames = empty_game()
        frames[7] = {"throw1": "X", "throw2": "", "throw3": ""}
        frames[8] = {"throw1": "9", "throw2": "-", "fallenPins": [list(range(1, 10)), []]}
        frames[9] = {"throw1": "7", "throw2": "0"}
        result = score_evidence(frames, 35)
        self.assertTrue(result["valid"])
        self.assertEqual([{"frame": 9, "original_score": 35, "hypothetical_score": 44,
                           "gain": 9, "pins_added": 1, "single_pin_attempt": True, "pin": 10}],
                         result["counterfactuals"])

    def test_one_more_pin_is_not_always_single_pin_attempt(self):
        frames = empty_game()
        frames[8] = {"throw1": "8", "throw2": "1"}
        frames[9] = {"throw1": "7", "throw2": "0"}
        item = score_evidence(frames, 16)["counterfactuals"][0]
        self.assertFalse(item["single_pin_attempt"])
        self.assertEqual(24, item["hypothetical_score"])
        self.assertNotIn("pin", item)

    def test_foul_is_not_a_one_pin_counterfactual(self):
        frames = empty_game()
        frames[8] = {"throw1": "9", "throw2": "F"}
        frames[9] = {"throw1": "7", "throw2": "0"}
        result = score_evidence(frames, 16)
        self.assertTrue(result["valid"])
        self.assertEqual([], result["counterfactuals"])

    def test_invalid_positions_suppress_identity_not_score(self):
        frames = empty_game()
        frames[8] = {"throw1": "9", "throw2": "0", "fallenPins": [[1] * 9, []]}
        result = score_evidence(frames, 9)
        self.assertTrue(result["valid"])
        self.assertNotIn("pin", result["counterfactuals"][0])
        self.assertEqual([], result["leaves"])

    def test_missing_illegal_and_conflicting_scores(self):
        self.assertFalse(score_evidence([], 150)["valid"])
        self.assertFalse(score_evidence(empty_game(), 1)["valid"])
        frames = empty_game()
        frames[1] = {"throw1": "8", "throw2": "8"}
        self.assertFalse(score_evidence(frames, 16)["valid"])
        frames[1] = {"throw1": "", "throw2": "0"}
        self.assertFalse(score_evidence(frames, 0)["valid"])

    def test_tenth_bonus_required_and_no_invented_counterfactual(self):
        frames = empty_game()
        frames[9] = {"throw1": "9", "throw2": "/"}
        self.assertFalse(score_evidence(frames, 10)["valid"])
        frames[9] = {"throw1": "9", "throw2": "-", "throw3": ""}
        result = score_evidence(frames, 9)
        self.assertTrue(result["valid"])
        self.assertEqual([], result["counterfactuals"])
        frames[9] = {"throw1": "X", "throw2": "8", "throw3": "8"}
        self.assertFalse(score_evidence(frames, 26)["valid"])

    def test_perfect_game(self):
        frames = [{"throw1": "X", "throw2": "", "throw3": ""} for _ in range(9)]
        frames.append({"throw1": "X", "throw2": "X", "throw3": "X"})
        result = score_evidence(frames, 300)
        self.assertTrue(result["valid"])
        self.assertTrue(result["clean"])
        self.assertEqual([30] * 10, result["frame_points"])

    def test_save_and_list_expose_same_evidence_without_changing_frames(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        frames = empty_game()
        frames[8] = {"throw1": "9", "throw2": "0", "fallenPins": [list(range(1, 10)), []]}
        with Session(engine) as db:
            created = create_game(GameCreate(
                played_at=date(2026, 1, 1), location="Synthetischer Test",
                scores=[ConfirmedScore(player_name="Test", total_score=9, frames=frames)]), db)
            listed = list_games(db)[0]
            self.assertEqual(created.scores[0].trash_talk_evidence, listed.scores[0].trash_talk_evidence)
            self.assertEqual(frames, listed.scores[0].frames)
            self.assertTrue(listed.scores[0].trash_talk_evidence.valid)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
