import type { LiveCommentaryThrow } from './live-commentary';

const pins = new Set(Array.from({ length: 10 }, (_, index) => index + 1));

function validSet(value: number[] | null | undefined) {
  if (!Array.isArray(value)) return null;
  if (!value.every((pin) => Number.isInteger(pin) && pins.has(pin))) return null;
  const result = new Set(value);
  return result.size === value.length ? result : null;
}

export function evidenceFor(item: LiveCommentaryThrow) {
  const fallen = validSet(item.fallenPins);
  const alreadyDown = item.alreadyDownPins == null ? new Set<number>() : validSet(item.alreadyDownPins);
  if (!alreadyDown) return null;
  if (!fallen || [...fallen].some((pin) => alreadyDown.has(pin))) return null;
  const count = item.pinsKnockedDown;
  if (count == null || count !== fallen.size) return null;
  return { fallen, alreadyDown };
}

export function evidenceShapeValid(item: LiveCommentaryThrow) {
  const hasEvidence = item.fallenPins != null || item.alreadyDownPins != null;
  return !hasEvidence || evidenceFor(item) !== null;
}

export function standing(item: LiveCommentaryThrow) {
  const evidence = evidenceFor(item);
  if (!evidence) return null;
  return new Set([...pins].filter((pin) => !evidence.fallen.has(pin) && !evidence.alreadyDown.has(pin)));
}

export function isCanonicalSplit(standingPins: Set<number>) {
  return standingPins.size === 2 && standingPins.has(7) && standingPins.has(10);
}

export function equalSets(left: Set<number>, right: Set<number>) {
  return left.size === right.size && [...left].every((pin) => right.has(pin));
}
