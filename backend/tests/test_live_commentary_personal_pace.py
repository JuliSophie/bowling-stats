from typing import Literal

import pytest

from app.services.live_commentary_context import build_live_commentary_context


@pytest.mark.parametrize(
    ("prior", "current", "expected"),
    [
        ([7, 8, 9], 6, "below-usual"),
        ([8, 8, 8, 8], 6, "below-usual"),
        ([7, 8, 8], 5, None),
        ([9, 9, 9], 7, None),
        ([8, 8], 6, None),
        ([], 6, None),
        ([3, 4, 5], 6, "above-usual"),
        ([4, 4, 5], 7, None),
        ([2, 2, 2], 5, None),
        ([0, 0, 0], 10, "above-usual"),
    ],
)
def test_personal_pace_compares_prior_first_ball_mean_to_current_first_ball(
    prior: list[int], current: int, expected: Literal["below-usual", "above-usual"] | None,
) -> None:
    counts = [pins for first in prior for pins in (first, 0)] + [current]

    context = build_live_commentary_context([{"pinsKnockedDown": pins} for pins in counts], 1)[-1]

    assert context["valid"] is True
    if expected is None:
        assert "personalPace" not in context
    else:
        assert context["personalPace"] == {"kind": expected, "priorFirstBallCount": len(prior)}


def test_personal_pace_keeps_duplicate_display_names_in_separate_roster_slots() -> None:
    counts = [8, 0, 4, 0] * 3 + [6, 0, 6]

    contexts = build_live_commentary_context(
        [{"pinsKnockedDown": pins} for pins in counts], 2, ["Alex", "Alex"],
    )

    assert contexts[-3]["personalPace"] == {"kind": "below-usual", "priorFirstBallCount": 3}
    assert contexts[-1]["personalPace"] == {"kind": "above-usual", "priorFirstBallCount": 3}


def test_personal_pace_excludes_second_balls_and_tenth_frame_fill_balls() -> None:
    counts = [4, 0] * 9 + [4, 6, 6]

    contexts = build_live_commentary_context([{"pinsKnockedDown": pins} for pins in counts], 1)

    assert all(row["valid"] and "personalPace" not in row for row in contexts[-3:])


@pytest.mark.parametrize(("bad_count", "reason"), [(None, "unknown-count"), (5, "illegal-rack")])
def test_personal_pace_is_withheld_when_a_later_throw_invalidates_the_replay(
    bad_count: int | None, reason: Literal["unknown-count", "illegal-rack"],
) -> None:
    counts = [8, 0] * 3 + [6, bad_count]

    contexts = build_live_commentary_context([{"pinsKnockedDown": pins} for pins in counts], 1)

    assert all(row["invalidReason"] == reason and "personalPace" not in row for row in contexts)
