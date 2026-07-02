import messages from '@/data/trash-talk/messages.de.json';
import fragments from '@/data/trash-talk/fragments.de.json';
import type {
  TrashTalkConditions,
  TrashTalkContext,
  TrashTalkFragmentSet,
  TrashTalkMessage,
  TrashTalkSelectOptions,
  TrashTalkTone,
} from './types';

const MESSAGE_BANK = messages as TrashTalkMessage[];
const FRAGMENT_BANK = fragments as TrashTalkFragmentSet[];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(length: number, seed: string): number {
  if (length <= 0) return 0;
  return hashString(seed) % length;
}

function pickSeeded<T>(items: readonly T[], seed: string): T | undefined {
  return items[seededIndex(items.length, seed)];
}

function weightedPick<T extends { weight?: number; id: string }>(items: readonly T[], seed: string): T | undefined {
  if (items.length === 0) return undefined;
  const total = items.reduce((sum, item) => sum + Math.max(0.1, item.weight ?? 1), 0);
  let cursor = (hashString(seed) / 0xffffffff) * total;
  for (const item of items) {
    cursor -= Math.max(0.1, item.weight ?? 1);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  const rounded = roundOne(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatSigned(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  const rounded = roundOne(value);
  if (rounded === 0) return '±0';
  return rounded > 0 ? `+${formatNumber(rounded)}` : formatNumber(rounded);
}

function compareMin(value: number | undefined, min: number | undefined): boolean {
  return min === undefined || (value !== undefined && value >= min);
}

function compareMax(value: number | undefined, max: number | undefined): boolean {
  return max === undefined || (value !== undefined && value <= max);
}

function matchesConditions(context: TrashTalkContext, conditions?: TrashTalkConditions): boolean {
  if (!conditions) return true;
  if (conditions.requiresAverage && (!Number.isFinite(context.average) || !Number.isFinite(context.deltaToAverage))) return false;
  if (!compareMin(context.score, conditions.minScore)) return false;
  if (!compareMax(context.score, conditions.maxScore)) return false;
  if (!compareMin(context.average, conditions.minAverage)) return false;
  if (!compareMax(context.average, conditions.maxAverage)) return false;
  if (!compareMin(context.deltaToAverage, conditions.minDeltaToAverage)) return false;
  if (!compareMax(context.deltaToAverage, conditions.maxDeltaToAverage)) return false;
  if (!compareMin(context.openFrameRate, conditions.minOpenFrameRate)) return false;
  if (!compareMax(context.openFrameRate, conditions.maxOpenFrameRate)) return false;
  if (!compareMin(context.rate, conditions.minRate)) return false;
  if (!compareMax(context.rate, conditions.maxRate)) return false;
  if (!compareMin(context.value, conditions.minValue)) return false;
  if (!compareMax(context.value, conditions.maxValue)) return false;
  if (!compareMin(context.secondaryValue, conditions.minSecondaryValue)) return false;
  if (!compareMax(context.secondaryValue, conditions.maxSecondaryValue)) return false;
  if (!compareMin(context.margin, conditions.minMargin)) return false;
  if (!compareMax(context.margin, conditions.maxMargin)) return false;
  if (!compareMin(context.frame, conditions.minFrame)) return false;
  if (!compareMax(context.frame, conditions.maxFrame)) return false;
  if (!compareMin(context.tensionIndex, conditions.minTensionIndex)) return false;
  if (!compareMax(context.tensionIndex, conditions.maxTensionIndex)) return false;
  if (conditions.won !== undefined && context.won !== conditions.won) return false;
  if (conditions.lost !== undefined && context.lost !== conditions.lost) return false;
  return true;
}

function allowedTone(tone: TrashTalkTone, optionTone: TrashTalkSelectOptions['tone']): boolean {
  if (!optionTone) return true;
  if (Array.isArray(optionTone)) return optionTone.includes(tone);
  return tone === optionTone;
}

export function detectTrashTalkScenarios(context: TrashTalkContext): string[] {
  const scenarios: string[] = [];

  if (context.score !== undefined) {
    if (context.score >= 200) scenarios.push('score.absolute.legendary');
    else if (context.score >= 170) scenarios.push('score.absolute.very_strong');
    else if (context.score >= 145) scenarios.push('score.absolute.strong');
    else if (context.score >= 115) scenarios.push('score.absolute.solid');
    else if (context.score >= 90) scenarios.push('score.absolute.casual');
    else scenarios.push('score.absolute.needs_work');
  }

  if (context.average !== undefined && context.average > 0 && context.score !== undefined) {
    const delta = context.deltaToAverage ?? context.score - context.average;
    if (delta <= -35 || context.score / context.average <= 0.72) scenarios.unshift('score.relative.disaster');
    else if (delta <= -20 || context.score / context.average <= 0.84) scenarios.unshift('score.relative.bad');
    else if (delta <= -8) scenarios.unshift('score.relative.slightly_below');
    else if (delta < 8) scenarios.unshift('score.relative.on_par');
    else if (delta < 20) scenarios.unshift('score.relative.above');
    else if (delta < 35) scenarios.unshift('score.relative.great');
    else scenarios.unshift('score.relative.absurd');
  }

  if (context.won && context.score !== undefined && context.score <= 135) {
    scenarios.unshift('result.win.cheap');
  }

  if (context.lost && context.score !== undefined) {
    if (context.score >= 200) scenarios.unshift('result.loss.heroic');
    else if (context.average !== undefined && context.deltaToAverage !== undefined && context.deltaToAverage >= 20) scenarios.unshift('result.loss.above_form');
    else if (context.score <= 100) scenarios.unshift('result.loss.expected');
    else scenarios.unshift('result.loss.normal');
  }

  if (context.openFrameRate !== undefined) {
    if (context.openFrameRate <= 20) scenarios.unshift('style.open_frames.very_clean');
    else if (context.openFrameRate <= 35) scenarios.unshift('style.open_frames.controlled');
    else if (context.openFrameRate <= 50) scenarios.unshift('style.open_frames.shaky');
    else scenarios.unshift('style.open_frames.too_many');
  }

  if (context.rate !== undefined && context.rateKind === 'win') {
    if (context.rate >= 65) scenarios.unshift('rate.win.dominant');
    else if (context.rate >= 50) scenarios.unshift('rate.win.positive');
    else if (context.rate >= 35) scenarios.unshift('rate.win.balanced');
    else scenarios.unshift('rate.win.chasing');
  }

  if (context.rate !== undefined && context.rateKind === 'strikeFollow') {
    if (context.rate >= 35) scenarios.unshift('rate.strike_follow.hot');
    else if (context.rate >= 20) scenarios.unshift('rate.strike_follow.good');
    else if (context.rate >= 10) scenarios.unshift('rate.strike_follow.normal');
    else scenarios.unshift('rate.strike_follow.rare');
  }

  if (context.rate !== undefined && context.rateKind === 'comeback') {
    if (context.rate >= 55) scenarios.unshift('rate.comeback.very_resilient');
    else if (context.rate >= 40) scenarios.unshift('rate.comeback.good_reaction');
    else if (context.rate >= 25) scenarios.unshift('rate.comeback.normal');
    else scenarios.unshift('rate.comeback.shaky');
  }

  if (context.reportKind === 'comeback' && context.margin !== undefined) {
    if (context.margin >= 30) scenarios.unshift('report.comeback.epic');
    else if (context.margin >= 15) scenarios.unshift('report.comeback.solid');
    else scenarios.unshift('report.comeback.minor');
  }

  if (context.reportKind === 'bigLead' && context.margin !== undefined) {
    if (context.margin >= 40) scenarios.unshift('report.big_lead.dominant');
    else if (context.margin >= 20) scenarios.unshift('report.big_lead.clear');
    else scenarios.unshift('report.big_lead.narrow');
  }

  if (context.reportKind === 'closestMoment' && context.margin !== undefined) {
    const phase = context.frame !== undefined && context.frame <= 3 ? 'early' : context.frame !== undefined && context.frame >= 8 ? 'late' : 'mid';
    if (context.margin <= 3) scenarios.unshift(`report.closest_moment.nail_biter.${phase}`, 'report.closest_moment.nail_biter');
    else scenarios.unshift(`report.closest_moment.tight.${phase}`, 'report.closest_moment.tight');
  }

  if (context.reportKind === 'lateDrama') {
    scenarios.unshift('report.late_drama.leader_lost');
  }

  if (context.reportKind === 'decidingFrame' && context.frame !== undefined) {
    if (context.frame <= 2) scenarios.unshift('report.deciding_frame.from_start');
    else if (context.frame <= 4) scenarios.unshift('report.deciding_frame.early');
    else if (context.frame <= 7) scenarios.unshift('report.deciding_frame.mid');
    else if (context.frame <= 9) scenarios.unshift('report.deciding_frame.late');
    else scenarios.unshift('report.deciding_frame.final');
  }

  if (context.reportKind === 'excitement' && context.tensionIndex !== undefined) {
    if (context.tensionIndex >= 3) scenarios.unshift('report.excitement.insane');
    else if (context.tensionIndex >= 1.5) scenarios.unshift('report.excitement.thrilling');
    else if (context.tensionIndex >= 0.5) scenarios.unshift('report.excitement.decent');
    else scenarios.unshift('report.excitement.boring');
  }

  if (context.statKind === 'medianConsistency' && context.value !== undefined) {
    const diff = context.value;
    const absDiff = Math.abs(diff);
    if (absDiff < 1) scenarios.unshift('stat.median_consistency.near_identical');
    else if (absDiff < 2) scenarios.unshift('stat.median_consistency.very_consistent');
    else if (diff >= 5) scenarios.unshift('stat.median_consistency.avg_much_higher');
    else if (diff >= 2) scenarios.unshift('stat.median_consistency.avg_slightly_higher');
    else if (diff <= -5) scenarios.unshift('stat.median_consistency.median_much_higher');
    else scenarios.unshift('stat.median_consistency.median_slightly_higher');
  }

  if (context.statKind === 'finish' && context.value !== undefined) {
    if (context.value >= 6) scenarios.unshift('stat.finish.clutch');
    else if (context.value >= 0) scenarios.unshift('stat.finish.stable');
    else if (context.value >= -6) scenarios.unshift('stat.finish.slight_drop');
    else scenarios.unshift('stat.finish.weak');
  }

  if (context.statKind === 'fatigue' && context.value !== undefined) {
    if (context.value <= 0) scenarios.unshift('stat.fatigue.endures');
    else if (context.value <= 7) scenarios.unshift('stat.fatigue.small_drop');
    else if (context.value <= 15) scenarios.unshift('stat.fatigue.noticeable_drop');
    else scenarios.unshift('stat.fatigue.heavy');
  }

  if (context.statKind === 'strikeCount' && context.value !== undefined) {
    if (context.value >= 3) scenarios.unshift('stat.count.strike.strong');
    else if (context.value >= 1.5) scenarios.unshift('stat.count.strike.solid');
    else scenarios.unshift('stat.count.strike.needs_work');
  }

  if (context.statKind === 'spareCount' && context.value !== undefined) {
    if (context.value >= 3.5) scenarios.unshift('stat.count.spare.strong');
    else if (context.value >= 2) scenarios.unshift('stat.count.spare.solid');
    else scenarios.unshift('stat.count.spare.needs_work');
  }

  if (context.statKind === 'firstThrow' && context.value !== undefined) {
    if (context.value >= 8) scenarios.unshift('stat.first_throw.very_good');
    else if (context.value >= 7) scenarios.unshift('stat.first_throw.good');
    else if (context.value >= 6) scenarios.unshift('stat.first_throw.normal');
    else scenarios.unshift('stat.first_throw.needs_work');
  }

  if (context.statKind === 'streak' && context.value !== undefined) {
    if (context.value >= 4) scenarios.unshift('stat.streak.very_rare');
    else if (context.value === 3) scenarios.unshift('stat.streak.turkey');
    else if (context.value === 2) scenarios.unshift('stat.streak.double');
    else if (context.value === 1) scenarios.unshift('stat.streak.single');
    else scenarios.unshift('stat.streak.none');
  }

  return Array.from(new Set(scenarios));
}

function renderTemplate(template: string, context: TrashTalkContext): string {
  const player = context.playerName?.trim() || 'Du';
  const playerPrefix = context.playerName?.trim() ? `${context.playerName}: ` : '';
  const replacements: Record<string, string> = {
    player,
    playerPrefix,
    score: formatNumber(context.score),
    average: formatNumber(context.average),
    delta: formatSigned(context.deltaToAverage),
    margin: formatNumber(context.margin),
    openFrames: formatNumber(context.openFrames),
    cleanFrameRate: formatNumber(context.cleanFrameRate),
    strikes: formatNumber(context.strikes),
    spares: formatNumber(context.spares),
    openFrameRate: formatNumber(context.openFrameRate),
    rate: formatNumber(context.rate),
    value: formatNumber(context.value),
    secondaryValue: formatNumber(context.secondaryValue),
    tensionIndex: formatNumber(context.tensionIndex),
    winner: context.winnerName?.trim() || '',
    leader: context.leaderName?.trim() || '',
    frame: formatNumber(context.frame),
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => replacements[key] ?? match).replace(/\s+/g, ' ').trim();
}

function composeFragment(set: TrashTalkFragmentSet, context: TrashTalkContext, seed: string): string {
  const opener = pickSeeded(set.openers, `${seed}:opener`) ?? '';
  const core = pickSeeded(set.cores, `${seed}:core`) ?? '';
  const suffix = pickSeeded(set.suffixes, `${seed}:suffix`) ?? '';
  return renderTemplate(`${opener} ${core}. ${suffix}`, context);
}

export function selectTrashTalkV2(context: TrashTalkContext, options: TrashTalkSelectOptions = {}): string | null {
  const language = options.language ?? 'de';
  const maxIntensity = options.maxIntensity ?? 5;
  const scenarios = detectTrashTalkScenarios(context);
  const seed = options.seed ?? context.seedKey ?? `${context.scope}:${context.playerName ?? ''}:${context.score ?? ''}:${context.average ?? ''}:${context.won ?? ''}`;

  for (const scenario of scenarios) {
    const fragmentCandidates = FRAGMENT_BANK.filter((item) => (
      item.scenario === scenario
      && item.language === language
      && item.intensity <= maxIntensity
      && allowedTone(item.tone, options.tone)
      && matchesConditions(context, item.conditions)
    ));

    if (options.preferFragments && fragmentCandidates.length > 0) {
      const selected = weightedPick(fragmentCandidates, `${seed}:${scenario}:fragment`);
      if (selected) return composeFragment(selected, context, `${seed}:${selected.id}`);
    }

    const messageCandidates = MESSAGE_BANK.filter((item) => (
      item.scenario === scenario
      && item.language === language
      && item.intensity <= maxIntensity
      && allowedTone(item.tone, options.tone)
      && matchesConditions(context, item.conditions)
    ));

    const selectedMessage = weightedPick(messageCandidates, `${seed}:${scenario}:message`);
    if (selectedMessage) return renderTemplate(selectedMessage.template, context);

    if (fragmentCandidates.length > 0) {
      const selected = weightedPick(fragmentCandidates, `${seed}:${scenario}:fragment:fallback`);
      if (selected) return composeFragment(selected, context, `${seed}:${selected.id}`);
    }
  }

  return null;
}

export function buildScoreContext(score: number, seedKey?: string): TrashTalkContext {
  return {
    scope: 'score',
    score,
    seedKey: `score:${seedKey ?? ''}:${score}`,
  };
}

export function buildLossScoreContext(score: number, seedKey?: string): TrashTalkContext {
  return {
    scope: 'loss-score',
    score,
    lost: true,
    seedKey: `loss-score:${seedKey ?? ''}:${score}`,
  };
}

export function buildPlayerScoreContext(
  score: number,
  average: number,
  seedKey?: string,
  extra?: Pick<TrashTalkContext, 'won' | 'lost' | 'rank' | 'playerCount' | 'margin'>,
): TrashTalkContext {
  return {
    scope: extra?.lost ? 'player-loss-score' : 'player-score',
    playerName: seedKey,
    score,
    average: roundOne(average),
    deltaToAverage: roundOne(score - average),
    seedKey: `player-score:${seedKey ?? ''}:${score}:${roundOne(average)}:${extra?.won ?? ''}:${extra?.lost ?? ''}`,
    ...extra,
  };
}

export function buildOpenFrameContext(openFrameRate: number, seedKey?: string): TrashTalkContext {
  return {
    scope: 'open-frame',
    openFrameRate: roundOne(openFrameRate),
    cleanFrameRate: roundOne(100 - openFrameRate),
    seedKey: `open-frame:${seedKey ?? ''}:${roundOne(openFrameRate)}`,
  };
}

export function buildRateContext(rate: number, rateKind: NonNullable<TrashTalkContext['rateKind']>, seedKey?: string): TrashTalkContext {
  return {
    scope: 'rate',
    rate: roundOne(rate),
    rateKind,
    seedKey: `rate:${rateKind}:${seedKey ?? ''}:${roundOne(rate)}`,
  };
}

export function buildStatContext(
  statKind: NonNullable<TrashTalkContext['statKind']>,
  value: number,
  seedKey?: string,
  secondaryValue?: number,
): TrashTalkContext {
  return {
    scope: 'profile-stat',
    statKind,
    value: roundOne(value),
    secondaryValue: secondaryValue === undefined ? undefined : roundOne(secondaryValue),
    seedKey: `stat:${statKind}:${seedKey ?? ''}:${roundOne(value)}:${secondaryValue === undefined ? '' : roundOne(secondaryValue)}`,
  };
}

export function buildDayScoreContext(score: number, lost: boolean, seedKey?: string): TrashTalkContext {
  return {
    scope: lost ? 'day-loss-score' : 'day-score',
    score,
    won: !lost,
    lost,
    seedKey: `day-score:${lost ? 'lost' : 'won'}:${seedKey ?? ''}:${score}`,
  };
}

export function buildMatchReportContext(
  reportKind: NonNullable<TrashTalkContext['reportKind']>,
  values: Pick<TrashTalkContext, 'margin' | 'frame' | 'playerName' | 'winnerName' | 'leaderName' | 'tensionIndex'>,
  seedKey?: string,
): TrashTalkContext {
  return {
    scope: 'game-report',
    reportKind,
    seedKey: `game-report:${reportKind}:${seedKey ?? ''}:${values.margin ?? ''}:${values.frame ?? ''}:${values.playerName ?? ''}:${values.winnerName ?? ''}:${values.leaderName ?? ''}:${values.tensionIndex ?? ''}`,
    ...values,
  };
}
