"""Bounded, replay-only context for live commentary.

This module deliberately does not touch the official scorer.  Its totals are lower
bounds: unresolved strike/spare bonus balls contribute zero until they are known.
"""
from __future__ import annotations

from typing import Any, Literal, TypedDict

from app.live_scoring import ScoreboardResult, compute_scoreboard
from app.services.live_pin_patterns import PinDelivery, live_pin_patterns


class PersonalPace(TypedDict):
    kind: Literal["below-usual", "above-usual"]
    priorFirstBallCount: int


def _lower_bound(card: dict[str, Any]) -> int:
    frames = card.get("frames", [])
    total = 0
    for index, frame in enumerate(frames):
        throws = frame.get("throws", [])
        if not throws:
            continue
        if index < 9 and throws[0] == 10:
            # Find the two balls after this frame without relying on duplicate values.
            later = [value for later_frame in frames[index + 1:] for value in later_frame.get("throws", [])]
            total += 10 + sum(later[:2])
        elif index < 9 and len(throws) >= 2 and sum(throws[:2]) == 10:
            later = [value for later_frame in frames[index + 1:] for value in later_frame.get("throws", [])]
            total += 10 + sum(later[:1])
        else:
            total += sum(throws[:3] if index == 9 else throws[:2])
    return total


def _standing(scores: list[int]) -> tuple[int | None, bool]:
    if not scores:
        return None, False
    highest = max(scores)
    leaders = [index for index, score in enumerate(scores) if score == highest]
    return (leaders[0] if len(leaders) == 1 else None), len(leaders) == 1


def _legal_prefixes(counts: list[int], player_count: int, names: list[str]) -> list[ScoreboardResult] | None:
    boards = [compute_scoreboard([], player_count, names)]
    for index, pins in enumerate(counts):
        before = boards[-1]
        if before.is_finished:
            return None
        frame, ball = before.current_frame, before.current_throw
        frames = before.players[before.current_player_index]["frames"]
        prior = frames[frame - 1]["throws"] if len(frames) >= frame else []
        remaining = 10
        if ball == 2:
            remaining = 10 if frame == 10 and prior[0] == 10 else 10 - prior[0]
        elif ball == 3:
            if frame != 10 or len(prior) != 2 or (prior[0] != 10 and sum(prior) != 10):
                return None
            remaining = 10 if prior[0] != 10 or prior[1] == 10 else 10 - prior[1]
        elif ball != 1:
            return None
        if pins > remaining:
            return None
        boards.append(compute_scoreboard(counts[:index + 1], player_count, names))
    return boards


def _unequal_progress(board: ScoreboardResult) -> bool:
    progress = []
    for card in board.players:
        completed = 0
        partial = 0
        for index, frame in enumerate(card["frames"]):
            throws = frame["throws"]
            complete = bool(throws) and (throws[0] == 10 or len(throws) == 2)
            if index == 9:
                bonus = len(throws) >= 2 and (throws[0] == 10 or sum(throws[:2]) == 10)
                complete = len(throws) == (3 if bonus else 2)
            completed += int(complete)
            if not complete:
                partial = len(throws)
        progress.append((completed, partial))
    return len(set(progress)) > 1


def build_live_commentary_context(
    normalized_log: list[PinDelivery],
    player_count: int,
    player_names: list[str] | None = None,
    revision: int = 0,
) -> list[dict[str, Any]]:
    """Return one immutable context snapshot per logged delivery.

    One validated replay per prefix is reused for all before/current comparisons.
    """
    result: list[dict[str, Any]] = []
    player_names = player_names or []
    raw_valid = type(player_count) is int and player_count > 0 and all(
        type(item.get("pinsKnockedDown")) is int and 0 <= item["pinsKnockedDown"] <= 10
        for item in normalized_log
    )
    counts = [item.get("pinsKnockedDown") for item in normalized_log]
    boards = _legal_prefixes(counts, player_count, player_names) if raw_valid else None
    if boards is None:
        return [{"version": 1, "revision": revision, "valid": False,
                 "invalidReason": "unknown-count" if not raw_valid else "illegal-rack",
                 "previousClearance": None, "weakPerformance": None,
                 "framePins": None, "before": None, "current": None}
                for _ in normalized_log]
    full_board = boards[-1]
    pin_patterns = live_pin_patterns(normalized_log, full_board.assignments)
    named_pair: tuple[str, str] | None = None
    if player_count == 2 and len(player_names) >= 2:
        first_name = " ".join(player_names[0].split())
        second_name = " ".join(player_names[1].split())
        if first_name and second_name and first_name.casefold() != second_name.casefold():
            named_pair = (first_name, second_name)
    full_points = [_lower_bound(card) for card in full_board.players]
    current_unequal = _unequal_progress(full_board)
    for index, current in enumerate(normalized_log):
        before = boards[index]
        current_board = full_board
        assignment = full_board.assignments[index] if index < len(full_board.assignments) else None
        if assignment is None:
            result.append({})
            continue
        player_index = assignment.player_index
        before_points = [_lower_bound(card) for card in before.players]
        current_points = full_points
        before_leader, before_unique = _standing(before_points)
        current_leader, current_unique = _standing(current_points)

        same_player = [
            (pos, item, current_board.assignments[pos])
            for pos, item in enumerate(normalized_log[:index])
            if pos < len(before.assignments) and before.assignments[pos].player_index == player_index
        ]
        previous = same_player[-1] if same_player else None
        clearance = None
        if previous:
            _, previous_item, previous_assignment = previous
            prior_score = previous_item.get("pinsKnockedDown")
            if previous_assignment.throw_in_frame == 1 and prior_score == 10:
                clearance = {"throwId": previous_item.get("throwId"), "kind": "strike"}
            elif previous_assignment.throw_in_frame == 2 and prior_score is not None:
                first = next((item.get("pinsKnockedDown") for pos, item, ass in same_player
                              if ass.frame == previous_assignment.frame and ass.throw_in_frame == 1), None)
                if previous_assignment.frame == 10 and first == 10 and prior_score == 10:
                    clearance = {"throwId": previous_item.get("throwId"), "kind": "strike"}
                elif first is not None and first < 10 and first + prior_score == 10:
                    clearance = {"throwId": previous_item.get("throwId"), "kind": "spare"}

        weak: dict[str, Any] | None = None
        personal_pace: PersonalPace | None = None
        frame_throws: list[int] = boards[index + 1].players[player_index]["frames"][assignment.frame - 1]["throws"]
        if assignment.throw_in_frame == 1:
            pins = frame_throws[0]
            if pins in (0, 1):
                weak = {"kind": "first-throw", "pins": pins}
            prior_frames = before.players[player_index]["frames"][:assignment.frame - 1]
            prior_count = len(prior_frames)
            if prior_count >= 3:
                prior_total = sum(frame["throws"][0] for frame in prior_frames)
                # Compare exact means. Each cutoff pair guarantees at least a two-pin gap.
                if pins <= 6 and prior_total >= 8 * prior_count:
                    personal_pace = {"kind": "below-usual", "priorFirstBallCount": prior_count}
                elif pins >= 6 and prior_total <= 4 * prior_count:
                    personal_pace = {"kind": "above-usual", "priorFirstBallCount": prior_count}
        elif assignment.throw_in_frame == 2:
            first = next(
                (normalized_log[pos].get("pinsKnockedDown") for pos, ass in enumerate(full_board.assignments[:index])
                 if ass.player_index == player_index and ass.frame == assignment.frame and ass.throw_in_frame == 1),
                None,
            )
            pins = current.get("pinsKnockedDown")
            if first is not None and pins is not None and first + pins < 10 and first + pins <= 5:
                weak = {"kind": "open-frame", "framePins": first + pins}

        points = current_points[player_index] if player_index < len(current_points) else 0
        others = [value for pos, value in enumerate(current_points) if pos != player_index]
        before_points_for_player = before_points[player_index] if player_index < len(before_points) else 0
        before_other = [value for pos, value in enumerate(before_points) if pos != player_index]
        before_pos = "unique-leader" if before_unique and before_leader == player_index else (
            "tied-leader" if before_leader is None and before_points and before_points_for_player == max(before_points)
            else "behind")
        current_pos = "unique-leader" if current_unique and current_leader == player_index else (
            "tied-leader" if current_leader is None and current_points and points == max(current_points)
            else "behind")
        comparative = bool(others)
        standing = {
            "metric": "earned-points-lower-bound-v1",
            "points": points,
            "highestOtherPoints": max(others) if others else None,
            "gapToHighestOther": points - max(others) if others else None,
            "position": current_pos if comparative else None,
            "unequalProgress": comparative and current_unequal,
        }
        before_standing = {
            "metric": standing["metric"], "points": before_points_for_player,
            "highestOtherPoints": max(before_other) if before_other else None,
            "gapToHighestOther": before_points_for_player - max(before_other) if before_other else None,
            "position": before_pos if comparative else None,
            "unequalProgress": comparative and _unequal_progress(before),
        }
        result.append({
            "version": 1,
            "revision": revision,
            "previousClearance": clearance,
            "weakPerformance": weak,
            **({"pinPattern": pin_patterns[index]} if index in pin_patterns else {}),
            **({"opponentName": named_pair[1 - player_index]} if named_pair is not None else {}),
            **({"personalPace": personal_pace} if personal_pace is not None else {}),
            "framePins": sum(frame_throws),
            "before": before_standing,
            "current": standing,
            "valid": True,
        })
    return result
