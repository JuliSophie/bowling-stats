"""Single-pin patterns from earlier frames in one player's current game."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Final, Literal, TypedDict

from app.live_scoring import ThrowAssignment


class RecurringLeave(TypedDict):
    kind: Literal["recurring-leave"]
    pin: int


class StrongSideSpare(TypedDict):
    kind: Literal["strong-side-spare"]
    pin: int
    side: Literal["left", "right"]


_RACK: Final = frozenset(range(1, 11))
# From the bowler's viewpoint; pins 1 and 5 lie on the centerline.
_LEFT: Final = frozenset({2, 4, 7, 8})
_RIGHT: Final = frozenset({3, 6, 9, 10})


class PinDelivery(TypedDict, total=False):
    pinsKnockedDown: int | None
    fallenPins: list[int] | None
    alreadyDownPins: list[int] | None
    observedFallenPins: list[int] | None
    observedPinsKnockedDown: int | None
    lowConfidence: bool
    manualCorrection: bool
    throwId: str


def _fallen(row: PinDelivery, down: frozenset[int]) -> frozenset[int] | None:
    """Require a consistent physical rack, including the count before normalization."""
    if row.get("lowConfidence") and not row.get("manualCorrection"):
        return None
    pins = row.get("fallenPins")
    if not isinstance(pins, list) or any(type(p) is not int or p not in _RACK for p in pins):
        return None
    fallen = frozenset(pins)
    if (row.get("alreadyDownPins") != sorted(down) or down & fallen
            or len(fallen) != len(pins) or len(fallen) != row.get("pinsKnockedDown")):
        return None
    raw_observed = row.get("observedFallenPins")
    if not row.get("manualCorrection") and raw_observed is not None:
        observed = frozenset(raw_observed)
        if observed not in (fallen, down | fallen):
            return None
        # Companion versions report either newly fallen pins or the cumulative display.
        if row.get("observedPinsKnockedDown") not in (None, len(observed), len(fallen)):
            return None
    return fallen


def live_pin_patterns(
    rows: Sequence[PinDelivery], assignments: Sequence[ThrowAssignment],
) -> dict[int, RecurringLeave | StrongSideSpare]:
    """Index facts by delivery. The current attempt enters history only after selection."""
    patterns: dict[int, RecurringLeave | StrongSideSpare] = {}
    attempts: defaultdict[int, list[tuple[int, bool]]] = defaultdict(list)
    leaves: dict[int, int | None] = {}
    incomplete: set[int] = set()
    for index, (row, assignment) in enumerate(zip(rows, assignments, strict=True)):
        player = assignment.player_index
        if player in incomplete:
            continue
        history = attempts[player]
        if assignment.throw_in_frame == 1:
            if row.get("pinsKnockedDown") != 9:
                continue
            fallen = _fallen(row, frozenset())
            if fallen is None:
                leaves[player] = None
                continue
            pin = next(iter(_RACK - fallen))
            leaves[player] = pin
            misses = history.count((pin, False))
            if (misses >= 3 and misses >= 2 * history.count((pin, True))
                    and 2 * misses > sum(not converted for _, converted in history)):
                patterns[index] = {"kind": "recurring-leave", "pin": pin}
        elif assignment.throw_in_frame == 2 and player in leaves:
            pin = leaves.pop(player)
            fallen = None if pin is None else _fallen(row, _RACK - {pin})
            if pin is None or fallen is None:
                # An unaccounted-for single-pin chance could change either comparison.
                incomplete.add(player)
                continue
            converted = pin in fallen
            if converted and pin in _LEFT | _RIGHT:
                same, other = (_LEFT, _RIGHT) if pin in _LEFT else (_RIGHT, _LEFT)
                on_side = [hit for number, hit in history if number in same]
                opposite = [hit for number, hit in history if number in other]
                if (len(on_side) >= 3 and all(on_side) and opposite.count(False) >= 2
                        and opposite.count(False) >= opposite.count(True)):
                    patterns[index] = {"kind": "strong-side-spare", "pin": pin,
                                       "side": "left" if pin in _LEFT else "right"}
            history.append((pin, converted))
    return patterns
