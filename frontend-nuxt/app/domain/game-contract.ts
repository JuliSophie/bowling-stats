import type { FrameData, GameRead, StoredScore } from "../../../frontend/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validFrame(value: unknown): value is FrameData {
  if (!isObject(value) ||
    !["throw1", "throw2", "throw3", "cumulative"].every((key) => typeof value[key] === "string")) return false;
  if (value.split !== undefined && value.split !== null) {
    const split = value.split;
    if (!isObject(split) || typeof split.isSplit !== "boolean" ||
      typeof split.converted !== "boolean" || !Array.isArray(split.standingPins) ||
      !split.standingPins.every((pin) => Number.isInteger(pin) && pin >= 1 && pin <= 10) ||
      new Set(split.standingPins).size !== split.standingPins.length) return false;
  }
  return true;
}
function validScore(value: unknown): value is StoredScore {
  return isObject(value) && typeof value.player_name === "string" &&
    typeof value.total_score === "number" && Number.isFinite(value.total_score) &&
    Array.isArray(value.frames) && value.frames.length <= 10 && value.frames.every(validFrame);
}
function validGame(value: unknown): value is GameRead {
  return isObject(value) && Number.isInteger(value.id) && typeof value.played_at === "string" &&
    typeof value.location === "string" && typeof value.mode === "string" &&
    (value.played_at_time == null || typeof value.played_at_time === "string") &&
    Array.isArray(value.scores) && value.scores.every(validScore);
}
export function validateGames(value: unknown): GameRead[] {
  if (!Array.isArray(value) || !value.every(validGame)) {
    throw new Error("Die Demo-Spieldaten haben ein ungültiges Format.");
  }
  return value;
}
