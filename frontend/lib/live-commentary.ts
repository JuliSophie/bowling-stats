import type { LiveCommentaryContext } from '@/types';
import { strikeStreakLength } from './live-effects.ts';
import { evidenceFor, evidenceShapeValid, standing, isCanonicalSplit, equalSets } from './live-commentary-evidence.ts';
import { selectTemplate } from './live-commentary-templates.ts';

export type LiveCommentaryThrow = {
  throwId?: string;
  player?: string;
  frame?: number;
  throw?: number;
  pinsKnockedDown?: number | null;
  fallenPins?: number[] | null;
  alreadyDownPins?: number[] | null;
  playerIndex?: number | null;
  commentaryContext?: Partial<LiveCommentaryContext> | null;
};

export type LiveCommentaryCatalog = {
  release?: string;
  scenarios?: Array<{
    id: string;
    priority?: number;
    enabled?: boolean;
    templates?: string[];
    templateIds?: string[];
    templateSelectionIds?: string[];
    bindings?: string[];
    kind?: string;
    legacyLiveScenario?: string;
  }>;
};

export type LiveCommentary = {
  text: string;
  scenario: string;
  throwId: string;
  player: string;
  pins: number | null;
  pin?: number;
};

export function liveCommentaryKey(event: Pick<LiveCommentaryThrow, 'throwId' | 'playerIndex' | 'player' | 'frame' | 'throw'>) {
  return event.throwId ?? (event.playerIndex != null
    ? `\u0000${event.playerIndex}:${event.frame ?? 0}:${event.throw ?? 0}`
    : `${event.player ?? ''}:${event.frame ?? 0}:${event.throw ?? 0}`);
}

export function acceptsLiveRevision(currentRevision: number, incomingRevision: number) {
  return incomingRevision >= currentRevision;
}

export function acceptsLiveEvent(
  currentSessionId: string,
  eventSessionId: string | undefined,
  currentRevision: number,
  eventRevision: number,
) {
  return (!eventSessionId || eventSessionId === currentSessionId)
    && acceptsLiveRevision(currentRevision, eventRevision);
}

/** A score snapshot is authoritative for every row it contains, even when a same-revision
 * throw event arrives later over the socket. */
export function shouldAnimateLiveThrow(throwId: string | undefined, authoritativeThrowIds: Set<string>) {
  return !throwId || !authoritativeThrowIds.has(throwId);
}

export function reconcileLiveCommentary(
  current: Record<string, LiveCommentary>,
  throws: LiveCommentaryThrow[],
  catalog?: LiveCommentaryCatalog,
) {
  return Object.fromEntries(
    throws.map((item, index) => {
      const id = liveCommentaryKey(item);
      if (!current[id]) return null;
      return [id, selectLiveCommentary(item, throws.slice(0, index), catalog)] as const;
    }).filter((entry): entry is readonly [string, LiveCommentary] => Boolean(entry)),
  );
}

function liveStrikeStreak(event: LiveCommentaryThrow, history: LiveCommentaryThrow[]) {
  if (event.playerIndex == null || typeof event.player !== 'string'
    || typeof event.frame !== 'number' || typeof event.throw !== 'number') return 0;
  const previous = history.flatMap((item) =>
    liveCommentaryKey(item) !== liveCommentaryKey(event)
      && item.playerIndex != null && typeof item.player === 'string'
      && typeof item.frame === 'number' && typeof item.throw === 'number'
      ? [{ player: item.player, playerIndex: item.playerIndex, frame: item.frame,
        throw: item.throw, pinsKnockedDown: item.pinsKnockedDown }]
      : []);
  return strikeStreakLength({
    player: event.player, playerIndex: event.playerIndex, frame: event.frame,
    throw: event.throw, pinsKnockedDown: event.pinsKnockedDown,
  }, previous);
}

/** Deterministic selection based only on the throw, its relevant prior context, and the active catalog. */
export function selectLiveCommentary(
  event: LiveCommentaryThrow,
  history: LiveCommentaryThrow[] = [],
  catalog?: LiveCommentaryCatalog,
): LiveCommentary {
  const throwId = liveCommentaryKey(event);
  const player = event.player?.trim() || 'Spieler';
  const count = Number.isInteger(event.pinsKnockedDown) ? event.pinsKnockedDown! : null;
  const currentEvidence = evidenceFor(event);
  const sameFrame = history.filter((item) => (
    event.playerIndex != null || item.playerIndex != null
      ? event.playerIndex != null && item.playerIndex === event.playerIndex && item.frame === event.frame
      : item.player === event.player && item.frame === event.frame
  ));
  const prior = sameFrame.find((item) => item.throw === 1);
  const priorStanding = prior ? standing(prior) : null;
  const currentStanding = currentEvidence ? standing(event) : null;
  const priorEvidence = prior ? evidenceFor(prior) : null;
  const evidenceIsValid = evidenceShapeValid(event) && (!prior || evidenceShapeValid(prior));
  const sameRackEvidenceIsConsistent = !priorEvidence || !currentEvidence || event.throw !== 2
    || (prior?.pinsKnockedDown === 10
      ? currentEvidence.alreadyDown.size === 0
      : equalSets(currentEvidence.alreadyDown, priorEvidence.fallen));
  let scenario = 'live.throw';
  let pin: number | undefined;

  if (event.throw === 1 && currentEvidence && currentEvidence.alreadyDown.size === 0 && currentStanding?.size === 1) {
    scenario = 'live.leave.single';
    pin = [...currentStanding][0];
  } else if (event.frame === 10 && event.throw === 3) {
    scenario = 'live.bonus';
  } else if (event.frame === 10 && event.throw === 2 && prior?.pinsKnockedDown === 10) {
    scenario = 'live.bonus';
  } else if (event.throw === 2 && sameRackEvidenceIsConsistent && priorStanding && currentEvidence && [...priorStanding].every((candidate) => currentEvidence.fallen.has(candidate))) {
    scenario = isCanonicalSplit(priorStanding)
      ? 'live.split.converted' : 'live.spare';
  } else if (
    event.throw === 2
    && prior?.pinsKnockedDown != null
    && prior.pinsKnockedDown < 10
    && count != null
    && evidenceIsValid
    && !(currentEvidence && priorEvidence)
    && prior.pinsKnockedDown + count === 10
  ) {
    scenario = 'live.spare';
  } else if (event.throw === 2 && sameRackEvidenceIsConsistent && priorStanding?.size === 1 && currentEvidence) {
    pin = [...priorStanding][0];
    if (!currentEvidence.fallen.has(pin)) scenario = 'live.miss.single';
    else scenario = 'live.spare';
  } else if (evidenceIsValid && event.throw === 1 && count === 10 && (!currentEvidence || currentEvidence.fallen.size === 10)) {
    scenario = 'live.strike';
  } else if (evidenceIsValid && sameRackEvidenceIsConsistent && event.throw !== 1 && count != null && count < 10) {
    scenario = 'live.open';
  }

  // Context is authoritative proof supplied by the replay service.  Never infer these
  // claims from names or from a same-frame heuristic in the browser.
  const context = event.commentaryContext;
  const before = context?.before;
  const current = context?.current;
  const comparable = context?.version === 1 && context?.valid === true
    && Boolean(before?.position && current?.position);
  const clearance = context?.version === 1 && context.valid === true
    && (context.previousClearance?.kind === 'strike' || context.previousClearance?.kind === 'spare')
    ? context.previousClearance.kind : null;
  if (clearance) {
    const mark = count === 0 ? 'zero' : count === 1 ? 'one' : null;
    if (mark) {
      scenario = comparable && before?.position === 'unique-leader' && current?.position === 'behind'
        ? `live.postclearance.${mark}.lead_lost`
        : comparable && current?.position === 'unique-leader'
          ? `live.postclearance.${mark}.leader` : `live.postclearance.${mark}`;
    }
  } else if (context?.weakPerformance && comparable && before?.position === 'unique-leader') {
    const weakPrefix = context.weakPerformance.kind === 'first-throw' ? 'live.weak.first' : 'live.weak.open';
    scenario = current?.position === 'unique-leader' ? `${weakPrefix}.leader` : scenario;
  }

  const baseScenario = scenario;
  const frame = Number.isInteger(event.frame) && event.frame! >= 1 && event.frame! <= 10 ? event.frame : null;
  const opponent = context?.version === 1 && context.valid === true
    && typeof context.opponentName === 'string'
    && context.opponentName.trim()
    && context.opponentName.trim().toLocaleLowerCase('de-DE') !== player.toLocaleLowerCase('de-DE')
    ? context.opponentName.trim() : null;
  const streak = (scenario === 'live.strike' || scenario === 'live.bonus') && count === 10 && evidenceIsValid
    ? liveStrikeStreak(event, history) : 0;
  const bindings: Record<string, string> = { player, pins: count == null ? '–' : String(count),
    ...(clearance === null ? {} : { clearance: clearance === 'strike' ? 'Strike' : 'Spare' }),
    ...(pin === undefined ? {} : { pin: String(pin) }),
    ...(frame == null ? {} : { frame: String(frame) }),
    ...(event.throw === 1 && count != null && count < 10 ? { remaining: String(10 - count) } : {}),
    ...(opponent ? { opponent } : {}),
    ...(streak >= 4 ? { streak: String(streak) } : {}) };
  const pattern = context?.version === 1 && context.valid === true ? context.pinPattern : undefined;
  if (pattern && currentEvidence && evidenceIsValid && sameRackEvidenceIsConsistent) {
    let specific: string | undefined;
    switch (pattern.kind) {
      case 'recurring-leave':
        if (scenario === 'live.leave.single' && pin === pattern.pin) specific = 'live.leave.recurring';
        break;
      case 'strong-side-spare':
        if (scenario === 'live.spare' && event.throw === 2 && currentEvidence.alreadyDown.size === 9
          && currentEvidence.fallen.has(pattern.pin)
          && ((pattern.side === 'left' && [2, 4, 7, 8].includes(pattern.pin))
            || (pattern.side === 'right' && [3, 6, 9, 10].includes(pattern.pin)))) specific = 'live.spare.strong_side';
        break;
      default: pattern satisfies never;
    }
    if (specific) {
      const specificBindings: Record<string, string> = { ...bindings, pin: String(pattern.pin) };
      if (pattern.kind === 'strong-side-spare') specificBindings.side = pattern.side === 'left' ? 'links' : 'rechts';
      const text = selectTemplate(specific, throwId, specificBindings, catalog);
      if (text) return { text, scenario: specific, throwId, player, pins: count, pin: pattern.pin };
    }
  }
  if (scenario === 'live.throw' && event.throw === 1 && frame != null
    && count != null && count >= 0 && count < 10 && evidenceIsValid
    && (!context?.previousClearance || (context.version === 1 && context.valid === true))) {
    const pace = context?.version === 1 && context.valid === true
      && context.personalPace && context.personalPace.priorFirstBallCount >= 3
      ? context.personalPace.kind : null;
    scenario = pace === 'below-usual' ? 'live.throw.first.below_usual'
      : pace === 'above-usual' ? 'live.throw.first.above_usual'
        : count <= 3 ? 'live.throw.first.low'
          : count <= 7 ? 'live.throw.first.mid' : 'live.throw.first.high';
  } else if (scenario === 'live.open' && frame != null && frame >= 8) {
    scenario = 'live.open.late';
  } else if (streak >= 4) {
    scenario = 'live.strike.streak';
  } else if (streak === 3) {
    scenario = opponent ? 'live.strike.turkey.opponent' : 'live.strike.turkey';
  } else if (streak === 2) {
    scenario = 'live.strike.double';
  }

  const allowLegacyGeneric = event.throw === 1 && count !== null && count >= 0 && count < 10
    && Number.isInteger(event.frame) && event.frame! >= 1 && event.frame! <= 10 && evidenceIsValid;
  const candidates = [scenario];
  if (scenario === 'live.strike.turkey.opponent') candidates.push('live.strike.turkey');
  if (scenario === 'live.throw.first.below_usual' || scenario === 'live.throw.first.above_usual') {
    candidates.push(count != null && count <= 3 ? 'live.throw.first.low'
      : count != null && count <= 7 ? 'live.throw.first.mid' : 'live.throw.first.high');
  }
  if (scenario !== baseScenario) candidates.push(baseScenario);
  if (baseScenario !== 'live.throw') candidates.push('live.throw');
  let text: string | null = null;
  for (const candidate of candidates) {
    text = selectTemplate(candidate, throwId, bindings, catalog, allowLegacyGeneric);
    if (text) {
      scenario = candidate;
      break;
    }
  }
  if (!text) scenario = baseScenario;
  return { text: text ?? 'Wurf registriert.', scenario, throwId, player, pins: count, ...(pin === undefined ? {} : { pin }) };
}
