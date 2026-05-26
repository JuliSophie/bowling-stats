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

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
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
export function scoreBenchmark(score: number): StatBenchmark {
  const percent = clampPercent(((score - 60) / 160) * 100);
  if (score >= 200) return { percent, label: 'Außerirdisch', detail: pick(T.score.legendary), tone: 'good' };
  if (score >= 170) return { percent, label: 'Sehr stark', detail: pick(T.score.veryStrong), tone: 'good' };
  if (score >= 145) return { percent, label: 'Stark', detail: pick(T.score.strong), tone: 'good' };
  if (score >= 115) return { percent, label: 'Solide', detail: pick(T.score.solid), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Casual', detail: pick(T.score.casual), tone: 'neutral' };
  return { percent, label: 'Ausbaufähig', detail: pick(T.score.needsWork), tone: 'warn' };
}

// --- Player-relative score: compares a score to that player's own average ---
export function playerScoreBenchmark(score: number, playerAverage: number, kind: PlayerScoreKind = 'peak'): StatBenchmark {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return scoreBenchmark(score);

  const roundedAverage = roundOne(playerAverage);
  const delta = roundOne(score - roundedAverage);
  const percent = kind === 'average'
    ? scoreBenchmark(score).percent
    : clampPercent(50 + (delta / 50) * 45);

  if (kind === 'average') {
    const absolute = scoreBenchmark(score);
    return {
      percent,
      label: 'Deine Basis',
      detail: pick(T.playerRelativeScore.baseline(roundedAverage)),
      tone: absolute.tone,
    };
  }

  if (delta <= -35 || score / roundedAverage <= 0.72) {
    return { percent, label: 'Form vermisst', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta))), tone: 'warn' };
  }
  if (delta <= -20 || score / roundedAverage <= 0.84) {
    return { percent, label: 'Unter Form', detail: pick(T.playerRelativeScore.bad(score, roundedAverage, formatSignedPins(delta))), tone: 'warn' };
  }
  if (delta <= -8) {
    return { percent, label: 'Knapp drunter', detail: pick(T.playerRelativeScore.slightlyBelow(score, roundedAverage, formatSignedPins(delta))), tone: 'neutral' };
  }
  if (delta < 8) {
    return { percent, label: 'Normalform', detail: pick(T.playerRelativeScore.onPar(score, roundedAverage)), tone: 'okay' };
  }
  if (delta < 20) {
    return { percent, label: 'Über Form', detail: pick(T.playerRelativeScore.above(score, roundedAverage, formatSignedPins(delta))), tone: 'good' };
  }
  if (delta < 35) {
    return { percent, label: 'Stark über Form', detail: pick(T.playerRelativeScore.great(score, roundedAverage, formatSignedPins(delta))), tone: 'good' };
  }
  return { percent, label: 'Peak-Alarm', detail: pick(T.playerRelativeScore.absurd(score, roundedAverage, formatSignedPins(delta))), tone: 'good' };
}

export function playerLossScoreBenchmark(score: number, playerAverage: number): StatBenchmark {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return lossScoreBenchmark(score);

  const roundedAverage = roundOne(playerAverage);
  const delta = roundOne(score - roundedAverage);
  const ratio = score / roundedAverage;
  const percent = clampPercent(50 + (delta / 50) * 45);

  if (score >= 200) return { percent, label: 'Bitterer Verlust', detail: pick(T.lossScore.legendary), tone: 'warn' };
  if (delta >= 35 || ratio >= 1.35) return { percent, label: 'Tragisch stark', detail: pick(T.lossScore.veryStrong), tone: 'warn' };
  if (delta >= 20 || ratio >= 1.2) return { percent, label: 'Stark, aber RIP', detail: pick(T.lossScore.strong), tone: 'warn' };
  if (delta >= 8 || ratio >= 1.08) return { percent, label: 'Über Form verloren', detail: pick(T.lossScore.solid), tone: 'neutral' };
  if (delta >= -8) return { percent, label: 'Normalform verloren', detail: pick(T.lossScore.shaky), tone: 'neutral' };
  if (delta >= -20) return { percent, label: 'Unter Form verloren', detail: pick(T.lossScore.shaky), tone: 'warn' };
  if (delta <= -60 || ratio <= 0.65) return { percent, label: 'Totalschaden', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta))), tone: 'warn' };
  if (delta <= -35 || ratio <= 0.78) return { percent, label: 'Absturz verloren', detail: pick(T.playerRelativeScore.disaster(score, roundedAverage, formatSignedPins(delta))), tone: 'warn' };
  if (delta <= -25 || ratio <= 0.86) return { percent, label: 'Schmerzhaft drunter', detail: pick(T.playerRelativeScore.bad(score, roundedAverage, formatSignedPins(delta))), tone: 'warn' };

  return {
    percent,
    label: 'Kein Wunder',
    detail: pick(T.lossScore.weak),
    tone: 'warn',
  };
}

export function playerScoreInfo(score: number, playerAverage: number, kind: PlayerScoreKind) {
  if (!Number.isFinite(playerAverage) || playerAverage <= 0) return 'Bewertet den Score gegen deine bisherige Datenbasis. Mehr Spiele machen diesen Kontext deutlich fairer.';
  const average = roundOne(playerAverage);
  const delta = roundOne(score - average);
  if (kind === 'average') return pick(T.playerScoreInfoTexts.average(average));
  return pick(T.playerScoreInfoTexts[kind](score, average, delta));
}

// --- Median consistency: median-average gap as consistency/skew indicator ---
// diff = avg - median. Positive = avg higher (few great games pull avg up).
// Negative = median higher (few bad games drag avg down). Scale is tight (±2/±5).
export function medianConsistencyBenchmark(avgScore: number, medianScore: number): StatBenchmark {
  const diff = Math.round((avgScore - medianScore) * 10) / 10;
  const absDiff = Math.abs(diff);
  const percent = clampPercent(100 - (absDiff / 10) * 100);

  if (absDiff < 1) return { percent, label: 'Roboter', detail: pick(T.medianConsistency.nearIdentical), tone: 'good' };
  if (absDiff < 2) return { percent, label: 'Sehr konstant', detail: pick(T.medianConsistency.veryConsistent), tone: 'good' };
  if (diff >= 5) return { percent, label: 'Highscorer-Typ', detail: pick(T.medianConsistency.avgMuchHigher), tone: 'okay' };
  if (diff >= 2) return { percent, label: 'Gute Ausreißer', detail: pick(T.medianConsistency.avgSlightlyHigher), tone: 'okay' };
  if (diff <= -5) return { percent, label: 'Aussetzer-Typ', detail: pick(T.medianConsistency.medianMuchHigher), tone: 'warn' };
  return { percent, label: 'Einzelne Aussetzer', detail: pick(T.medianConsistency.medianSlightlyHigher), tone: 'neutral' };
}

// --- Open frame rate: % frames without strike/spare (lower = better) ---
export function openFrameBenchmark(rate: number): StatBenchmark {
  const percent = clampPercent(100 - rate * 1.7);
  if (rate <= 20) return { percent, label: 'Sehr sauber', detail: pick(T.openFrame.veryClean), tone: 'good' };
  if (rate <= 35) return { percent, label: 'Gut kontrolliert', detail: pick(T.openFrame.controlled), tone: 'okay' };
  if (rate <= 50) return { percent, label: 'Wacklig, aber rettbar', detail: pick(T.openFrame.shaky), tone: 'neutral' };
  return { percent, label: 'Viele Geschenke', detail: pick(T.openFrame.tooMany), tone: 'warn' };
}

// --- Rate benchmark: win%, strike-follow%, comeback% ---
export function rateBenchmark(rate: number, kind: 'strikeFollow' | 'comeback' | 'win'): StatBenchmark {
  const percent = clampPercent(rate);
  if (kind === 'win') {
    if (rate >= 65) return { percent, label: 'Dominant', detail: pick(T.winRate.dominant), tone: 'good' };
    if (rate >= 50) return { percent, label: 'Siegtauglich', detail: pick(T.winRate.winning), tone: 'good' };
    if (rate >= 35) return { percent, label: 'Ausgeglichen', detail: pick(T.winRate.balanced), tone: 'okay' };
    return { percent, label: 'Jägerrolle', detail: pick(T.winRate.chasing), tone: 'warn' };
  }
  if (kind === 'strikeFollow') {
    if (rate >= 35) return { percent, label: 'Heißer Lauf', detail: pick(T.strikeFollow.hot), tone: 'good' };
    if (rate >= 20) return { percent, label: 'Gute Serienchance', detail: pick(T.strikeFollow.good), tone: 'okay' };
    if (rate >= 10) return { percent, label: 'Normalbereich', detail: pick(T.strikeFollow.normal), tone: 'neutral' };
    return { percent, label: 'Selten Serien', detail: pick(T.strikeFollow.rare), tone: 'warn' };
  }
  // comeback
  if (rate >= 55) return { percent, label: 'Sehr resilient', detail: pick(T.comeback.veryResilient), tone: 'good' };
  if (rate >= 40) return { percent, label: 'Gute Reaktion', detail: pick(T.comeback.goodReaction), tone: 'okay' };
  if (rate >= 25) return { percent, label: 'Normalbereich', detail: pick(T.comeback.normal), tone: 'neutral' };
  return { percent, label: 'Wackelig nach Fehlern', detail: pick(T.comeback.shaky), tone: 'warn' };
}

// --- Delta benchmark: finish strength (10th frame) / fatigue (game-over-game) ---
export function deltaBenchmark(value: number, kind: 'finish' | 'fatigue'): StatBenchmark {
  if (kind === 'finish') {
    const percent = clampPercent(((value + 12) / 24) * 100);
    if (value >= 6) return { percent, label: 'Clutch', detail: pick(T.finish.clutch), tone: 'good' };
    if (value >= 0) return { percent, label: 'Stabiler Abschluss', detail: pick(T.finish.stable), tone: 'okay' };
    if (value >= -6) return { percent, label: 'Leicht schwächer', detail: pick(T.finish.slightDrop), tone: 'neutral' };
    return { percent, label: 'Finish trainieren', detail: pick(T.finish.weak), tone: 'warn' };
  }
  // fatigue
  const percent = clampPercent(100 - ((value + 5) / 25) * 100);
  if (value <= 0) return { percent, label: 'Hält durch', detail: pick(T.fatigue.endures), tone: 'good' };
  if (value <= 7) return { percent, label: 'Kleiner Drop', detail: pick(T.fatigue.smallDrop), tone: 'okay' };
  if (value <= 15) return { percent, label: 'Spürbarer Drop', detail: pick(T.fatigue.noticeableDrop), tone: 'neutral' };
  return { percent, label: 'Starke Ermüdung', detail: pick(T.fatigue.heavy), tone: 'warn' };
}

// --- Counts per game: strikes/spares per game average ---
export function countPerGameBenchmark(total: number, gamesPlayed: number, kind: 'strike' | 'spare'): StatBenchmark {
  const perGame = gamesPlayed > 0 ? total / gamesPlayed : 0;
  const maxUseful = kind === 'strike' ? 4 : 5;
  const percent = clampPercent((perGame / maxUseful) * 100);
  if (kind === 'strike') {
    if (perGame >= 3) return { percent, label: `${perGame.toFixed(1)}/Spiel · stark`, detail: pick(T.strikesPerGame.strong), tone: 'good' };
    if (perGame >= 1.5) return { percent, label: `${perGame.toFixed(1)}/Spiel · solide`, detail: pick(T.strikesPerGame.solid), tone: 'okay' };
    return { percent, label: `${perGame.toFixed(1)}/Spiel · ausbaufähig`, detail: pick(T.strikesPerGame.needsWork), tone: 'warn' };
  }
  // spare
  if (perGame >= 3.5) return { percent, label: `${perGame.toFixed(1)}/Spiel · stark`, detail: pick(T.sparesPerGame.strong), tone: 'good' };
  if (perGame >= 2) return { percent, label: `${perGame.toFixed(1)}/Spiel · solide`, detail: pick(T.sparesPerGame.solid), tone: 'okay' };
  return { percent, label: `${perGame.toFixed(1)}/Spiel · ausbaufähig`, detail: pick(T.sparesPerGame.needsWork), tone: 'warn' };
}

// --- First throw: average pins on first ball (scale 0–9) ---
export function firstThrowBenchmark(value: number): StatBenchmark {
  const percent = clampPercent((value / 9) * 100);
  if (value >= 8) return { percent, label: 'Sehr guter erster Ball', detail: pick(T.firstThrow.veryGood), tone: 'good' };
  if (value >= 7) return { percent, label: 'Guter erster Ball', detail: pick(T.firstThrow.good), tone: 'okay' };
  if (value >= 6) return { percent, label: 'Normalbereich', detail: pick(T.firstThrow.normal), tone: 'neutral' };
  return { percent, label: 'Trefferbild verbessern', detail: pick(T.firstThrow.needsWork), tone: 'warn' };
}

// --- Best strike streak: longest consecutive strikes ---
export function streakBenchmark(streak: number): StatBenchmark {
  const percent = clampPercent((streak / 5) * 100);
  if (streak >= 4) return { percent, label: 'Sehr selten', detail: pick(T.streak.veryRare), tone: 'good' };
  if (streak === 3) return { percent, label: 'Turkey-Level', detail: pick(T.streak.turkey), tone: 'good' };
  if (streak === 2) return { percent, label: 'Double', detail: pick(T.streak.double), tone: 'okay' };
  if (streak === 1) return { percent, label: 'Einzelstrike', detail: pick(T.streak.single), tone: 'neutral' };
  return { percent, label: 'Noch keine Serie', detail: pick(T.streak.none), tone: 'warn' };
}

// --- Median vs. average: consistency indicator (info-tip) ---
export function medianAverageInfo(avgScore: number, medianScore: number) {
  const diff = Math.round((avgScore - medianScore) * 10) / 10;
  if (diff >= 10) return pick(T.medianAverage.avgHigher(diff));
  if (diff <= -10) return pick(T.medianAverage.medianHigher(Math.abs(diff)));
  return pick(T.medianAverage.close);
}

// --- Finish strength info (info-tip) ---
export function finishStrengthInfo(finishStrength: number) {
  if (finishStrength >= 6) return pick(T.finishInfo.clutch);
  if (finishStrength >= 0) return pick(T.finishInfo.stable);
  if (finishStrength >= -6) return pick(T.finishInfo.slightDrop);
  return pick(T.finishInfo.weak);
}

// --- First throw info (info-tip): first-ball avg + second-throw zero rate ---
export function firstThrowInfo(firstThrowAverage: number, secondThrowZeroRate: number) {
  const zr = formatCompactPercent(secondThrowZeroRate);
  if (firstThrowAverage >= 7.5 && secondThrowZeroRate >= 18) return pick(T.firstThrowInfo.strongButZeroes(zr));
  if (firstThrowAverage >= 7.5) return pick(T.firstThrowInfo.strong);
  if (secondThrowZeroRate >= 18) return pick(T.firstThrowInfo.zeroes(zr));
  return pick(T.firstThrowInfo.normal);
}

// --- Spare info (info-tip): open frame rate + second-throw zero rate ---
export function spareInfo(openFrameRate: number, secondThrowZeroRate: number) {
  const zr = formatCompactPercent(secondThrowZeroRate);
  if (openFrameRate >= 45 && secondThrowZeroRate >= 18) return pick(T.spareInfoTexts.openAndZeroes(zr));
  if (openFrameRate >= 45) return pick(T.spareInfoTexts.tooOpen);
  return pick(T.spareInfoTexts.normal);
}

// --- Comeback info (info-tip): recovery context ---
export function comebackInfo(comebackRate: number, openFrameRate: number) {
  if (openFrameRate >= 45 && comebackRate >= 45) return pick(T.comebackInfo.chaosButRecovers);
  if (openFrameRate >= 45 && comebackRate < 30) return pick(T.comebackInfo.chaosNoRecovery);
  if (comebackRate >= 45) return pick(T.comebackInfo.goodComeback);
  return pick(T.comebackInfo.normal);
}

// --- Strike follow info (info-tip): series-building context ---
export function strikeFollowInfo(strikeFollowRate: number, bestStrikeStreak: number) {
  if (strikeFollowRate >= 30 && bestStrikeStreak >= 3) return pick(T.strikeFollowInfoTexts.hotAndStreaky);
  if (strikeFollowRate < 12 && bestStrikeStreak <= 1) return pick(T.strikeFollowInfoTexts.lonely);
  return pick(T.strikeFollowInfoTexts.normal);
}

// --- Loss score: score benchmark for games you LOST (bitter tone, inverted feel) ---
export function lossScoreBenchmark(score: number): StatBenchmark {
  const percent = clampPercent(((score - 60) / 160) * 100);
  if (score >= 200) return { percent, label: 'Bitterer Verlust', detail: pick(T.lossScore.legendary), tone: 'warn' };
  if (score >= 170) return { percent, label: 'Stark, aber chancenlos', detail: pick(T.lossScore.veryStrong), tone: 'neutral' };
  if (score >= 145) return { percent, label: 'Guter Score, kein Sieg', detail: pick(T.lossScore.strong), tone: 'neutral' };
  if (score >= 115) return { percent, label: 'Solide, aber zu wenig', detail: pick(T.lossScore.solid), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Erwartbare Niederlage', detail: pick(T.lossScore.shaky), tone: 'neutral' };
  return { percent, label: 'Kein Wunder', detail: pick(T.lossScore.weak), tone: 'warn' };
}

// --- Day score: winning/losing score benchmark for day stats ---
export function dayScoreBenchmark(score: number | null): StatBenchmark | undefined {
  if (score === null) return undefined;
  const percent = clampPercent(((score - 60) / 160) * 100);
  if (score >= 200) return { percent, label: 'Unfassbar', detail: pick(T.dayScore.legendary), tone: 'good' };
  if (score >= 170) return { percent, label: 'Brett', detail: pick(T.dayScore.strong), tone: 'good' };
  if (score >= 145) return { percent, label: 'Stark', detail: pick(T.dayScore.good), tone: 'good' };
  if (score >= 115) return { percent, label: 'Solide', detail: pick(T.dayScore.solid), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Wacklig', detail: pick(T.dayScore.shaky), tone: 'neutral' };
  return { percent, label: 'Billiger Sieg', detail: pick(T.dayScore.cheap), tone: 'warn' };
}

// --- Day loss score: loss benchmark for day stats view ---
export function dayLossScoreBenchmark(score: number | null): StatBenchmark | undefined {
  if (score === null) return undefined;
  const percent = clampPercent(((score - 60) / 160) * 100);
  if (score >= 200) return { percent, label: 'Tragödie', detail: pick(T.dayLossScore.legendary), tone: 'warn' };
  if (score >= 170) return { percent, label: 'Bitter', detail: pick(T.dayLossScore.strong), tone: 'neutral' };
  if (score >= 145) return { percent, label: 'Gut, aber verloren', detail: pick(T.dayLossScore.good), tone: 'neutral' };
  if (score >= 115) return { percent, label: 'Solide, nicht genug', detail: pick(T.dayLossScore.solid), tone: 'okay' };
  if (score >= 90) return { percent, label: 'Erwartbar', detail: pick(T.dayLossScore.shaky), tone: 'neutral' };
  return { percent, label: 'Kein Wunder', detail: pick(T.dayLossScore.cheap), tone: 'warn' };
}

// --- Games played: session length ---
export function gamesBenchmark(gameCount: number): StatBenchmark {
  const percent = clampPercent((gameCount / 6) * 100);
  if (gameCount >= 6) return { percent, label: 'Marathon', detail: pick(T.games.marathon), tone: 'good' };
  if (gameCount >= 3) return { percent, label: 'Ordentlicher Abend', detail: pick(T.games.decent), tone: 'okay' };
  return { percent, label: 'Kurzprogramm', detail: pick(T.games.short), tone: 'neutral' };
}

// --- Total pins: sum of all pins for the day ---
export function totalPinsBenchmark(totalPins: number, players: number, gamesCount: number): StatBenchmark {
  const expected = Math.max(1, players * gamesCount * 120);
  const percent = clampPercent((totalPins / expected) * 70);
  if (totalPins >= players * gamesCount * 150) return { percent: Math.max(percent, 88), label: 'Pin-Massaker', detail: pick(T.totalPins.massacre), tone: 'good' };
  if (totalPins >= players * gamesCount * 120) return { percent: Math.max(percent, 68), label: 'Solide Abrissbirne', detail: pick(T.totalPins.solid), tone: 'okay' };
  return { percent, label: 'Sparflamme', detail: pick(T.totalPins.low), tone: 'neutral' };
}

// --- Average per game: total pins / games, normalized per player ---
export function averagePerGameBenchmark(avgPinsPerGame: number, playerCount: number): StatBenchmark {
  const perPlayer = playerCount > 0 ? avgPinsPerGame / playerCount : 0;
  const percent = clampPercent(((perPlayer - 60) / 120) * 100);
  if (perPlayer >= 150) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.strong), tone: 'good' };
  if (perPlayer >= 120) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.solid), tone: 'okay' };
  if (perPlayer >= 90) return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.mixed), tone: 'neutral' };
  return { percent, label: `Ø ${perPlayer.toFixed(1)} pro Kopf`, detail: pick(T.avgPerGame.weak), tone: 'warn' };
}

// --- Underdog: player who overperformed their own average the most ---
export function underdogBenchmark(underdog: DayUnderdogTrash | null): StatBenchmark | undefined {
  if (!underdog) return undefined;
  const percent = clampPercent(50 + underdog.upliftPercent * 2);
  if (underdog.upliftPercent >= 20) return { percent, label: 'Plot-Twist', detail: pick(T.underdog.plotTwist), tone: 'good' };
  if (underdog.upliftPercent >= 8) return { percent, label: 'Überperformt', detail: pick(T.underdog.overperformed), tone: 'good' };
  if (underdog.upliftPercent >= 0) return { percent, label: 'Leicht drüber', detail: pick(T.underdog.slightlyAbove), tone: 'okay' };
  return { percent, label: 'Kein Underdog-Moment', detail: pick(T.underdog.noMoment), tone: 'neutral' };
}

// --- Lowest winning score of the day (info-tip) ---
export function lowestWinInfo(lowestWin: number | null, highestLoss: number | null) {
  if (lowestWin === null) return pick(T.lowestWin.none);
  if (highestLoss !== null && highestLoss > lowestWin) return pick(T.lowestWin.unfair(lowestWin, highestLoss));
  if (lowestWin < 110) return pick(T.lowestWin.cheap(lowestWin));
  return pick(T.lowestWin.normal(lowestWin));
}

// --- Highest losing score of the day (info-tip) ---
export function highestLossInfo(highestLoss: number | null, averageWin: number | null) {
  if (highestLoss === null) return pick(T.highestLoss.none);
  if (averageWin !== null && highestLoss >= averageWin) return pick(T.highestLoss.aboveAvgWin(highestLoss));
  return pick(T.highestLoss.normal(highestLoss));
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

  if (rank === 0 && player.wins > 0) {
    if (gapFirstToSecond >= 30) return pick(T.playerDay.leaderBigGap(gapFirstToSecond));
    if (gapFirstToSecond >= 15) return pick(T.playerDay.leaderComfortable(gapFirstToSecond));
    if (gapFirstToSecond <= 5) return pick(T.playerDay.leaderCloseWin(gapFirstToSecond));
    return pick(T.playerDay.leaderDefault);
  }

  if (isLast && allPlayers.length >= 3 && gapToLeader >= 30) return pick(T.playerDay.lastBigGap(gapToLeader, rank));
  if (isLast && gapToLeader >= 15) return pick(T.playerDay.lastNoticeableGap(gapToLeader, rank));
  if (rank > 0 && gapToLeader <= 5) return pick(T.playerDay.closeToLeader(gapToLeader, rank));
  if (rank > 0 && gapToLeader <= 15) return pick(T.playerDay.strikingDistance(gapToLeader, rank));

  if (globalAverage && avgDelta >= 15) return pick(T.playerDay.aboveAvg(avgDelta));
  if (globalAverage && avgDelta <= -15) return pick(T.playerDay.belowAvg(avgDelta));
  if (player.openFrameRate >= 50) return pick(T.playerDay.manyOpen);
  if (player.openFrameRate <= 25) return pick(T.playerDay.fewOpen);
  return pick(T.playerDay.neutral);
}
