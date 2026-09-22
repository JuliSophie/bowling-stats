"""Strict commentary evidence; the existing live scorer remains authoritative."""
from __future__ import annotations

from app.live_scoring import compute_scoreboard


def _pins(value: object, previous: int | None = None) -> int:
    if isinstance(value, bool):
        raise ValueError("Ungültiger Wurfwert.")
    text = str(value).strip().upper()
    if text == "X":
        return 10
    if text == "/":
        if previous is None or previous >= 10:
            raise ValueError("Spare ohne gültigen vorherigen Wurf.")
        return 10 - previous
    if text in ("-", "F"):
        return 0
    if text.isascii() and text.isdigit() and 0 <= int(text) <= 10:
        return int(text)
    raise ValueError("Fehlender oder ungültiger Wurfwert.")


def _frame_rolls(frame: dict, index: int) -> list[int]:
    first = _pins(frame.get("throw1"))
    values = [first]
    second_raw = frame.get("throw2", "")
    third_raw = frame.get("throw3", "")
    if index < 9 and first == 10:
        if str(second_raw).strip() or str(third_raw).strip():
            raise ValueError("Zusätzlicher Wurf nach Strike.")
        return values
    second = _pins(second_raw, first if first < 10 else None)
    values.append(second)
    if first < 10 and first + second > 10:
        raise ValueError("Mehr als zehn Pins auf demselben Rack.")
    if index == 9 and (first == 10 or first + second == 10):
        third = _pins(third_raw, second if first == 10 and second < 10 else None)
        if first == 10 and second < 10 and second + third > 10:
            raise ValueError("Ungültiger Bonuswurf auf demselben Rack.")
        values.append(third)
    elif str(third_raw).strip():
        raise ValueError("Nicht erlaubter dritter Wurf.")
    return values


def _pin_sets(frame: dict, rolls: list[int], index: int) -> list[set[int]] | None:
    raw = frame.get("fallenPins")
    if not isinstance(raw, list) or len(raw) != len(rolls):
        return None
    down: set[int] = set()
    result: list[set[int]] = []
    for ball, (pins, count) in enumerate(zip(raw, rolls)):
        if not isinstance(pins, list) or any(type(pin) is not int or not 1 <= pin <= 10 for pin in pins):
            return None
        current = set(pins)
        if len(current) != len(pins) or len(current) != count or down & current:
            return None
        result.append(current)
        down |= current
        if index == 9 and len(down) == 10:
            down = set()
    return result


def score_evidence(frames: object, total: int) -> dict:
    invalid = {"valid": False, "reason": "Vollständige Wurfdaten fehlen.", "counterfactuals": [],
               "strike_count": 0, "spare_count": 0, "open_count": 0, "clean": False}
    if not isinstance(frames, list) or len(frames) != 10 or not all(isinstance(frame, dict) for frame in frames):
        return invalid
    try:
        parsed = [_frame_rolls(frame, index) for index, frame in enumerate(frames)]
    except ValueError as exc:
        return {**invalid, "reason": str(exc)}
    rolls = [pins for frame in parsed for pins in frame]
    scored = compute_scoreboard(rolls, 1, ["Spieler"])
    if not scored.is_finished or scored.players[0]["total"] != total:
        return {**invalid, "reason": "Wurfdaten und gespeicherte Gesamtpunktzahl widersprechen sich."}
    strike_count = sum(frame[0] == 10 for frame in parsed)
    spare_count = sum(frame[0] < 10 and sum(frame[:2]) == 10 for frame in parsed)
    open_count = 10 - strike_count - spare_count
    alternatives = []
    leaves = []
    offset = 0
    for index, frame in enumerate(parsed):
        positions = _pin_sets(frames[index], frame, index)
        if frame[0] < 10 and positions is not None:
            standing = sorted(set(range(1, 11)) - positions[0])
            leaves.append({"frame": index + 1, "standing_pins": standing,
                           "converted": sum(frame[:2]) == 10})
        second_is_foul = str(frames[index].get("throw2", "")).strip().upper() == "F"
        if index < 9 and len(frame) == 2 and sum(frame) == 9 and not second_is_foul:
            changed = list(rolls)
            changed[offset + 1] += 1
            hypothetical = compute_scoreboard(changed, 1, ["Spieler"]).players[0]["total"]
            item = {"frame": index + 1, "original_score": total, "hypothetical_score": hypothetical,
                    "gain": hypothetical - total, "pins_added": 1, "single_pin_attempt": frame[0] == 9}
            if positions is not None:
                remaining = set(range(1, 11)) - positions[0] - positions[1]
                if len(remaining) == 1:
                    item["pin"] = next(iter(remaining))
            alternatives.append(item)
        offset += len(frame)
    cumulative = [frame["cumulative"] for frame in scored.players[0]["frames"]]
    points = [value - (cumulative[index - 1] if index else 0) for index, value in enumerate(cumulative)]
    return {"valid": True, "counterfactuals": alternatives, "strike_count": strike_count,
            "spare_count": spare_count, "open_count": open_count, "clean": open_count == 0,
            "frame_points": points, "leaves": leaves}
