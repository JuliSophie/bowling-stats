import * as T from './trash-talk-texts';

export type StatBenchmark = {
  percent: number;
  label: string;
  detail?: string;
  tone?: 'good' | 'okay' | 'warn' | 'neutral';
};

export type DayUnderdogTrash = {
  name: string;
  dayAverage: number;
  globalAverage: number;
  upliftPercent: number;
};

export type DayPlayerTrashStats = {
  name: string;
  wins: number;
  avgScore: number;
  openFrameRate: number;
};

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function benchmarkToneClass(tone: StatBenchmark['tone']) {
  if (tone === 'good') return 'bg-emerald-500';
  if (tone === 'okay') return 'bg-blue-500';
  if (tone === 'warn') return 'bg-coral';
  return 'bg-lane-500';
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// One salt per browser session. Stored in sessionStorage so the same texts
// survive navigation and reloads within the tab, but reshuffle in a new session.
// During SSR there is no window; benchmarks only render client-side (after data
// loads behind a loading gate), so the SSR fallback never reaches the DOM.
const SESSION_SALT_KEY = 'bowling-trash-seed';
let cachedSalt: string | null = null;

function sessionSalt(): string {
  if (cachedSalt !== null) return cachedSalt;
  if (typeof window === 'undefined') return 'ssr';
  try {
    let salt = window.sessionStorage.getItem(SESSION_SALT_KEY);
    if (!salt) {
      salt = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem(SESSION_SALT_KEY, salt);
    }
    cachedSalt = salt;
  } catch {
    cachedSalt = 'fallback';
  }
  return cachedSalt;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

// Seeded pick: same (session, page, seed) -> same text. The seed is an element
// identity built from the current URL path plus a content/category key (e.g.
// `sc:150` on `/stats/games/12`). So a given card stays put across navigation
// this session, the same card on a different page picks independently, and two
// different cards that merely share a number don't collide. Omit the seed to
// fall back to per-render random.
function pick<T>(items: readonly T[], seed?: string): T {
  if (seed === undefined) return items[Math.floor(Math.random() * items.length)] ?? items[0];
  return items[hashString(`${sessionSalt()}|${currentPath()}|${seed}`) % items.length] ?? items[0];
}

function formatCompactPercent(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function formatSignedPins(value: number) {
  const rounded = roundOne(value);
  if (rounded === 0) return '±0';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export type PlayerScoreKind = 'average' | 'peak' | 'winningPeak' | 'cheapWin' | 'winningAverage';

// --- Score: (60–220 scale) overall game score ---
export function scoreBenchmark(score: number, seedKey?: string): StatBenchmark {
  const percent = clampPercent(((score - 60) / 160) * 100);
  const s = `sc:${seedKey ? seedKey + ':' : ''}${score}`;
  if (score >= 200) return { percent, label: 'Außerirdisch', detail: pick(T.score.legendary, s), tone: 'good' };
  if (score >= 170) return { percent, label: 'Sehr stark', detail: pick(T.score.veryStrong, s), tone: 'good' };
  if (score >= 145) return { percent, label: 'Stark', detail: pick(T.score.strong, s), tone: 'good' };
  if (score >= 115) return { percent, label: 'Solide', detail: pick(T.score.solid, s), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Casual', detail: pick(T.score.casual, s), tone: 'neutral' };
  return { percent, label: 'Ausbaufähig', detail: pick(T.score.needsWork, s), tone: 'warn' };
}

// --- Player-relative score: compares a score to that player's own average ---
export function playerScoreBenchmark(score: number, playerAverage: number, kind: PlayerScoreKind = 'peak', seedKey?: string): StatBenchmark {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return scoreBenchmark(score, seedKey);

  const roundedAverage = roundOne(playerAverage);
  const delta = roundOne(score - roundedAverage);
  const percent = kind === 'average'
    ? scoreBenchmark(score).percent
    : clampPercent(50 + (delta / 50) * 45);
  const s = `psc:${seedKey ? seedKey + ':' : ''}${kind}:${score}:${roundedAverage}`;

  if (kind === 'average') {
    const absolute = scoreBenchmark(score);
    return {
      percent,
      label: 'Deine Basis',
      detail: pick(T.playerRelativeScore.baseline(roundedAverage), s),
      tone: absolute.tone,
    };
  }

  if (delta <= -35 || score / roundedAverage <= 0.72) {
    return { percent, label: 'Form vermisst', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta)), s), tone: 'warn' };
  }
  if (delta <= -20 || score / roundedAverage <= 0.84) {
    return { percent, label: 'Unter Form', detail: pick(T.playerRelativeScore.bad(score, roundedAverage, formatSignedPins(delta)), s), tone: 'warn' };
  }
  if (delta <= -8) {
    return { percent, label: 'Knapp drunter', detail: pick(T.playerRelativeScore.slightlyBelow(score, roundedAverage, formatSignedPins(delta)), s), tone: 'neutral' };
  }
  if (delta < 8) {
    return { percent, label: 'Normalform', detail: pick(T.playerRelativeScore.onPar(score, roundedAverage), s), tone: 'okay' };
  }
  if (delta < 20) {
    return { percent, label: 'Über Form', detail: pick(T.playerRelativeScore.above(score, roundedAverage, formatSignedPins(delta)), s), tone: 'good' };
  }
  if (delta < 35) {
    return { percent, label: 'Stark über Form', detail: pick(T.playerRelativeScore.great(score, roundedAverage, formatSignedPins(delta)), s), tone: 'good' };
  }
  return { percent, label: 'Peak-Alarm', detail: pick(T.playerRelativeScore.absurd(score, roundedAverage, formatSignedPins(delta)), s), tone: 'good' };
}

export function playerLossScoreBenchmark(score: number, playerAverage: number, seedKey?: string): StatBenchmark {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return lossScoreBenchmark(score, seedKey);

  const roundedAverage = roundOne(playerAverage);
  const delta = roundOne(score - roundedAverage);
  const ratio = score / roundedAverage;
  const percent = clampPercent(50 + (delta / 50) * 45);
  const s = `plsc:${seedKey ? seedKey + ':' : ''}${score}:${roundedAverage}`;

  if (score >= 200) return { percent, label: 'Bitterer Verlust', detail: pick(T.lossScore.legendary, s), tone: 'warn' };
  if (delta >= 35 || ratio >= 1.35) return { percent, label: 'Tragisch stark', detail: pick(T.lossScore.veryStrong, s), tone: 'warn' };
  if (delta >= 20 || ratio >= 1.2) return { percent, label: 'Stark, aber RIP', detail: pick(T.lossScore.strong, s), tone: 'warn' };
  if (delta >= 8 || ratio >= 1.08) return { percent, label: 'Über Form verloren', detail: pick(T.lossScore.solid, s), tone: 'neutral' };
  if (delta >= -8) return { percent, label: 'Normalform verloren', detail: pick(T.lossScore.shaky, s), tone: 'neutral' };
  if (delta >= -20) return { percent, label: 'Unter Form verloren', detail: pick(T.lossScore.shaky, s), tone: 'warn' };
  if (delta <= -60 || ratio <= 0.65) return { percent, label: 'Totalschaden', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta)), s), tone: 'warn' };
  if (delta <= -35 || ratio <= 0.78) return { percent, label: 'Absturz verloren', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta)), s), tone: 'warn' };
  if (delta <= -25 || ratio <= 0.86) return { percent, label: 'Schmerzhaft drunter', detail: pick(T.playerRelativeScore.bad(score, roundedAverage, formatSignedPins(delta)), s), tone: 'warn' };

  return {
    percent,
    label: 'Kein Wunder',
    detail: pick(T.lossScore.weak, s),
    tone: 'warn',
  };
}

export function playerScoreInfo(score: number, playerAverage: number, kind: PlayerScoreKind, seedKey?: string) {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return 'Bewertet den Score gegen deine bisherige Datenbasis. Mehr Spiele machen diesen Kontext deutlich fairer.';
  const average = roundOne(playerAverage);
  const delta = roundOne(score - average);
  const s = `psci:${seedKey ? seedKey + ':' : ''}${kind}:${score}:${average}`;
  if (kind === 'average') return pick(T.playerScoreInfoTexts.average(average), s);
  return pick(T.playerScoreInfoTexts[kind](score, average, delta), s);
}

// --- Median consistency: median-average gap as consistency/skew indicator ---
// diff = avg - median. Positive = avg higher (few great games pull avg up).
// Negative = median higher (few bad games drag avg down). Scale is tight (±2/±5).
export function medianConsistencyBenchmark(avgScore: number, medianScore: number): StatBenchmark {
  const diff = Math.round((avgScore - medianScore) * 10) / 10;
  const absDiff = Math.abs(diff);
  const percent = clampPercent(100 - (absDiff / 10) * 100);
  const s = `mcons:${diff}`;

  if (absDiff < 1) return { percent, label: 'Roboter', detail: pick(T.medianConsistency.nearIdentical, s), tone: 'good' };
  if (absDiff < 2) return { percent, label: 'Sehr konstant', detail: pick(T.medianConsistency.veryConsistent, s), tone: 'good' };
  if (diff >= 5) return { percent, label: 'Highscorer-Typ', detail: pick(T.medianConsistency.avgMuchHigher, s), tone: 'okay' };
  if (diff >= 2) return { percent, label: 'Gute Ausreißer', detail: pick(T.medianConsistency.avgSlightlyHigher, s), tone: 'okay' };
  if (diff <= -5) return { percent, label: 'Aussetzer-Typ', detail: pick(T.medianConsistency.medianMuchHigher, s), tone: 'warn' };
  return { percent, label: 'Einzelne Aussetzer', detail: pick(T.medianConsistency.medianSlightlyHigher, s), tone: 'neutral' };
}

// --- Open frame rate: % frames without strike/spare (lower = better) ---
export function openFrameBenchmark(rate: number): StatBenchmark {
  const percent = clampPercent(100 - rate * 1.7);
  const s = `ofr:${rate}`;
  if (rate <= 20) return { percent, label: 'Sehr sauber', detail: pick(T.openFrame.veryClean, s), tone: 'good' };
  if (rate <= 35) return { percent, label: 'Gut kontrolliert', detail: pick(T.openFrame.controlled, s), tone: 'okay' };
  if (rate <= 50) return { percent, label: 'Wacklig, aber rettbar', detail: pick(T.openFrame.shaky, s), tone: 'neutral' };
  return { percent, label: 'Viele Geschenke', detail: pick(T.openFrame.tooMany, s), tone: 'warn' };
}

// --- Rate benchmark: win%, strike-follow%, comeback% ---
export function rateBenchmark(rate: number, kind: 'strikeFollow' | 'comeback' | 'win'): StatBenchmark {
  const percent = clampPercent(rate);
  const s = `rate:${kind}:${rate}`;
  if (kind === 'win') {
    if (rate >= 65) return { percent, label: 'Dominant', detail: pick(T.winRate.dominant, s), tone: 'good' };
    if (rate >= 50) return { percent, label: 'Siegtauglich', detail: pick(T.winRate.winning, s), tone: 'good' };
    if (rate >= 35) return { percent, label: 'Ausgeglichen', detail: pick(T.winRate.balanced, s), tone: 'okay' };
    return { percent, label: 'Jägerrolle', detail: pick(T.winRate.chasing, s), tone: 'warn' };
  }
  if (kind === 'strikeFollow') {
    if (rate >= 35) return { percent, label: 'Heißer Lauf', detail: pick(T.strikeFollow.hot, s), tone: 'good' };
    if (rate >= 20) return { percent, label: 'Gute Serienchance', detail: pick(T.strikeFollow.good, s), tone: 'okay' };
    if (rate >= 10) return { percent, label: 'Normalbereich', detail: pick(T.strikeFollow.normal, s), tone: 'neutral' };
    return { percent, label: 'Selten Serien', detail: pick(T.strikeFollow.rare, s), tone: 'warn' };
  }
  // comeback
  if (rate >= 55) return { percent, label: 'Sehr resilient', detail: pick(T.comeback.veryResilient, s), tone: 'good' };
  if (rate >= 40) return { percent, label: 'Gute Reaktion', detail: pick(T.comeback.goodReaction, s), tone: 'okay' };
  if (rate >= 25) return { percent, label: 'Normalbereich', detail: pick(T.comeback.normal, s), tone: 'neutral' };
  return { percent, label: 'Wackelig nach Fehlern', detail: pick(T.comeback.shaky, s), tone: 'warn' };
}

// --- Delta benchmark: finish strength (10th frame) / fatigue (game-over-game) ---
export function deltaBenchmark(value: number, kind: 'finish' | 'fatigue'): StatBenchmark {
  const s = `delta:${kind}:${value}`;
  if (kind === 'finish') {
    const percent = clampPercent(((value + 12) / 24) * 100);
    if (value >= 6) return { percent, label: 'Clutch', detail: pick(T.finish.clutch, s), tone: 'good' };
    if (value >= 0) return { percent, label: 'Stabiler Abschluss', detail: pick(T.finish.stable, s), tone: 'okay' };
    if (value >= -6) return { percent, label: 'Leicht schwächer', detail: pick(T.finish.slightDrop, s), tone: 'neutral' };
    return { percent, label: 'Finish trainieren', detail: pick(T.finish.weak, s), tone: 'warn' };
  }
  // fatigue
  const percent = clampPercent(100 - ((value + 5) / 25) * 100);
  if (value <= 0) return { percent, label: 'Hält durch', detail: pick(T.fatigue.endures, s), tone: 'good' };
  if (value <= 7) return { percent, label: 'Kleiner Drop', detail: pick(T.fatigue.smallDrop, s), tone: 'okay' };
  if (value <= 15) return { percent, label: 'Spürbarer Drop', detail: pick(T.fatigue.noticeableDrop, s), tone: 'neutral' };
  return { percent, label: 'Starke Ermüdung', detail: pick(T.fatigue.heavy, s), tone: 'warn' };
}

// --- Counts per game: strikes/spares per game average ---
export function countPerGameBenchmark(total: number, gamesPlayed: number, kind: 'strike' | 'spare'): StatBenchmark {
  const perGame = gamesPlayed > 0 ? total / gamesPlayed : 0;
  const maxUseful = kind === 'strike' ? 4 : 5;
  const percent = clampPercent((perGame / maxUseful) * 100);
  const s = `cpg:${kind}:${perGame.toFixed(2)}`;
  if (kind === 'strike') {
    if (perGame >= 3) return { percent, label: `${perGame.toFixed(1)}/Spiel · stark`, detail: pick(T.strikesPerGame.strong, s), tone: 'good' };
    if (perGame >= 1.5) return { percent, label: `${perGame.toFixed(1)}/Spiel · solide`, detail: pick(T.strikesPerGame.solid, s), tone: 'okay' };
    return { percent, label: `${perGame.toFixed(1)}/Spiel · ausbaufähig`, detail: pick(T.strikesPerGame.needsWork, s), tone: 'warn' };
  }
  // spare
  if (perGame >= 3.5) return { percent, label: `${perGame.toFixed(1)}/Spiel · stark`, detail: pick(T.sparesPerGame.strong, s), tone: 'good' };
  if (perGame >= 2) return { percent, label: `${perGame.toFixed(1)}/Spiel · solide`, detail: pick(T.sparesPerGame.solid, s), tone: 'okay' };
  return { percent, label: `${perGame.toFixed(1)}/Spiel · ausbaufähig`, detail: pick(T.sparesPerGame.needsWork, s), tone: 'warn' };
}

// --- First throw: average pins on first ball (scale 0–9) ---
export function firstThrowBenchmark(value: number): StatBenchmark {
  const percent = clampPercent((value / 9) * 100);
  const s = `ftb:${value}`;
  if (value >= 8) return { percent, label: 'Sehr guter erster Ball', detail: pick(T.firstThrow.veryGood, s), tone: 'good' };
  if (value >= 7) return { percent, label: 'Guter erster Ball', detail: pick(T.firstThrow.good, s), tone: 'okay' };
  if (value >= 6) return { percent, label: 'Normalbereich', detail: pick(T.firstThrow.normal, s), tone: 'neutral' };
  return { percent, label: 'Trefferbild verbessern', detail: pick(T.firstThrow.needsWork, s), tone: 'warn' };
}

// --- Best strike streak: longest consecutive strikes ---
export function streakBenchmark(streak: number): StatBenchmark {
  const percent = clampPercent((streak / 5) * 100);
  const s = `stk:${streak}`;
  if (streak >= 4) return { percent, label: 'Sehr selten', detail: pick(T.streak.veryRare, s), tone: 'good' };
  if (streak === 3) return { percent, label: 'Turkey-Level', detail: pick(T.streak.turkey, s), tone: 'good' };
  if (streak === 2) return { percent, label: 'Double', detail: pick(T.streak.double, s), tone: 'okay' };
  if (streak === 1) return { percent, label: 'Einzelstrike', detail: pick(T.streak.single, s), tone: 'neutral' };
  return { percent, label: 'Noch keine Serie', detail: pick(T.streak.none, s), tone: 'warn' };
}

// --- Median vs. average: consistency indicator (info-tip) ---
export function medianAverageInfo(avgScore: number, medianScore: number) {
  const diff = Math.round((avgScore - medianScore) * 10) / 10;
  const s = `mai:${diff}`;
  if (diff >= 10) return pick(T.medianAverage.avgHigher(diff), s);
  if (diff <= -10) return pick(T.medianAverage.medianHigher(Math.abs(diff)), s);
  return pick(T.medianAverage.close, s);
}

// --- Finish strength info (info-tip) ---
export function finishStrengthInfo(finishStrength: number) {
  const s = `fsi:${finishStrength}`;
  if (finishStrength >= 6) return pick(T.finishInfo.clutch, s);
  if (finishStrength >= 0) return pick(T.finishInfo.stable, s);
  if (finishStrength >= -6) return pick(T.finishInfo.slightDrop, s);
  return pick(T.finishInfo.weak, s);
}

// --- First throw info (info-tip): first-ball avg + second-throw zero rate ---
export function firstThrowInfo(firstThrowAverage: number, secondThrowZeroRate: number) {
  const zr = formatCompactPercent(secondThrowZeroRate);
  const s = `fti:${firstThrowAverage}:${secondThrowZeroRate}`;
  if (firstThrowAverage >= 7.5 && secondThrowZeroRate >= 18) return pick(T.firstThrowInfo.strongButZeroes(zr), s);
  if (firstThrowAverage >= 7.5) return pick(T.firstThrowInfo.strong, s);
  if (secondThrowZeroRate >= 18) return pick(T.firstThrowInfo.zeroes(zr), s);
  return pick(T.firstThrowInfo.normal, s);
}

// --- Spare info (info-tip): open frame rate + second-throw zero rate ---
export function spareInfo(openFrameRate: number, secondThrowZeroRate: number) {
  const zr = formatCompactPercent(secondThrowZeroRate);
  const s = `spi:${openFrameRate}:${secondThrowZeroRate}`;
  if (openFrameRate >= 45 && secondThrowZeroRate >= 18) return pick(T.spareInfoTexts.openAndZeroes(zr), s);
  if (openFrameRate >= 45) return pick(T.spareInfoTexts.tooOpen, s);
  return pick(T.spareInfoTexts.normal, s);
}

// --- Comeback info (info-tip): recovery context ---
export function comebackInfo(comebackRate: number, openFrameRate: number) {
  const s = `cbi:${comebackRate}:${openFrameRate}`;
  if (openFrameRate >= 45 && comebackRate >= 45) return pick(T.comebackInfo.chaosButRecovers, s);
  if (openFrameRate >= 45 && comebackRate < 30) return pick(T.comebackInfo.chaosNoRecovery, s);
  if (comebackRate >= 45) return pick(T.comebackInfo.goodComeback, s);
  return pick(T.comebackInfo.normal, s);
}

// --- Strike follow info (info-tip): series-building context ---
export function strikeFollowInfo(strikeFollowRate: number, bestStrikeStreak: number) {
  const s = `sfi:${strikeFollowRate}:${bestStrikeStreak}`;
  if (strikeFollowRate >= 30 && bestStrikeStreak >= 3) return pick(T.strikeFollowInfoTexts.hotAndStreaky, s);
  if (strikeFollowRate < 12 && bestStrikeStreak <= 1) return pick(T.strikeFollowInfoTexts.lonely, s);
  return pick(T.strikeFollowInfoTexts.normal, s);
}

// --- Loss score: score benchmark for games you LOST (bitter tone, inverted feel) ---
export function lossScoreBenchmark(score: number, seedKey?: string): StatBenchmark {
  const percent = clampPercent(((score - 60) / 160) * 100);
  const s = `lsc:${seedKey ? seedKey + ':' : ''}${score}`;
  if (score >= 200) return { percent, label: 'Bitterer Verlust', detail: pick(T.lossScore.legendary, s), tone: 'warn' };
  if (score >= 170) return { percent, label: 'Stark, aber chancenlos', detail: pick(T.lossScore.veryStrong, s), tone: 'neutral' };
  if (score >= 145) return { percent, label: 'Guter Score, kein Sieg', detail: pick(T.lossScore.strong, s), tone: 'neutral' };
  if (score >= 115) return { percent, label: 'Solide, aber zu wenig', detail: pick(T.lossScore.solid, s), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Erwartbare Niederlage', detail: pick(T.lossScore.shaky, s), tone: 'neutral' };
  return { percent, label: 'Kein Wunder', detail: pick(T.lossScore.weak, s), tone: 'warn' };
}

// --- Day score: winning/losing score benchmark for day stats ---
export function dayScoreBenchmark(score: number | null, seedKey?: string): StatBenchmark | undefined {
  if (score === null) return undefined;
  const percent = clampPercent(((score - 60) / 160) * 100);
  const s = `dsc:${seedKey ? seedKey + ':' : ''}${score}`;
  if (score >= 200) return { percent, label: 'Unfassbar', detail: pick(T.dayScore.legendary, s), tone: 'good' };
  if (score >= 170) return { percent, label: 'Brett', detail: pick(T.dayScore.strong, s), tone: 'good' };
  if (score >= 145) return { percent, label: 'Stark', detail: pick(T.dayScore.good, s), tone: 'good' };
  if (score >= 115) return { percent, label: 'Solide', detail: pick(T.dayScore.solid, s), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Wacklig', detail: pick(T.dayScore.shaky, s), tone: 'neutral' };
  return { percent, label: 'Billiger Sieg', detail: pick(T.dayScore.cheap, s), tone: 'warn' };
}

// --- Day loss score: loss benchmark for day stats view ---
export function dayLossScoreBenchmark(score: number | null, seedKey?: string): StatBenchmark | undefined {
  if (score === null) return undefined;
  const percent = clampPercent(((score - 60) / 160) * 100);
  const s = `dlsc:${seedKey ? seedKey + ':' : ''}${score}`;
  if (score >= 200) return { percent, label: 'Tragödie', detail: pick(T.dayLossScore.legendary, s), tone: 'warn' };
  if (score >= 170) return { percent, label: 'Bitter', detail: pick(T.dayLossScore.strong, s), tone: 'neutral' };
  if (score >= 145) return { percent, label: 'Gut, aber verloren', detail: pick(T.dayLossScore.good, s), tone: 'neutral' };
  if (score >= 115) return { percent, label: 'Solide, nicht genug', detail: pick(T.dayLossScore.solid, s), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Erwartbar', detail: pick(T.dayLossScore.shaky, s), tone: 'neutral' };
  return { percent, label: 'Kein Wunder', detail: pick(T.dayLossScore.cheap, s), tone: 'warn' };
}

// --- Games played: session length ---
export function gamesBenchmark(gameCount: number): StatBenchmark {
  const percent = clampPercent((gameCount / 6) * 100);
  const s = `gms:${gameCount}`;
  if (gameCount >= 6) return { percent, label: 'Marathon', detail: pick(T.games.marathon, s), tone: 'good' };
  if (gameCount >= 3) return { percent, label: 'Ordentlicher Abend', detail: pick(T.games.decent, s), tone: 'okay' };
  return { percent, label: 'Kurzprogramm', detail: pick(T.games.short, s), tone: 'neutral' };
}

// --- Total pins: sum of all pins for the day ---
export function totalPinsBenchmark(totalPins: number, players: number, gamesCount: number): StatBenchmark {
  const expected = Math.max(1, players * gamesCount * 120);
  const percent = clampPercent((totalPins / expected) * 70);
  const s = `tpb:${totalPins}:${players}:${gamesCount}`;
  if (totalPins >= players * gamesCount * 150) return { percent: Math.max(percent, 88), label: 'Pin-Massaker', detail: pick(T.totalPins.massacre, s), tone: 'good' };
  if (totalPins >= players * gamesCount * 120) return { percent: Math.max(percent, 68), label: 'Solide Abrissbirne', detail: pick(T.totalPins.solid, s), tone: 'okay' };
  return { percent, label: 'Sparflamme', detail: pick(T.totalPins.low, s), tone: 'neutral' };
}

// --- Average per game: total pins / games, normalized per player ---
export function averagePerGameBenchmark(avgPinsPerGame: number, playerCount: number): StatBenchmark {
  const perPlayer = playerCount > 0 ? avgPinsPerGame / playerCount : 0;
  const percent = clampPercent(((perPlayer - 60) / 120) * 100);
  const s = `apg:${perPlayer.toFixed(1)}`;
  if (perPlayer >= 150) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.strong, s), tone: 'good' };
  if (perPlayer >= 120) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.solid, s), tone: 'okay' };
  if (perPlayer >= 90) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.mixed, s), tone: 'neutral' };
  return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.weak, s), tone: 'warn' };
}

// --- Underdog: player who overperformed their own average the most ---
export function underdogBenchmark(underdog: DayUnderdogTrash | null): StatBenchmark | undefined {
  if (!underdog) return undefined;
  const percent = clampPercent(50 + underdog.upliftPercent * 2);
  const s = `udb:${underdog.name}:${Math.round(underdog.upliftPercent)}`;
  if (underdog.upliftPercent >= 20) return { percent, label: 'Plot-Twist', detail: pick(T.underdog.plotTwist, s), tone: 'good' };
  if (underdog.upliftPercent >= 8) return { percent, label: 'Überperformt', detail: pick(T.underdog.overperformed, s), tone: 'good' };
  if (underdog.upliftPercent >= 0) return { percent, label: 'Leicht drüber', detail: pick(T.underdog.slightlyAbove, s), tone: 'okay' };
  return { percent, label: 'Kein Underdog-Moment', detail: pick(T.underdog.noMoment, s), tone: 'neutral' };
}

// --- Lowest winning score of the day (info-tip) ---
export function lowestWinInfo(lowestWin: number | null, highestLoss: number | null) {
  const s = `lwi:${lowestWin}:${highestLoss}`;
  if (lowestWin === null) return pick(T.lowestWin.none, s);
  if (highestLoss !== null && highestLoss > lowestWin) return pick(T.lowestWin.unfair(lowestWin, highestLoss), s);
  if (lowestWin < 110) return pick(T.lowestWin.cheap(lowestWin), s);
  return pick(T.lowestWin.normal(lowestWin), s);
}

// --- Highest losing score of the day (info-tip) ---
export function highestLossInfo(highestLoss: number | null, averageWin: number | null) {
  const s = `hli:${highestLoss}:${averageWin}`;
  if (highestLoss === null) return pick(T.highestLoss.none, s);
  if (averageWin !== null && highestLoss >= averageWin) return pick(T.highestLoss.aboveAvgWin(highestLoss), s);
  return pick(T.highestLoss.normal(highestLoss), s);
}

// --- Player day context: per-player line on the day leaderboard (gap-aware) ---
export function playerDayContext(
  player: DayPlayerTrashStats,
  allPlayers: DayPlayerTrashStats[],
  rank: number,
  globalAverage?: number,
) {
  const leader = allPlayers[0];
  const avgDelta = globalAverage ? Math.round((player.avgScore - globalAverage) * 10) / 10 : 0;
  const gapToLeader = leader ? Math.round((leader.avgScore - player.avgScore) * 10) / 10 : 0;
  const isLast = rank === allPlayers.length - 1 && allPlayers.length > 1;
  const secondPlace = allPlayers[1];
  const gapFirstToSecond = secondPlace ? Math.round((leader.avgScore - secondPlace.avgScore) * 10) / 10 : 0;
  const s = `pdc:${player.name}:${rank}`;

  if (rank === 0 && player.wins > 0) {
    if (gapFirstToSecond >= 30) return pick(T.playerDay.leaderBigGap(gapFirstToSecond), s);
    if (gapFirstToSecond >= 15) return pick(T.playerDay.leaderComfortable(gapFirstToSecond), s);
    if (gapFirstToSecond <= 5) return pick(T.playerDay.leaderCloseWin(gapFirstToSecond), s);
    return pick(T.playerDay.leaderDefault, s);
  }

  if (isLast && allPlayers.length >= 3 && gapToLeader >= 30) return pick(T.playerDay.lastBigGap(gapToLeader, rank), s);
  if (isLast && gapToLeader >= 15) return pick(T.playerDay.lastNoticeableGap(gapToLeader, rank), s);
  if (rank > 0 && gapToLeader <= 5) return pick(T.playerDay.closeToLeader(gapToLeader, rank), s);
  if (rank > 0 && gapToLeader <= 15) return pick(T.playerDay.strikingDistance(gapToLeader, rank), s);

  if (globalAverage && avgDelta >= 15) return pick(T.playerDay.aboveAvg(avgDelta), s);
  if (globalAverage && avgDelta <= -15) return pick(T.playerDay.belowAvg(avgDelta), s);
  if (player.openFrameRate >= 50) return pick(T.playerDay.manyOpen, s);
  if (player.openFrameRate <= 25) return pick(T.playerDay.fewOpen, s);
  return pick(T.playerDay.neutral, s);
}

// --- Game excitement trash talk ---
export function excitementTrash(tensionIndex: number): string {
  const s = `exc:${tensionIndex.toFixed(2)}`;
  if (tensionIndex >= 3) return pick(T.excitement.insane, s);
  if (tensionIndex >= 1.5) return pick(T.excitement.thrilling, s);
  if (tensionIndex >= 0.5) return pick(T.excitement.decent, s);
  return pick(T.excitement.boring, s);
}

// --- Match report trash talk ---
export function comebackTrash(pins: number): string {
  const s = `cbt:${pins}`;
  if (pins >= 30) return pick(T.gameComeback.epic(pins), s);
  if (pins >= 15) return pick(T.gameComeback.solid(pins), s);
  return pick(T.gameComeback.minor(pins), s);
}

export function bigLeadTrash(margin: number, playerName: string): string {
  const s = `blt:${margin}:${playerName}`;
  if (margin >= 40) return pick(T.bigLead.dominant(margin, playerName), s);
  if (margin >= 20) return pick(T.bigLead.clear(margin, playerName), s);
  return pick(T.bigLead.narrow(margin), s);
}

export function closestMomentTrash(margin: number, frame: number): string {
  const s = `cmt:${margin}:${frame}`;
  if (margin <= 3) return pick(T.closestMoment.nailBiter(margin, frame), s);
  return pick(T.closestMoment.tight(margin, frame), s);
}

export function lateDramaTrash(leaderAfterFrame9: string, winner: string): string | null {
  if (leaderAfterFrame9 === winner) return null;
  return pick(T.lateDrama.leaderLost(leaderAfterFrame9, winner), `ldt:${leaderAfterFrame9}:${winner}`);
}

// --- Day recap: sassy multi-sentence summary of the whole evening ---
export type DayRecapInput = {
  /** Content seed (e.g. the date) so different days read differently; combined
   *  with the per-session salt so the wording is stable within a session. */
  seed: string;
  gameCount: number;
  playerCount: number;
  winnerName: string;
  /** Average-score gap from the winner to the runner-up (clamped to >= 0). */
  gapToSecond: number;
  /** Best single game of the day, for a positive shout-out. */
  topScorer?: { name: string; score: number } | null;
  /** Player who most overperformed their own average. */
  underdog?: { name: string; upliftPercent: number } | null;
  /** Weakest performer of the day, for a lowlight. */
  worst?: { name: string; openFrameRate: number } | null;
};

export function buildDayRecap(input: DayRecapInput): string {
  const { seed, gameCount, playerCount, winnerName, gapToSecond, topScorer, underdog, worst } = input;
  const sentences: string[] = [];

  if (playerCount <= 1) {
    sentences.push(pick(T.dayRecap.introSolo(gameCount), `recap:${seed}|introSolo`));
    if (topScorer) sentences.push(pick(T.dayRecap.shoutoutTopScore(topScorer.name, topScorer.score), `recap:${seed}|soloTop`));
    return sentences.join(' ');
  }

  sentences.push(pick(T.dayRecap.intro(gameCount, playerCount), `recap:${seed}|intro`));

  const gap = Math.max(0, Math.round(gapToSecond));
  if (gap >= 30) sentences.push(pick(T.dayRecap.champDominant(winnerName, gap), `recap:${seed}|champ`));
  else if (gap >= 15) sentences.push(pick(T.dayRecap.champComfortable(winnerName, gap), `recap:${seed}|champ`));
  else if (gap <= 5) sentences.push(pick(T.dayRecap.champClose(winnerName, gap), `recap:${seed}|champ`));
  else sentences.push(pick(T.dayRecap.champDefault(winnerName), `recap:${seed}|champ`));

  // One positive highlight: a genuine underdog story beats a plain top score.
  if (underdog && underdog.upliftPercent >= 8 && underdog.name !== winnerName) {
    sentences.push(pick(T.dayRecap.underdogHero(underdog.name, Math.round(underdog.upliftPercent)), `recap:${seed}|good`));
  } else if (topScorer && topScorer.name !== winnerName) {
    sentences.push(pick(T.dayRecap.shoutoutTopScore(topScorer.name, topScorer.score), `recap:${seed}|good`));
  }

  // One lowlight, as long as it isn't the winner themselves.
  if (worst && worst.name !== winnerName) {
    if (worst.openFrameRate >= 45) sentences.push(pick(T.dayRecap.lowlightOpen(worst.name, Math.round(worst.openFrameRate)), `recap:${seed}|low`));
    else sentences.push(pick(T.dayRecap.lowlight(worst.name), `recap:${seed}|low`));
  }

  return sentences.join(' ');
}
