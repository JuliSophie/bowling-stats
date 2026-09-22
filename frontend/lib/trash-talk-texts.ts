// Content-free compatibility surface for the pre-v3 wrapper.
import { legacyFunction, legacyPool } from './legacy-catalog';

const pool = (id: string) => legacyPool(id);
const fn = (id: string, parameters: readonly string[]) => legacyFunction(id, parameters);

export const score = {
  get legendary() { return pool('legacy.v1.score.legendary'); },
  get veryStrong() { return pool('legacy.v1.score.very-strong'); },
  get strong() { return pool('legacy.v1.score.strong'); },
  get solid() { return pool('legacy.v1.score.solid'); },
  get casual() { return pool('legacy.v1.score.casual'); },
  get needsWork() { return pool('legacy.v1.score.needs-work'); },
};
export const playerRelativeScore = {
  baseline: (average: number) => fn('legacy.v1.player-relative-score.baseline', ["average"])(average),
  disaster: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.disaster', ["score","average","delta"])(score, average, delta),
  bad: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.bad', ["score","average","delta"])(score, average, delta),
  slightlyBelow: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.slightly-below', ["score","average","delta"])(score, average, delta),
  onPar: (score: number, average: number) => fn('legacy.v1.player-relative-score.on-par', ["score","average"])(score, average),
  above: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.above', ["score","average","delta"])(score, average, delta),
  great: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.great', ["score","average","delta"])(score, average, delta),
  absurd: (score: number, average: number, delta: string) => fn('legacy.v1.player-relative-score.absurd', ["score","average","delta"])(score, average, delta),
};
export const playerScoreInfoTexts = {
  average: (average: number) => fn('legacy.v1.player-score-info-texts.average', ["average"])(average),
  peak: (score: number, average: number, delta: number) => fn('legacy.v1.player-score-info-texts.peak', ["score","average","delta"])(score, average, delta),
  winningPeak: (score: number, average: number, delta: number) => fn('legacy.v1.player-score-info-texts.winning-peak', ["score","average","delta"])(score, average, delta),
  cheapWin: (score: number, average: number, delta: number) => fn('legacy.v1.player-score-info-texts.cheap-win', ["score","average","delta"])(score, average, delta),
  winningAverage: (score: number, average: number, delta: number) => fn('legacy.v1.player-score-info-texts.winning-average', ["score","average","delta"])(score, average, delta),
};
export const medianConsistency = {
  get nearIdentical() { return pool('legacy.v1.median-consistency.near-identical'); },
  get veryConsistent() { return pool('legacy.v1.median-consistency.very-consistent'); },
  get avgSlightlyHigher() { return pool('legacy.v1.median-consistency.avg-slightly-higher'); },
  get avgMuchHigher() { return pool('legacy.v1.median-consistency.avg-much-higher'); },
  get medianSlightlyHigher() { return pool('legacy.v1.median-consistency.median-slightly-higher'); },
  get medianMuchHigher() { return pool('legacy.v1.median-consistency.median-much-higher'); },
};
export const openFrame = {
  get veryClean() { return pool('legacy.v1.open-frame.very-clean'); },
  get controlled() { return pool('legacy.v1.open-frame.controlled'); },
  get shaky() { return pool('legacy.v1.open-frame.shaky'); },
  get tooMany() { return pool('legacy.v1.open-frame.too-many'); },
};
export const winRate = {
  get dominant() { return pool('legacy.v1.win-rate.dominant'); },
  get winning() { return pool('legacy.v1.win-rate.winning'); },
  get balanced() { return pool('legacy.v1.win-rate.balanced'); },
  get chasing() { return pool('legacy.v1.win-rate.chasing'); },
};
export const strikeFollow = {
  get hot() { return pool('legacy.v1.strike-follow.hot'); },
  get good() { return pool('legacy.v1.strike-follow.good'); },
  get normal() { return pool('legacy.v1.strike-follow.normal'); },
  get rare() { return pool('legacy.v1.strike-follow.rare'); },
};
export const comeback = {
  get veryResilient() { return pool('legacy.v1.comeback.very-resilient'); },
  get goodReaction() { return pool('legacy.v1.comeback.good-reaction'); },
  get normal() { return pool('legacy.v1.comeback.normal'); },
  get shaky() { return pool('legacy.v1.comeback.shaky'); },
};
export const finish = {
  get clutch() { return pool('legacy.v1.finish.clutch'); },
  get stable() { return pool('legacy.v1.finish.stable'); },
  get slightDrop() { return pool('legacy.v1.finish.slight-drop'); },
  get weak() { return pool('legacy.v1.finish.weak'); },
};
export const fatigue = {
  get endures() { return pool('legacy.v1.fatigue.endures'); },
  get smallDrop() { return pool('legacy.v1.fatigue.small-drop'); },
  get noticeableDrop() { return pool('legacy.v1.fatigue.noticeable-drop'); },
  get heavy() { return pool('legacy.v1.fatigue.heavy'); },
};
export const strikesPerGame = {
  get strong() { return pool('legacy.v1.strikes-per-game.strong'); },
  get solid() { return pool('legacy.v1.strikes-per-game.solid'); },
  get needsWork() { return pool('legacy.v1.strikes-per-game.needs-work'); },
};
export const sparesPerGame = {
  get strong() { return pool('legacy.v1.spares-per-game.strong'); },
  get solid() { return pool('legacy.v1.spares-per-game.solid'); },
  get needsWork() { return pool('legacy.v1.spares-per-game.needs-work'); },
};
export const firstThrow = {
  get veryGood() { return pool('legacy.v1.first-throw.very-good'); },
  get good() { return pool('legacy.v1.first-throw.good'); },
  get normal() { return pool('legacy.v1.first-throw.normal'); },
  get needsWork() { return pool('legacy.v1.first-throw.needs-work'); },
};
export const streak = {
  get veryRare() { return pool('legacy.v1.streak.very-rare'); },
  get turkey() { return pool('legacy.v1.streak.turkey'); },
  get double() { return pool('legacy.v1.streak.double'); },
  get single() { return pool('legacy.v1.streak.single'); },
  get none() { return pool('legacy.v1.streak.none'); },
};
export const medianAverage = {
  avgHigher: (diff: number) => fn('legacy.v1.median-average.avg-higher', ["diff"])(diff),
  medianHigher: (diff: number) => fn('legacy.v1.median-average.median-higher', ["diff"])(diff),
  get close() { return pool('legacy.v1.median-average.close'); },
};
export const finishInfo = {
  get clutch() { return pool('legacy.v1.finish-info.clutch'); },
  get stable() { return pool('legacy.v1.finish-info.stable'); },
  get slightDrop() { return pool('legacy.v1.finish-info.slight-drop'); },
  get weak() { return pool('legacy.v1.finish-info.weak'); },
};
export const firstThrowInfo = {
  strongButZeroes: (zeroRate: string) => fn('legacy.v1.first-throw-info.strong-but-zeroes', ["zeroRate"])(zeroRate),
  get strong() { return pool('legacy.v1.first-throw-info.strong'); },
  zeroes: (zeroRate: string) => fn('legacy.v1.first-throw-info.zeroes', ["zeroRate"])(zeroRate),
  get normal() { return pool('legacy.v1.first-throw-info.normal'); },
};
export const spareInfoTexts = {
  openAndZeroes: (zeroRate: string) => fn('legacy.v1.spare-info-texts.open-and-zeroes', ["zeroRate"])(zeroRate),
  get tooOpen() { return pool('legacy.v1.spare-info-texts.too-open'); },
  get normal() { return pool('legacy.v1.spare-info-texts.normal'); },
};
export const comebackInfo = {
  get chaosButRecovers() { return pool('legacy.v1.comeback-info.chaos-but-recovers'); },
  get chaosNoRecovery() { return pool('legacy.v1.comeback-info.chaos-no-recovery'); },
  get goodComeback() { return pool('legacy.v1.comeback-info.good-comeback'); },
  get normal() { return pool('legacy.v1.comeback-info.normal'); },
};
export const strikeFollowInfoTexts = {
  get hotAndStreaky() { return pool('legacy.v1.strike-follow-info-texts.hot-and-streaky'); },
  get lonely() { return pool('legacy.v1.strike-follow-info-texts.lonely'); },
  get normal() { return pool('legacy.v1.strike-follow-info-texts.normal'); },
};
export const dayScore = {
  get legendary() { return pool('legacy.v1.day-score.legendary'); },
  get strong() { return pool('legacy.v1.day-score.strong'); },
  get good() { return pool('legacy.v1.day-score.good'); },
  get solid() { return pool('legacy.v1.day-score.solid'); },
  get shaky() { return pool('legacy.v1.day-score.shaky'); },
  get cheap() { return pool('legacy.v1.day-score.cheap'); },
};
export const lossScore = {
  get legendary() { return pool('legacy.v1.loss-score.legendary'); },
  get veryStrong() { return pool('legacy.v1.loss-score.very-strong'); },
  get strong() { return pool('legacy.v1.loss-score.strong'); },
  get solid() { return pool('legacy.v1.loss-score.solid'); },
  get shaky() { return pool('legacy.v1.loss-score.shaky'); },
  get weak() { return pool('legacy.v1.loss-score.weak'); },
};
export const dayLossScore = {
  get legendary() { return pool('legacy.v1.day-loss-score.legendary'); },
  get strong() { return pool('legacy.v1.day-loss-score.strong'); },
  get good() { return pool('legacy.v1.day-loss-score.good'); },
  get solid() { return pool('legacy.v1.day-loss-score.solid'); },
  get shaky() { return pool('legacy.v1.day-loss-score.shaky'); },
  get cheap() { return pool('legacy.v1.day-loss-score.cheap'); },
};
export const games = {
  get marathon() { return pool('legacy.v1.games.marathon'); },
  get decent() { return pool('legacy.v1.games.decent'); },
  get short() { return pool('legacy.v1.games.short'); },
};
export const totalPins = {
  get massacre() { return pool('legacy.v1.total-pins.massacre'); },
  get solid() { return pool('legacy.v1.total-pins.solid'); },
  get low() { return pool('legacy.v1.total-pins.low'); },
};
export const avgPerGame = {
  get strong() { return pool('legacy.v1.avg-per-game.strong'); },
  get solid() { return pool('legacy.v1.avg-per-game.solid'); },
  get mixed() { return pool('legacy.v1.avg-per-game.mixed'); },
  get weak() { return pool('legacy.v1.avg-per-game.weak'); },
};
export const underdog = {
  get plotTwist() { return pool('legacy.v1.underdog.plot-twist'); },
  get overperformed() { return pool('legacy.v1.underdog.overperformed'); },
  get slightlyAbove() { return pool('legacy.v1.underdog.slightly-above'); },
  get noMoment() { return pool('legacy.v1.underdog.no-moment'); },
};
export const lowestWin = {
  get none() { return pool('legacy.v1.lowest-win.none'); },
  unfair: (win: number, loss: number) => fn('legacy.v1.lowest-win.unfair', ["win","loss"])(win, loss),
  cheap: (win: number) => fn('legacy.v1.lowest-win.cheap', ["win"])(win),
  normal: (win: number) => fn('legacy.v1.lowest-win.normal', ["win"])(win),
};
export const highestLoss = {
  get none() { return pool('legacy.v1.highest-loss.none'); },
  aboveAvgWin: (loss: number) => fn('legacy.v1.highest-loss.above-avg-win', ["loss"])(loss),
  normal: (loss: number) => fn('legacy.v1.highest-loss.normal', ["loss"])(loss),
};
export const playerDay = {
  leaderBigGap: (gap: number) => fn('legacy.v1.player-day.leader-big-gap', ["gap"])(gap),
  leaderComfortable: (gap: number) => fn('legacy.v1.player-day.leader-comfortable', ["gap"])(gap),
  leaderCloseWin: (gap: number) => fn('legacy.v1.player-day.leader-close-win', ["gap"])(gap),
  get leaderDefault() { return pool('legacy.v1.player-day.leader-default'); },
  lastBigGap: (gap: number, rank: number) => fn('legacy.v1.player-day.last-big-gap', ["gap","rank"])(gap, rank),
  lastNoticeableGap: (gap: number, rank: number) => fn('legacy.v1.player-day.last-noticeable-gap', ["gap","rank"])(gap, rank),
  closeToLeader: (gap: number, rank: number) => fn('legacy.v1.player-day.close-to-leader', ["gap","rank"])(gap, rank),
  strikingDistance: (gap: number, rank: number) => fn('legacy.v1.player-day.striking-distance', ["gap","rank"])(gap, rank),
  aboveAvg: (delta: number) => fn('legacy.v1.player-day.above-avg', ["delta"])(delta),
  belowAvg: (delta: number) => fn('legacy.v1.player-day.below-avg', ["delta"])(delta),
  get manyOpen() { return pool('legacy.v1.player-day.many-open'); },
  get fewOpen() { return pool('legacy.v1.player-day.few-open'); },
  get neutral() { return pool('legacy.v1.player-day.neutral'); },
};
export const dayRecap = {
  intro: (games: number, players: number) => fn('legacy.v1.day-recap.intro', ["games","players"])(games, players),
  introSolo: (games: number) => fn('legacy.v1.day-recap.intro-solo', ["games"])(games),
  champDominant: (name: string, gap: number) => fn('legacy.v1.day-recap.champ-dominant', ["name","gap"])(name, gap),
  champComfortable: (name: string, gap: number) => fn('legacy.v1.day-recap.champ-comfortable', ["name","gap"])(name, gap),
  champClose: (name: string, gap: number) => fn('legacy.v1.day-recap.champ-close', ["name","gap"])(name, gap),
  champDefault: (name: string) => fn('legacy.v1.day-recap.champ-default', ["name"])(name),
  shoutoutTopScore: (name: string, score: number) => fn('legacy.v1.day-recap.shoutout-top-score', ["name","score"])(name, score),
  underdogHero: (name: string, pct: number) => fn('legacy.v1.day-recap.underdog-hero', ["name","pct"])(name, pct),
  lowlight: (name: string) => fn('legacy.v1.day-recap.lowlight', ["name"])(name),
  lowlightOpen: (name: string, rate: number) => fn('legacy.v1.day-recap.lowlight-open', ["name","rate"])(name, rate),
};
export const excitement = {
  get insane() { return pool('legacy.v1.excitement.insane'); },
  get thrilling() { return pool('legacy.v1.excitement.thrilling'); },
  get decent() { return pool('legacy.v1.excitement.decent'); },
  get boring() { return pool('legacy.v1.excitement.boring'); },
};
export const gameComeback = {
  epic: (pins: number) => fn('legacy.v1.game-comeback.epic', ["pins"])(pins),
  solid: (pins: number) => fn('legacy.v1.game-comeback.solid', ["pins"])(pins),
  minor: (pins: number) => fn('legacy.v1.game-comeback.minor', ["pins"])(pins),
};
export const bigLead = {
  dominant: (margin: number, name: string) => fn('legacy.v1.big-lead.dominant', ["margin","name"])(margin, name),
  clear: (margin: number, name: string) => fn('legacy.v1.big-lead.clear', ["margin","name"])(margin, name),
  narrow: (margin: number) => fn('legacy.v1.big-lead.narrow', ["margin"])(margin),
};
export const closestMoment = {
  nailBiter: (margin: number, frame: number) => fn('legacy.v1.closest-moment.nail-biter', ["margin","frame"])(margin, frame),
  tight: (margin: number, frame: number) => fn('legacy.v1.closest-moment.tight', ["margin","frame"])(margin, frame),
};
export const lateDrama = {
  leaderLost: (leader: string, winner: string) => fn('legacy.v1.late-drama.leader-lost', ["leader","winner"])(leader, winner),
};
