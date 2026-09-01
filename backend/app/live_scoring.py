"""Pure bowling scoring engine for live tracking.

The companion only ever reports *throws* (pins knocked down, plus ball metrics) in the
order they happen. It does not know whose turn it is or which frame the game is on. This
module owns that logic: given the ordered throw log and the current player count, it
replays the throws into a per-player score table following standard 10-pin turn order.

Because it is a pure function of ``(throws, player_count)``, the whole table can be rebuilt
on the fly whenever the operator changes the player count — no mutable game state to drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TOTAL_FRAMES = 10


def _player_name(names: list[str], index: int) -> str:
    if index < len(names):
        candidate = names[index].strip()
        if candidate:
            return candidate
    return f"Spieler {index + 1}"


def _frame_complete(throws: list[int], frame_index: int) -> bool:
    """Is this frame finished (so the player passes the turn)?"""
    if frame_index < TOTAL_FRAMES - 1:
        if throws and throws[0] >= 10:  # strike: a single ball ends the frame
            return True
        return len(throws) >= 2
    # 10th frame: 3 balls if the first two earn a strike/spare, otherwise 2.
    if len(throws) < 2:
        return False
    if len(throws) == 2:
        earns_bonus = throws[0] >= 10 or throws[0] + throws[1] >= 10
        return not earns_bonus
    return len(throws) >= 3


@dataclass
class _Card:
    frames: list[list[int]] = field(default_factory=list)

    def open_frame(self) -> list[int]:
        """Return the frame currently accepting balls, starting a new one if needed."""
        if not self.frames or _frame_complete(self.frames[-1], len(self.frames) - 1):
            self.frames.append([])
        return self.frames[-1]

    def is_finished(self) -> bool:
        return len(self.frames) >= TOTAL_FRAMES and _frame_complete(self.frames[-1], TOTAL_FRAMES - 1)


@dataclass
class ThrowAssignment:
    player_index: int
    frame: int  # 1-based
    throw_in_frame: int  # 1-based


@dataclass
class ScoreboardResult:
    players: list[dict]
    assignments: list[ThrowAssignment]
    current_player_index: int
    current_frame: int  # 1-based
    current_throw: int  # 1-based
    is_finished: bool


def _balls_after(frames: list[list[int]], frame_index: int) -> list[int]:
    balls: list[int] = []
    for later in frames[frame_index + 1:]:
        balls.extend(later)
    return balls


def _score_card(frames: list[list[int]]) -> tuple[list[int | None], int]:
    """Standard cumulative scoring. Cumulative is ``None`` while bonus balls are still pending."""
    cumulative: list[int | None] = []
    running = 0
    pending = False
    for i, throws in enumerate(frames):
        if pending:
            cumulative.append(None)
            continue

        if i < TOTAL_FRAMES - 1:
            if throws and throws[0] >= 10:  # strike
                bonus = _balls_after(frames, i)
                if len(bonus) < 2:
                    pending = True
                    cumulative.append(None)
                    continue
                running += 10 + bonus[0] + bonus[1]
                cumulative.append(running)
            elif len(throws) >= 2:
                if throws[0] + throws[1] >= 10:  # spare
                    bonus = _balls_after(frames, i)
                    if len(bonus) < 1:
                        pending = True
                        cumulative.append(None)
                        continue
                    running += 10 + bonus[0]
                    cumulative.append(running)
                else:  # open frame
                    running += throws[0] + throws[1]
                    cumulative.append(running)
            else:
                pending = True
                cumulative.append(None)
        else:  # 10th frame
            earns_bonus = len(throws) >= 2 and (throws[0] >= 10 or throws[0] + throws[1] >= 10)
            if len(throws) >= 2 and not (earns_bonus and len(throws) < 3):
                running += sum(throws)
                cumulative.append(running)
            else:
                pending = True
                cumulative.append(None)

    total = next((value for value in reversed(cumulative) if value is not None), 0)
    return cumulative, total


def _next_player(cards: list[_Card], current: int) -> int:
    count = len(cards)
    for step in range(1, count + 1):
        candidate = (current + step) % count
        if not cards[candidate].is_finished():
            return candidate
    return current  # everyone is done


def compute_scoreboard(
    throws: list[int | None],
    player_count: int,
    player_names: list[str],
) -> ScoreboardResult:
    """Replay the ordered throw log into a per-player score table."""
    player_count = max(1, player_count)
    cards = [_Card() for _ in range(player_count)]
    assignments: list[ThrowAssignment] = []
    current = 0

    for raw_pins in throws:
        if all(card.is_finished() for card in cards):
            # Game over for the configured roster — ignore extra throws rather than guess.
            assignments.append(ThrowAssignment(current, TOTAL_FRAMES, 1))
            continue

        if cards[current].is_finished():
            current = _next_player(cards, current)

        card = cards[current]
        frame = card.open_frame()
        pins = max(0, min(10, raw_pins if raw_pins is not None else 0))
        frame.append(pins)

        assignments.append(
            ThrowAssignment(current, len(card.frames), len(frame))
        )

        if _frame_complete(frame, len(card.frames) - 1):
            current = _next_player(cards, current)

    players: list[dict] = []
    for index, card in enumerate(cards):
        cumulative, total = _score_card(card.frames)
        frames_out = []
        for frame_index, throws_in_frame in enumerate(card.frames):
            is_strike = bool(throws_in_frame) and throws_in_frame[0] >= 10
            is_spare = (
                not is_strike
                and len(throws_in_frame) >= 2
                and throws_in_frame[0] + throws_in_frame[1] >= 10
            )
            frames_out.append(
                {
                    "throws": throws_in_frame,
                    "cumulative": cumulative[frame_index],
                    "isStrike": is_strike,
                    "isSpare": is_spare,
                }
            )
        players.append(
            {
                "index": index,
                "name": _player_name(player_names, index),
                "frames": frames_out,
                "total": total,
                "isCurrent": index == current,
            }
        )

    # Where the *next* throw will land — drives the "Aktuell" header.
    next_card = cards[current]
    if next_card.frames and not _frame_complete(next_card.frames[-1], len(next_card.frames) - 1):
        current_frame = len(next_card.frames)
        current_throw = len(next_card.frames[-1]) + 1
    else:
        current_frame = min(TOTAL_FRAMES, len(next_card.frames) + 1)
        current_throw = 1

    return ScoreboardResult(
        players=players,
        assignments=assignments,
        current_player_index=current,
        current_frame=current_frame,
        current_throw=current_throw,
        is_finished=all(card.is_finished() for card in cards),
    )
