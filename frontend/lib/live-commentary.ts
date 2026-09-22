export type LiveCommentaryThrow = {
  throwId?: string;
  player?: string;
  frame?: number;
  throw?: number;
  pinsKnockedDown?: number | null;
  fallenPins?: number[] | null;
  alreadyDownPins?: number[] | null;
  playerIndex?: number | null;
  commentaryContext?: LiveCommentaryContext | null;
};

type LiveStandingContext = {
  position?: 'unique-leader' | 'tied-leader' | 'behind' | null;
  points?: number;
};
type LiveCommentaryContext = {
  version?: 1;
  previousClearance?: { throwId?: string; kind: 'strike' | 'spare' } | null;
  weakPerformance?: { kind: 'first-throw' | 'open-frame' } | null;
  before?: LiveStandingContext | null;
  current?: LiveStandingContext | null;
  valid?: boolean;
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
      const id = item.throwId;
      if (!id || !current[id]) return null;
      return [id, selectLiveCommentary(item, throws.slice(0, index), catalog)] as const;
    }).filter((entry): entry is readonly [string, LiveCommentary] => Boolean(entry)),
  );
}

const pins = new Set(Array.from({ length: 10 }, (_, index) => index + 1));
function validSet(value: number[] | null | undefined) {
  if (!Array.isArray(value)) return null;
  if (!value.every((pin) => Number.isInteger(pin) && pins.has(pin))) return null;
  const result = new Set(value);
  return result.size === value.length ? result : null;
}

function evidenceFor(item: LiveCommentaryThrow) {
  const fallen = validSet(item.fallenPins);
  const alreadyDown = item.alreadyDownPins == null ? new Set<number>() : validSet(item.alreadyDownPins);
  if (!alreadyDown) return null;
  if (!fallen || [...fallen].some((pin) => alreadyDown.has(pin))) return null;
  const count = item.pinsKnockedDown;
  if (count == null || count !== fallen.size) return null;
  return { fallen, alreadyDown };
}

function evidenceShapeValid(item: LiveCommentaryThrow) {
  const hasEvidence = item.fallenPins != null || item.alreadyDownPins != null;
  return !hasEvidence || evidenceFor(item) !== null;
}

function standing(item: LiveCommentaryThrow) {
  const evidence = evidenceFor(item);
  if (!evidence) return null;
  return new Set([...pins].filter((pin) => !evidence.fallen.has(pin) && !evidence.alreadyDown.has(pin)));
}

function isCanonicalSplit(standingPins: Set<number>) {
  return standingPins.size === 2 && standingPins.has(7) && standingPins.has(10);
}

function equalSets(left: Set<number>, right: Set<number>) {
  return left.size === right.size && [...left].every((pin) => right.has(pin));
}

function hash(value: string) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rendezvous(seed: string, candidates: Array<{ id: string; text: string }>) {
  return candidates
    .map((candidate) => ({ ...candidate, score: hash(`${seed}|${candidate.id}`) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

function render(template: string, bindings: Record<string, string>) {
  const placeholders = [...template.matchAll(/\{\{?\s*([a-zA-Z][\w]*)\s*\}?\}/g)].map((match) => match[1]);
  if (placeholders.some((name) => !(name in bindings))) return null;
  const unknown = template.replace(/\{\{?\s*[a-zA-Z][\w]*\s*\}?\}/g, '').match(/[{}]/);
  if (unknown) return null;
  return template.replace(/\{\{?\s*([a-zA-Z][\w]*)\s*\}?\}/g, (_, name: string) => bindings[name]);
}

function selectTemplate(scenario: string, throwId: string, bindings: Record<string, string>, catalog?: LiveCommentaryCatalog, allowLegacyGeneric = false) {
  const entry = catalog?.scenarios?.find((item) => item.id === scenario);
  const legacyEntry = catalog?.scenarios?.find((item) =>
    item.kind === 'legacy-live' && item.legacyLiveScenario === scenario);
  const sourceEntry = entry ?? legacyEntry;
  if (scenario === 'live.throw' && sourceEntry?.kind === 'legacy-live' && !allowLegacyGeneric) return null;
  const source = sourceEntry
    ? (sourceEntry.enabled === false ? [] : sourceEntry.templates ?? [])
    : [];
  // Projected legacy pools keep their original rendezvous keys even after filtering.
  const ids = sourceEntry?.templateSelectionIds
    ?? (sourceEntry?.kind === 'legacy-live' ? [] : sourceEntry?.templateIds ?? []);
  const candidates = source.map((text, index) => ({ text: render(text, bindings), id: ids[index] ?? `${scenario}.${index + 1}` }))
    .filter((item): item is { text: string; id: string } => Boolean(item.text));
  return rendezvous(`${throwId}|${scenario}`, candidates)?.text ?? null;
}

/** Deterministic selection based only on the throw, its relevant prior context, and the active catalog. */
export function selectLiveCommentary(
  event: LiveCommentaryThrow,
  history: LiveCommentaryThrow[] = [],
  catalog?: LiveCommentaryCatalog,
): LiveCommentary {
  const throwId = event.throwId ?? `${event.player ?? ''}:${event.frame ?? 0}:${event.throw ?? 0}`;
  const player = event.player?.trim() || 'Spieler';
  const count = Number.isInteger(event.pinsKnockedDown) ? event.pinsKnockedDown! : null;
  const currentEvidence = evidenceFor(event);
  const sameFrame = history.filter((item) => (
    event.playerIndex != null && item.playerIndex != null
      ? item.playerIndex === event.playerIndex && item.frame === event.frame
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

  const bindings = { player, pins: count == null ? '–' : String(count),
    ...(clearance === null ? {} : { clearance: clearance === 'strike' ? 'Strike' : 'Spare' }),
    ...(pin === undefined ? {} : { pin: String(pin) }) };
  const allowLegacyGeneric = event.throw === 1 && count !== null && count >= 0 && count < 10
    && Number.isInteger(event.frame) && event.frame! >= 1 && event.frame! <= 10 && evidenceIsValid;
  let text = selectTemplate(scenario, throwId, bindings, catalog, allowLegacyGeneric);
  if (!text && scenario !== 'live.throw') {
    const neutral = selectTemplate('live.throw', throwId, bindings, catalog, allowLegacyGeneric);
    if (neutral) {
      scenario = 'live.throw';
      text = neutral;
    }
  }
  return { text: text ?? 'Wurf registriert.', scenario, throwId, player, pins: count, ...(pin === undefined ? {} : { pin }) };
}
