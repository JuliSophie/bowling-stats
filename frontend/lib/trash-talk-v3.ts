import type { GameRead, StoredScore } from '@/types';

export type CatalogScenario = {
  id: string;
  priority?: number;
  enabled?: boolean;
  templates: string[];
  templateIds?: string[];
  templateSelectionIds?: string[];
  bindings?: string[];
  kind?: string;
  legacyMetadata?: Record<string, unknown>;
  legacyParameters?: string[];
  legacyExport?: string;
  legacyPool?: string;
  legacyLiveScenario?: string;
};
import type { TrashTalkFragmentMetadata, TrashTalkMessageMetadata } from './trash-talk-v2/types';
export type TrashTalkCatalogSnapshot = {
  version: string;
  language: string;
  release?: string;
  scenarios: CatalogScenario[];
  legacyV2?: { messages: TrashTalkMessageMetadata[]; fragments: TrashTalkFragmentMetadata[] };
};
export type GameFacts = {
  games: GameRead[];
  byId: Map<number, GameRead>;
  byDate: Map<string, GameRead[]>;
  byPlayer: Map<string, GameRead[]>;
  duplicateIds: Set<number>;
};
type Counterfactual = {
  frame: number;
  hypotheticalScore: number;
  gap: number;
  outcome: 'win' | 'tie' | 'improve';
};
export type TrashTalkFactContext = {
  scope: 'score' | 'player-score' | 'day-score';
  score: number;
  playerName?: string;
  average?: number;
  won?: boolean;
  lost?: boolean;
  gameId?: number;
  playedAt?: string;
  facts?: GameFacts;
  scenarioFacts?: {
    personalBest?: number;
    personalBestGap?: number;
    personalBestUnique?: boolean;
    historyCount?: number;
    baselineCount?: number;
    dayBest?: boolean;
    dayBestTied?: boolean;
    rosterBest?: boolean;
    historicalRival?: { name: string; best: number; gap: number };
    rank?: number;
    rosterSize?: number;
    opponentCount?: number;
    strictLast?: boolean;
    tiedFirst?: boolean;
    strikes?: number;
    openFrames?: number;
    weakFinish?: boolean;
    rival?: { name: string; strikes: number; score: number };
    counterfactual?: Counterfactual;
    first200?: boolean;
    superseded?: boolean;
    dayRange?: number;
    dayGameCount?: number;
    trajectory?: 'improving' | 'declining';
    totalGap?: number;
  };
};
export type TrashTalkResult = {
  text: string;
  scenario: string;
  templateId: string;
  predicateVersion: string;
  catalogRelease: string;
  contextFingerprint: string;
  bindings: Record<string, string>;
};

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const validTotal = (value: number) => Number.isInteger(value) && value >= 0 && value <= 300;
const validTime = (value: string | null | undefined) => !!value && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value);
const timeSeconds = (value: string) => {
  const [hours, minutes, seconds = '0'] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

function temporalCompare(a: GameRead, b: GameRead): number | null {
  if (a.id === b.id) return 0;
  if (a.played_at !== b.played_at) return compareText(a.played_at, b.played_at);
  if (!validTime(a.played_at_time) || !validTime(b.played_at_time)) return null;
  const delta = timeSeconds(a.played_at_time!) - timeSeconds(b.played_at_time!);
  return delta === 0 ? null : Math.sign(delta);
}

export function indexGameFacts(games: readonly GameRead[]): GameFacts {
  const byId = new Map<number, GameRead>();
  const byDate = new Map<string, GameRead[]>();
  const byPlayer = new Map<string, GameRead[]>();
  const duplicateIds = new Set<number>();
  const ordered = [...games].sort((a, b) => a.id - b.id);
  for (const game of ordered) {
    if (byId.has(game.id)) duplicateIds.add(game.id);
    byId.set(game.id, game);
    byDate.set(game.played_at, [...(byDate.get(game.played_at) ?? []), game]);
    for (const name of new Set(game.scores.map((score) => score.player_name))) {
      byPlayer.set(name, [...(byPlayer.get(name) ?? []), game]);
    }
  }
  return { games: ordered, byId, byDate, byPlayer, duplicateIds };
}

export function playerHistory(facts: GameFacts, playerName: string, excludingGameId?: number) {
  return (facts.byPlayer.get(playerName) ?? []).filter((game) => game.id !== excludingGameId);
}
export function dayRoster(facts: GameFacts, date: string) {
  return [...new Set((facts.byDate.get(date) ?? []).flatMap((game) => game.scores.map((score) => score.player_name)))].sort(compareText);
}

function observations(facts: GameFacts, name: string, games = playerHistory(facts, name)) {
  const rows: Array<{ game: GameRead; score: StoredScore }> = [];
  for (const game of games) {
    const scores = game.scores.filter((score) => score.player_name === name);
    if (facts.duplicateIds.has(game.id) || scores.length !== 1 || !validTotal(scores[0].total_score)) return null;
    rows.push({ game, score: scores[0] });
  }
  return rows;
}

export function bestScoreForPlayer(facts: GameFacts, name: string, excludingGameId?: number) {
  const rows = observations(facts, name, playerHistory(facts, name, excludingGameId));
  if (!rows?.length) return null;
  const score = Math.max(...rows.map((row) => row.score.total_score));
  return { score, sampleCount: rows.length, ties: rows.filter((row) => row.score.total_score === score)
    .map((row) => ({ gameId: row.game.id, playedAt: row.game.played_at, score })) };
}

/** Histories of everyone on the target day, not merely scores from that date. */
export function bestScoreForDayRoster(facts: GameFacts, date: string) {
  const names = dayRoster(facts, date);
  const histories = names.map((name) => observations(facts, name));
  if (histories.some((rows) => rows === null)) return null;
  const rows = histories.flatMap((items) => items ?? []);
  if (!rows.length) return null;
  const score = Math.max(...rows.map((row) => row.score.total_score));
  return { score, sampleCount: rows.length, ties: rows.filter((row) => row.score.total_score === score)
    .map((row) => ({ gameId: row.game.id, playerName: row.score.player_name, score })) };
}

function validatedStyle(score: StoredScore) {
  const evidence = score.trash_talk_evidence;
  if (!evidence?.valid || ![evidence.strike_count, evidence.spare_count, evidence.open_count]
    .every((value) => Number.isInteger(value) && value >= 0 && value <= 10)
    || evidence.strike_count + evidence.spare_count + evidence.open_count !== 10) return null;
  return evidence;
}

export function buildGameContext(index: GameFacts, gameId: number, playerName: string): TrashTalkFactContext | null {
  const game = index.byId.get(gameId);
  if (!game || index.duplicateIds.has(gameId)) return null;
  const targets = game.scores.filter((score) => score.player_name === playerName);
  if (targets.length !== 1 || !validTotal(targets[0].total_score)) return null;
  const target = targets[0], score = target.total_score;
  const history = observations(index, playerName);
  const other = history?.filter((row) => row.game.id !== gameId);
  const personalBest = history?.length ? Math.max(...history.map((row) => row.score.total_score)) : undefined;
  const before = other?.filter((row) => temporalCompare(row.game, game) === -1) ?? [];
  const after = other?.filter((row) => temporalCompare(row.game, game) === 1) ?? [];
  const ambiguous = !other || other.some((row) => temporalCompare(row.game, game) === null);
  const priorBest = before.length ? Math.max(...before.map((row) => row.score.total_score)) : undefined;
  const average = other && other.length >= 3 ? other.reduce((sum, row) => sum + row.score.total_score, 0) / other.length : undefined;
  const ownDay = observations(index, playerName, playerHistory(index, playerName).filter((row) => row.played_at === game.played_at));
  const dayValues = ownDay?.map((row) => row.score.total_score) ?? [];
  const dayBest = dayValues.length > 0 && score === Math.max(...dayValues);
  const opponentsValid = new Set(game.scores.map((row) => row.player_name)).size === game.scores.length
    && game.scores.every((row) => validTotal(row.total_score));
  const opponents = opponentsValid ? game.scores.filter((row) => row.player_name !== playerName) : [];
  const opponentBest = opponents.length ? Math.max(...opponents.map((row) => row.total_score)) : undefined;
  const rank = opponentsValid ? 1 + opponents.filter((row) => row.total_score > score).length : undefined;
  const style = validatedStyle(target);
  const roster = dayRoster(index, game.played_at);
  const rosterBest = bestScoreForDayRoster(index, game.played_at);
  const rivals = roster.filter((name) => name !== playerName).flatMap((name) => {
    const best = bestScoreForPlayer(index, name);
    return best && best.score > score ? [{ name, best: best.score, gap: best.score - score }] : [];
  }).sort((a, b) => b.best - a.best || compareText(a.name, b.name));
  const strikeRival = style ? opponents.flatMap((row) => {
    const otherStyle = validatedStyle(row);
    return otherStyle && row.total_score > score && otherStyle.strike_count < style.strike_count
      ? [{ name: row.player_name, score: row.total_score, strikes: otherStyle.strike_count }] : [];
  }).sort((a, b) => b.score - a.score || compareText(a.name, b.name))[0] : undefined;
  const alternatives: Counterfactual[] = [];
  if (style && opponents.length && opponentBest !== undefined && rank !== undefined) {
    for (const item of style.counterfactuals) {
      if (item.pins_added !== 1 || item.original_score !== score || !Number.isInteger(item.frame)
        || item.frame < 1 || item.frame > 9 || !validTotal(item.hypothetical_score)
        || item.hypothetical_score <= score || item.hypothetical_score - score !== item.gain) continue;
      const changedRank = 1 + opponents.filter((row) => row.total_score > item.hypothetical_score).length;
      let outcome: Counterfactual['outcome'] | undefined;
      if (score <= opponentBest && item.hypothetical_score > opponentBest) outcome = 'win';
      else if (score < opponentBest && item.hypothetical_score === opponentBest) outcome = 'tie';
      else if (changedRank < rank) outcome = 'improve';
      if (outcome) alternatives.push({ frame: item.frame, hypotheticalScore: item.hypothetical_score,
        gap: item.hypothetical_score - opponentBest, outcome });
    }
  }
  const order = { win: 0, tie: 1, improve: 2 };
  alternatives.sort((a, b) => order[a.outcome] - order[b.outcome] || a.frame - b.frame);
  let trajectory: 'improving' | 'declining' | undefined;
  if (ownDay && ownDay.length >= 3 && ownDay.every((row, i) => ownDay.slice(i + 1)
    .every((otherRow) => temporalCompare(row.game, otherRow.game) !== null))) {
    const ordered = [...ownDay].sort((a, b) => temporalCompare(a.game, b.game) ?? 0);
    if (ordered.slice(1).every((row, i) => row.score.total_score > ordered[i].score.total_score)) trajectory = 'improving';
    if (ordered.slice(1).every((row, i) => row.score.total_score < ordered[i].score.total_score)) trajectory = 'declining';
  }
  const points = style?.frame_points;
  const weakFinish = !!points && points.length === 10 && points.every((value) => Number.isInteger(value) && value >= 0 && value <= 30)
    && points.slice(0, 3).reduce((sum, value) => sum + value, 0) - points.slice(6, 9).reduce((sum, value) => sum + value, 0) >= 20;
  return {
    scope: 'player-score', score, playerName, average, gameId, playedAt: game.played_at, facts: index,
    won: opponentBest !== undefined && score > opponentBest,
    lost: opponentBest !== undefined && score < opponentBest,
    scenarioFacts: {
      personalBest, personalBestGap: personalBest === undefined ? undefined : personalBest - score,
      personalBestUnique: history?.filter((row) => row.score.total_score === personalBest).length === 1,
      historyCount: history?.length, baselineCount: other?.length,
      superseded: !ambiguous && priorBest !== undefined && score > priorBest && after.some((row) => row.score.total_score > score),
      first200: !ambiguous && score >= 200 && before.length > 0 && before.every((row) => row.score.total_score < 200),
      dayBest, dayBestTied: dayValues.filter((value) => value === score).length > 1,
      rosterBest: roster.length >= 2 && rosterBest?.score === score && rosterBest.ties.length === 1,
      historicalRival: rivals[0], rank, rosterSize: game.scores.length, opponentCount: opponents.length,
      strictLast: opponents.length > 0 && opponents.every((row) => row.total_score > score),
      tiedFirst: opponentBest === score, strikes: style?.strike_count, openFrames: style?.open_count,
      weakFinish, rival: strikeRival, counterfactual: alternatives[0],
      dayRange: dayValues.length ? Math.max(...dayValues) - Math.min(...dayValues) : undefined,
      dayGameCount: ownDay?.length, trajectory,
    },
  };
}

/** Aggregate context deliberately cannot select a single-game record or result. */
export function buildDayContext(index: GameFacts, date: string, playerName: string): TrashTalkFactContext | null {
  const games = index.byDate.get(date) ?? [];
  const roster = dayRoster(index, date);
  const totals = roster.map((name) => {
    const rows = observations(index, name, games.filter((game) => game.scores.some((score) => score.player_name === name)));
    return rows?.length ? { name, total: rows.reduce((sum, row) => sum + row.score.total_score, 0) } : null;
  });
  if (totals.some((value) => value === null)) return null;
  const values = totals.flatMap((value) => value ? [value] : []);
  const target = values.find((value) => value.name === playerName);
  const others = values.filter((value) => value.name !== playerName);
  if (!target || !others.length) return null;
  const gap = target.total - Math.max(...others.map((value) => value.total));
  return { scope: 'day-score', score: target.total, playerName, playedAt: date,
    scenarioFacts: { totalGap: gap } };
}

let activeCatalog: TrashTalkCatalogSnapshot | null = null;
export function isCompatibleCatalog(value: unknown): value is TrashTalkCatalogSnapshot {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<TrashTalkCatalogSnapshot>;
  if (catalog.version !== '3.1.0' || catalog.language !== 'de' || !Array.isArray(catalog.scenarios)
    || catalog.scenarios.length === 0) return false;
  const kinds = new Set(['legacy-v1', 'legacy-v2-message', 'legacy-v2-opener', 'legacy-v2-core', 'legacy-v2-suffix', 'legacy-live']);
  const tones = new Set(['playful', 'dry', 'savage', 'coach', 'absurd']);
  const conditionKeys = new Set(['requiresAverage', 'minScore', 'maxScore', 'minAverage', 'maxAverage',
    'minDeltaToAverage', 'maxDeltaToAverage', 'minOpenFrameRate', 'maxOpenFrameRate',
    'minRate', 'maxRate', 'minValue', 'maxValue', 'minSecondaryValue', 'maxSecondaryValue',
    'minMargin', 'maxMargin', 'minFrame', 'maxFrame', 'minTensionIndex', 'maxTensionIndex', 'won', 'lost']);
  const validConditions = (conditions: unknown) => {
    if (conditions === undefined) return true;
    if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return false;
    return Object.entries(conditions).every(([key, item]) =>
      conditionKeys.has(key) && (['requiresAverage', 'won', 'lost'].includes(key)
        ? typeof item === 'boolean' : typeof item === 'number' && Number.isFinite(item)));
  };
  const ids = new Set<string>();
  const templateIds = new Set<string>();
  if (!catalog.scenarios.every((scenario) => {
    if (!scenario || typeof scenario !== 'object') return false;
    const kind = scenario.kind;
    const legacy = typeof kind === 'string' && kinds.has(kind);
    if (!scenario || typeof scenario.id !== 'string' || ids.has(scenario.id)
      || !/^[a-z][a-z0-9_.-]{0,119}$/.test(scenario.id)
      || (kind !== undefined && (!legacy || typeof kind !== 'string'))
      || typeof scenario.enabled !== 'boolean'
      || !Array.isArray(scenario.templates) || scenario.templates.some((text) =>
        typeof text !== 'string' || (legacy ? text.length > 2000 : text.trim().length < 5 || text.length > 360)
        || (legacy ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(text))
      || !Array.isArray(scenario.templateIds) || scenario.templateIds.length !== scenario.templates.length
      || scenario.templateIds.some((id) => typeof id !== 'string' || !id)
      || new Set(scenario.templateIds).size !== scenario.templateIds.length
      || (scenario.templateSelectionIds !== undefined && (!Array.isArray(scenario.templateSelectionIds)
        || scenario.templateSelectionIds.length !== scenario.templates.length
        || scenario.templateSelectionIds.some((id) => typeof id !== 'string' || !id)
        || new Set(scenario.templateSelectionIds).size !== scenario.templateSelectionIds.length))
      || !Array.isArray(scenario.bindings) || scenario.bindings.some((key) => typeof key !== 'string' || !/^[A-Za-z_]\w*$/.test(key))
      || !Number.isInteger(scenario.priority)
      || (kind === 'legacy-v1' && (typeof scenario.legacyExport !== 'string' || typeof scenario.legacyPool !== 'string'
        || !Array.isArray(scenario.legacyParameters) || scenario.legacyParameters.some((item) => typeof item !== 'string')))
      || (kind === 'legacy-live' && typeof scenario.legacyLiveScenario !== 'string')
      || (legacy && kind !== 'legacy-v1' && kind !== 'legacy-live'
        && (!scenario.legacyMetadata || typeof scenario.legacyMetadata !== 'object' || Array.isArray(scenario.legacyMetadata)))) return false;
    ids.add(scenario.id);
    for (const id of scenario.templateIds) {
      if (templateIds.has(id)) return false;
      templateIds.add(id);
    }
    return true;
  })) return false;
  const metadata = catalog.legacyV2;
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).sort().join(',') !== 'fragments,messages'
    || !Array.isArray(metadata.messages) || !Array.isArray(metadata.fragments)) return false;
  const referenced = new Set<string>();
  const validMetadata = (record: unknown, section: 'messages' | 'fragments') => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const value = record as Record<string, unknown>;
    const required = section === 'messages'
      ? ['id', 'scenario', 'language', 'tone', 'intensity', 'mode', 'weight', 'cooldownGroup', 'poolId']
      : ['id', 'scenario', 'language', 'tone', 'intensity', 'weight', 'cooldownGroup',
        'openersPoolId', 'coresPoolId', 'suffixesPoolId'];
    const allowed = new Set([...required, 'conditions', 'tags']);
    if (Object.keys(record).some((key) => !allowed.has(key)) || required.some((key) => !(key in record))) return false;
    if (typeof value.id !== 'string' || !value.id || typeof value.scenario !== 'string' || !value.scenario
      || value.language !== 'de' || typeof value.tone !== 'string' || !tones.has(value.tone)
      || !Number.isInteger(value.intensity) || (value.intensity as number) < 1 || (value.intensity as number) > 5
      || typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight < 0
      || typeof value.cooldownGroup !== 'string' || !value.cooldownGroup || !validConditions(value.conditions)
      || (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((tag: unknown) => typeof tag !== 'string')))) return false;
    if (section === 'messages' && value.mode !== 'template') return false;
    const refs = section === 'messages' ? [value.poolId] : [value.openersPoolId, value.coresPoolId, value.suffixesPoolId];
    const expected = section === 'messages' ? 'legacy-v2-message' : undefined;
    return refs.every((ref: unknown, index: number) => {
      const scenario = typeof ref === 'string' ? catalog.scenarios!.find((item) => item.id === ref) : undefined;
      const requiredKind = expected ?? ['legacy-v2-opener', 'legacy-v2-core', 'legacy-v2-suffix'][index];
      if (!scenario || scenario.kind !== requiredKind || referenced.has(ref as string)) return false;
      referenced.add(ref as string);
      return true;
    });
  };
  const messageIds = new Set<string>();
  const fragmentIds = new Set<string>();
  if (!metadata.messages.every((record) => {
    const id = typeof record === 'object' && record !== null && 'id' in record
      ? (record as { id?: unknown }).id : undefined;
    return typeof id === 'string' && !messageIds.has(id) && messageIds.add(id) && validMetadata(record, 'messages');
  }) || !metadata.fragments.every((record) => {
    const id = typeof record === 'object' && record !== null && 'id' in record
      ? (record as { id?: unknown }).id : undefined;
    return typeof id === 'string' && !fragmentIds.has(id) && fragmentIds.add(id) && validMetadata(record, 'fragments');
  })) return false;
  return catalog.scenarios.filter((scenario) => typeof scenario.kind === 'string' && scenario.kind.startsWith('legacy-v2-'))
    .every((scenario) => referenced.has(scenario.id));
}
export function setTrashTalkCatalog(catalog: TrashTalkCatalogSnapshot) {
  if (!isCompatibleCatalog(catalog)) throw new Error('Inkompatibler Trash-Talk-Katalog.');
  activeCatalog = catalog;
}
export function getTrashTalkCatalog() { return activeCatalog; }

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
function canonical(value: Record<string, string | number | undefined>) {
  return JSON.stringify(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => compareText(a, b)));
}
const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');

export function eligibleScenarios(context: TrashTalkFactContext): Array<{ id: string; bindings: Record<string, string> }> {
  if (!context || !Number.isFinite(context.score)) return [];
  const f = context.scenarioFacts;
  const base = { player: context.playerName ?? 'Du', score: format(context.score) };
  const result: Array<{ id: string; bindings: Record<string, string> }> = [];
  const add = (id: string, extra: Record<string, string | number> = {}) => result.push({ id,
    bindings: { ...base, ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, typeof value === 'number' ? format(value) : value])) } });
  if (context.scope === 'day-score') {
    if (f?.totalGap && Number.isFinite(f.totalGap)) add(f.totalGap > 0 ? 'day.total.lead' : 'day.total.trail', { gap: Math.abs(f.totalGap) });
    return result;
  }
  if (!validTotal(context.score)) return [];
  const isBest = (f?.historyCount ?? 0) >= 2 && f?.personalBest === context.score;
  if (isBest) add(f?.personalBestUnique ? 'history.personal_best.unique' : 'history.personal_best.tied');
  if (isBest && f?.strictLast) add('result.personal_best.last');
  if (f?.superseded && f.personalBest !== undefined) add('history.personal_best.superseded', { personalBest: f.personalBest, gap: f.personalBest - context.score });
  if (f?.rosterBest) add('history.roster_best');
  if (f?.dayBest) add('day.best');
  if (f?.dayBest && f.personalBest !== undefined && f.personalBest - context.score >= 40) {
    add('day.best.below_personal_best', { personalBest: f.personalBest, gap: f.personalBest - context.score });
  }
  if (f?.historicalRival) add('history.rival_gap', { rival: f.historicalRival.name, rivalBest: f.historicalRival.best, gap: f.historicalRival.gap });
  if (f?.first200) add('milestone.first_200');
  if (f?.counterfactual) add(`counterfactual.${f.counterfactual.outcome}`, { frame: f.counterfactual.frame,
    hypotheticalScore: f.counterfactual.hypotheticalScore, gap: f.counterfactual.gap });
  if ((f?.opponentCount ?? 0) > 0) {
    if (context.won && context.score <= 135) add('result.win.cheap');
    if (context.lost && context.score >= 200) add('result.loss.heroic');
    if (f?.tiedFirst) add('result.tie');
  }
  if (f?.strikes !== undefined && f.openFrames !== undefined) {
    if (f.strikes >= 3 && f.openFrames >= 3) add('style.strikes_open', { strikes: f.strikes, openFrames: f.openFrames });
    if (f.openFrames <= 1) add('style.open_frames.very_clean', { openFrames: f.openFrames });
    if (f.rival) add('style.more_strikes_lost', { strikes: f.strikes, rival: f.rival.name });
    if (f.weakFinish) add('style.weak_finish');
    if (f.weakFinish && f.dayBest) add('day.best.weak_finish');
  }
  if ((f?.baselineCount ?? 0) >= 3 && context.average !== undefined && Number.isFinite(context.average)) {
    const gap = context.score - context.average;
    if (gap >= 8) add('form.above', { gap });
    if (gap <= -8) add('form.below', { gap: -gap });
    if (context.average > 0 && context.score / context.average <= 0.72) add('score.relative.disaster');
  }
  if ((f?.dayGameCount ?? 0) >= 3 && f?.dayRange !== undefined && f.dayRange <= 15) add('form.consistent', { range: f.dayRange });
  if (f?.trajectory) add(`form.${f.trajectory}`);
  if (context.score >= 200) add('score.absolute.legendary');
  return result;
}

export function selectTrashTalkV3(context: TrashTalkFactContext, catalog = activeCatalog): TrashTalkResult | null {
  if (!context || !isCompatibleCatalog(catalog)) return null;
  const available = eligibleScenarios(context).flatMap((fact) => {
    const scenario = catalog.scenarios.find((item) => item.id === fact.id && item.kind === undefined && item.enabled !== false);
    return scenario ? [{ scenario, bindings: fact.bindings }] : [];
  }).sort((a, b) => (b.scenario.priority ?? 0) - (a.scenario.priority ?? 0) || compareText(a.scenario.id, b.scenario.id));
  const identity = canonical({ scope: context.scope, game: context.gameId, player: context.playerName,
    date: context.gameId === undefined ? context.playedAt : undefined });
  for (const { scenario, bindings } of available) {
    const allowed = scenario.bindings!;
    const candidates = scenario.templates.flatMap((text, i) => {
      const placeholders = [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
      if (/[{}]/.test(text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, ''))
        || placeholders.some((key) => !allowed.includes(key) || !bindings[key])
        || allowed.some((key) => !bindings[key])) return [];
      return [{ id: scenario.templateIds![i], text }];
    }).sort((a, b) => hash(`${identity}|${scenario.id}|${b.id}`) - hash(`${identity}|${scenario.id}|${a.id}`) || compareText(a.id, b.id));
    if (!candidates.length) continue;
    const chosen = candidates[0];
    const projected = Object.fromEntries(allowed.map((key) => [key, bindings[key]]));
    return { text: chosen.text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, key: string) => bindings[key]),
      scenario: scenario.id, templateId: chosen.id, predicateVersion: 'v3-facts-2',
      catalogRelease: catalog.release ?? catalog.version,
      contextFingerprint: hash(`${identity}|${scenario.id}|${canonical(projected)}`).toString(16),
      bindings: projected };
  }
  return null;
}
