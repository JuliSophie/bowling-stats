import type { LiveEvent, ThrowAnalysis } from '@/types';

export type ThrowEffectKind = 'throw' | 'spare' | 'strike' | 'double' | 'turkey';
export type ThrowResult = Pick<ThrowAnalysis, 'player' | 'playerIndex' | 'frame' | 'throw' | 'pinsKnockedDown'>;

function samePlayer(left: ThrowResult, right: ThrowResult) {
  return left.playerIndex != null || right.playerIndex != null
    ? left.playerIndex != null && left.playerIndex === right.playerIndex
    : left.player === right.player;
}

export function isLiveThrow(event: LiveEvent): event is LiveEvent & { payload: ThrowAnalysis } {
  return event.type === 'throw_analyzed'
    && typeof event.payload.player === 'string'
    && typeof event.payload.frame === 'number'
    && typeof event.payload.throw === 'number';
}

/** Consecutive strike deliveries by this roster slot, including the current ball. */
export function strikeStreakLength(event: ThrowResult, previous: ThrowResult[]): number {
  if (event.pinsKnockedDown !== 10 || isSpare(event, previous)) return 0;
  let streak = 1;
  for (const item of [...previous].reverse()) {
    if (!samePlayer(item, event)) continue;
    if (item.pinsKnockedDown !== 10 || isSpare(item, previous)) break;
    streak += 1;
  }
  return streak;
}

/** Previous results may come from a snapshot; only the arriving throw is celebrated. */
export function classifyThrow(event: ThrowResult, previous: ThrowResult[]): ThrowEffectKind {
  if (event.pinsKnockedDown !== 10) return isSpare(event, previous) ? 'spare' : 'throw';
  const streak = strikeStreakLength(event, previous);
  if (streak === 0) return 'spare';
  if (streak >= 3) return 'turkey';
  if (streak === 2) return 'double';
  return 'strike';
}

function isSpare(event: ThrowResult, previous: ThrowResult[]): boolean {
  const pins = event.pinsKnockedDown;
  if (event.throw > 1 && pins != null) {
    const frameThrows = previous.filter((item) => samePlayer(item, event) && item.frame === event.frame);
    const prior = frameThrows.find((item) => item.throw === event.throw - 1);
    // The third ball shares a rack with ball two only after X followed by a non-strike.
    const sameRack = event.throw === 2
      || (event.frame === 10 && event.throw === 3 && frameThrows.find((item) => item.throw === 1)?.pinsKnockedDown === 10);
    return sameRack && prior?.pinsKnockedDown != null && prior.pinsKnockedDown < 10 && prior.pinsKnockedDown + pins === 10;
  }
  return false;
}

export function throwCellKey(player: string, frame: number, throwNumber: number) {
  return `${player}\u0000${frame}\u0000${throwNumber}`;
}
