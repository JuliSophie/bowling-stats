import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import type { FrameData, GameRead } from "../../frontend/types";
import { groupGames, winnerNames, dayPlayers } from "../app/domain/legacy";
import { validateGames } from "../app/domain/game-contract";
import { addPersonalBestData, buildGameChartData, getPersonalBestGame } from "../../frontend/lib/game-chart-data";
import { getFrameType } from "../../frontend/lib/frame-utils";

const fixture = validateGames(JSON.parse(readFileSync(new URL("../public/fixtures/games.json", import.meta.url), "utf8")));
const frame = (throw1: string, throw2: string, cumulative: string, throw3 = ""): FrameData =>
  ({ throw1, throw2, throw3, cumulative });
const game = (id: number, date: string, scores: GameRead["scores"] = []): GameRead =>
  ({ id, played_at: date, location: "Test", mode: "synthetic", scores });

test("groups newest first, numeric game order and stable day ties", () => {
  const games = [game(2, "2026-01-01"), game(1, "2026-01-01"), game(3, "2026-02-01")];
  assert.deepEqual(groupGames(games).map((entry) => [entry.date, entry.games.map((item) => item.id)]),
    [["2026-02-01", [3]], ["2026-01-01", [1, 2]]]);
  const tied = fixture.find((item) => item.id === 9008)!;
  assert.deepEqual(winnerNames(tied), ["Mira", "Noah"]);
  assert.deepEqual(dayPlayers([tied]).map((player) => player.name), ["Mira", "Noah"]);
});

test("chart data preserves gaps and exact cumulative open percentages", () => {
  const frames: FrameData[] = [];
  frames[0] = frame("5", "-", "5");
  frames[2] = frame("7", "/", "20");
  const data = buildGameChartData(game(1, "2026-01-01", [{ player_name: "A", total_score: 20, frames }]));
  assert.deepEqual(data, [
    { frame: "1", roundNumber: 10, A: 5, A_type: "normal", openFrameRate: 100 },
    { frame: "2", roundNumber: 20, openFrameRate: 100 },
    { frame: "3", roundNumber: 30, A: 20, A_type: "spare", openFrameRate: 50 },
  ]);
});

test("personal best keeps first tied game and does not extend current chart length", () => {
  const first = game(1, "2026-01-01", [{ player_name: "A", total_score: 100, frames: [frame("5", "-", "5")] }]);
  const tie = game(2, "2026-01-02", [{ player_name: "A", total_score: 100, frames: [frame("9", "-", "9")] }]);
  assert.equal(getPersonalBestGame([first, tie], "A"), first);
  const data = buildGameChartData(first);
  addPersonalBestData(data, first, [first, tie]);
  assert.equal(data.length, 1);
  assert.equal(data[0]["A PB"], 5);
  assert.equal(getFrameType(frame("X", "X", "300", "X")), "strike");
  assert.equal(getFrameType(frame("7", "/", "150", "5")), "spare");
});

test("runtime contract rejects malformed nested frames and keeps optional metadata", () => {
  assert.deepEqual(validateGames([]), []);
  for (const invalid of [null, {}, [{ id: 1 }]]) assert.throws(() => validateGames(invalid));
  for (const split of [
    { isSplit: true },
    { isSplit: true, converted: false, standingPins: [0, 11] },
    { isSplit: true, converted: false, standingPins: [7, 7] },
    { isSplit: "yes", converted: true, standingPins: [7, 10] },
  ]) {
    const value = JSON.parse(JSON.stringify(fixture));
    value[0].scores[0].frames[0].split = split;
    assert.throws(() => validateGames(value));
  }
  const oversized = structuredClone(fixture);
  oversized[0].scores[0].frames.push(frame("-", "-", "300"));
  assert.throws(() => validateGames(oversized));
  const withMetadata = fixture.map((item) => ({ ...item, unrelatedMetadata: { preserved: true } }));
  assert.equal(validateGames(withMetadata), withMetadata);
});

test("all complete synthetic games have legal deliveries, totals and every cumulative score", () => {
  for (const item of fixture) {
    for (const score of item.scores.filter((entry) => entry.frames.length === 10)) {
      const rolls: number[] = [];
      for (const [index, current] of score.frames.entries()) {
        const symbols = [current.throw1, current.throw2, current.throw3].filter(Boolean);
        if (index < 9) {
          assert.equal(current.throw3, "", `${item.id}: no third roll before tenth frame`);
          assert.equal(symbols.length, current.throw1 === "X" ? 1 : 2);
        } else {
          assert.equal(symbols.length, current.throw1 === "X" || current.throw2 === "/" ? 3 : 2);
        }
        let previous = 0;
        const pins = symbols.map((symbol) => {
          const value = symbol === "X" ? 10 : symbol === "/" ? 10 - previous : symbol === "-" ? 0 : Number(symbol);
          assert.ok(Number.isInteger(value) && value >= 0 && value <= 10);
          previous = value;
          rolls.push(value);
          return value;
        });
        if (current.throw1 !== "X") assert.ok(pins[0] + pins[1] <= 10);
        if (index === 9 && pins[0] === 10 && pins[1] !== 10) assert.ok(pins[1] + pins[2] <= 10);
        if (current.split?.isSplit) {
          assert.equal(current.split.standingPins.length, 10 - pins[0]);
          assert.equal(current.split.converted, current.throw2 === "/");
        }
      }
      let cursor = 0;
      let cumulative = 0;
      score.frames.forEach((current, index) => {
        const strike = rolls[cursor] === 10;
        const spare = !strike && rolls[cursor] + rolls[cursor + 1] === 10;
        const length = index === 9 ? rolls.length - cursor : strike || spare ? 3 : 2;
        cumulative += rolls.slice(cursor, cursor + length).reduce((sum, value) => sum + value, 0);
        cursor += index === 9 ? length : strike ? 1 : 2;
        assert.equal(Number(current.cumulative), cumulative, `${item.id}/${score.player_name}/frame ${index + 1}`);
      });
      assert.equal(cumulative, score.total_score);
    }
  }
});

test("fixture has both split outcomes and an actual late lead change", () => {
  const splits = fixture.flatMap((item) => item.scores.flatMap((score) => score.frames.flatMap((entry) =>
    entry.split?.isSplit ? [entry.split] : [])));
  assert.ok(splits.some((split) => split.converted));
  assert.ok(splits.some((split) => !split.converted));
  const comeback = fixture.find((item) => item.id === 9009)!;
  const [noah, mira] = comeback.scores;
  assert.ok(Number(noah.frames[6].cumulative) > Number(mira.frames[6].cumulative));
  assert.ok(Number(noah.frames[7].cumulative) < Number(mira.frames[7].cumulative));
  const perfect = fixture.find((item) => item.id === 9007)!.scores[0];
  assert.equal(perfect.total_score, 300);
  assert.equal(perfect.frames[9].throw3, "X");
});
