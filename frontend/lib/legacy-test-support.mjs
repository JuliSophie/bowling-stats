import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function loadTsModule(file, resolve) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error })(resolve, module, module.exports);
  return module.exports;
}

export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const samples = [-35, -1.25, -1, 0, 1, 1.25, 2, 180];
export const names = ['', 'Testspieler', 'Name {gap}'];
export function poolCases(types) {
  if (!types.length) return [[]];
  return samples.flatMap(value => names.map(name =>
    types.map(type => type === 'string' ? name : type === 'boolean' ? value > 0 : value)));
}

export function wrapperCases() {
  const values = [...new Set([
    -50, -35, -34.9, -20, -19.9, -8, -7.9, -1.25, -1, 0, 1, 1.25, 2, 3, 4, 5, 7, 8, 9, 10,
    14, 15, 19, 20, 20.1, 24, 25, 29, 30, 34, 35, 35.1, 39, 40, 49, 50, 50.1,
    54, 55, 64, 65, 69, 70, 79, 80, 84, 85, 89, 90, 99, 100, 109, 110, 114, 115,
    119, 120, 134, 135, 144, 145, 149, 150, 169, 170, 179, 180, 199, 200, 219, 220, 250, 300,
  ])];
  const output = {};
  const add = (name, ...args) => { (output[name] ??= []).push(args); };
  for (const value of values) {
    for (const name of ['clampPercent', 'openFrameBenchmark', 'firstThrowBenchmark', 'streakBenchmark',
      'finishStrengthInfo', 'gamesBenchmark', 'comebackTrash']) add(name, value);
    for (const seed of ['seed-a', 'seed-b']) {
      for (const name of ['scoreBenchmark', 'lossScoreBenchmark', 'dayScoreBenchmark', 'dayLossScoreBenchmark']) add(name, value, seed);
    }
    for (const average of [0, 100, 150, 200]) {
      for (const kind of ['average', 'peak', 'winningPeak', 'cheapWin', 'winningAverage']) {
        add('playerScoreBenchmark', value, average, kind, 'seed-a');
        add('playerScoreInfo', value, average, kind, 'seed-b');
      }
      add('playerLossScoreBenchmark', value, average, 'seed-a');
    }
    add('medianConsistencyBenchmark', 150, 150 + value);
    add('medianAverageInfo', 150, 150 + value);
    for (const kind of ['strikeFollow', 'comeback', 'win']) add('rateBenchmark', value, kind);
    for (const kind of ['finish', 'fatigue']) add('deltaBenchmark', value, kind);
    for (const kind of ['strike', 'spare']) for (const games of [0, 1, 3, 10]) add('countPerGameBenchmark', value, games, kind);
    for (const second of [0, 50, 70]) {
      add('firstThrowInfo', value, second);
      add('spareInfo', value, second);
      add('comebackInfo', value, second);
    }
    for (const streak of [0, 1, 3, 7]) add('strikeFollowInfo', value, streak);
    for (const players of [1, 2, 3]) {
      add('totalPinsBenchmark', value * 30, players, 3);
      add('averagePerGameBenchmark', value * 2, players);
    }
    add('underdogBenchmark', { name: 'Testspieler', dayAverage: 170, globalAverage: 150, upliftPercent: value });
    for (const other of [null, 0, 150, 200]) {
      add('lowestWinInfo', value, other);
      add('highestLossInfo', value, other);
    }
    for (const name of names) add('bigLeadTrash', value, name);
    for (const frame of [1, 3, 4, 7, 8, 9, 10]) add('closestMomentTrash', value, frame);
  }
  for (const tone of ['good', 'okay', 'warn', 'neutral', null]) add('benchmarkToneClass', tone);
  for (const value of [0, 0.49, 0.5, 1.49, 1.5, 2.99, 3, 5]) add('excitementTrash', value);
  for (const value of [null, 0, 1, 2, 3, 4, 5, 7, 8, 9, 10]) add('decidingFrameTrash', value);
  for (const name of ['dayScoreBenchmark', 'dayLossScoreBenchmark', 'underdogBenchmark']) add(name, null);
  add('lowestWinInfo', null, null);
  add('highestLossInfo', null, null);
  for (const pair of [['A', 'B'], ['A', 'A'], ['', 'Winner'], ['Name {gap}', 'Winner']]) add('lateDramaTrash', ...pair);
  const players = [
    { name: 'A', totalPins: 400, wins: 2, avgScore: 400 / 3, openFrameRate: 30 },
    { name: 'B', totalPins: 450, wins: 1, avgScore: 150, openFrameRate: 40 },
    { name: 'C', totalPins: 620, wins: 0, avgScore: 620 / 3, openFrameRate: 50 },
  ];
  players.forEach((player, i) => add('playerDayContext', player, players, i, 150));
  add('playerDayContext', players[0], [players[0]], 0, 150);
  for (const gameCount of [0, 1, 2, 3, 7]) for (const playerCount of [1, 2, 3]) for (const gap of [-220, -50, 0, 1, 5, 15, 30]) {
    add('buildDayRecap', { seed: 'fixture', gameCount, playerCount, winnerName: 'Name {gap}', gapToSecond: gap,
      topScorer: { name: 'Top', score: 220 }, underdog: { name: 'Other', upliftPercent: 20 },
      worst: { name: 'Worst', openFrameRate: 50 } });
  }
  return output;
}

export function wrapperDigest(module) {
  return Object.fromEntries(Object.entries(wrapperCases()).map(([name, cases]) => [
    name, { cases: cases.length, hash: digest(cases.map(args => module[name](...args))) },
  ]));
}
