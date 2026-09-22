import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const catalog = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));

function moduleFrom(file, require, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, globals)(require, module, module.exports);
  return module.exports;
}

test('day recap and fallback retain total units and true total leader, independent of wins ranking', () => {
  const accessor = moduleFrom('./legacy-catalog.ts', (path) => {
    if (path === './trash-talk-v3') return { getTrashTalkCatalog: () => catalog };
    throw new Error(`Unexpected accessor import ${path}`);
  });
  const texts = moduleFrom('./trash-talk-texts.ts', (path) => {
    if (path === './legacy-catalog') return accessor;
    throw new Error(`Unexpected text-bank import ${path}`);
  });
  const talk = moduleFrom('./trash-talk.ts', (path) => {
    if (path === './trash-talk-texts') return texts;
    if (path === './trash-talk-v3') return { selectTrashTalkV3: () => null };
    if (path === './trash-talk-v2/engine') return {};
    throw new Error(`Unexpected import ${path}`);
  });
  const rawDelta = texts.playerScoreInfoTexts.peak(1.25, -1.25, -1.25);
  assert.ok(rawDelta.some((text) => text.includes('1.25') && text.includes('-1.25')));
  for (const games of [0, 1, 2]) {
    const recap = texts.dayRecap.intro(games, 2);
    assert.ok(recap.every((text) => text.includes(String(games))));
  }
  assert.ok(texts.dayRecap.shoutoutTopScore('', 0).some((text) => text.includes('0')));
  assert.ok(texts.dayRecap.shoutoutTopScore('{gap}', 1).some((text) => text.includes('{gap}')));
  const base = { seed: 'synthetic', gameCount: 3, playerCount: 3, winnerName: 'A' };
  const positive = talk.buildDayRecap({ ...base, gapToSecond: 30 });
  assert.match(positive, /30 Punkte Vorsprung/);
  assert.doesNotMatch(positive, /Schnitt/);
  const negative = talk.buildDayRecap({ ...base, gapToSecond: -220 });
  assert.match(negative, /220 Punkte/);
  assert.doesNotMatch(negative, /-220|0 Pins|Schnitt/);
  const players = [
    { name: 'A', wins: 2, totalPins: 400, avgScore: 400 / 3, openFrameRate: 0 },
    { name: 'B', wins: 1, totalPins: 450, avgScore: 150, openFrameRate: 0 },
    { name: 'C', wins: 0, totalPins: 620, avgScore: 620 / 3, openFrameRate: 0 },
  ];
  assert.match(talk.playerDayContext(players[0], players, 0), /220 Punkte hinter/);
  assert.match(talk.playerDayContext(players[1], players, 1), /170 Punkte hinter/);
  assert.match(talk.playerDayContext(players[2], players, 2), /170 Punkte vor/);
});

function gamesHarness() {
  let current;
  let now = 0;
  const responses = [];
  const catalogState = { catalog: null, error: null, stale: false };
  const react = {
    useState(initial) {
      const owner = current, index = owner.cursor++;
      if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.slots[index], (value) => {
        owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
      }];
    },
    useEffect(effect) {
      const owner = current, index = owner.cursor++;
      if (!(index in owner.slots)) {
        owner.slots[index] = true;
        owner.effects.push(effect);
      }
    },
  };
  const api = { fetchGames: () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next();
  } };
  const catalog = {
    getTrashTalkCatalogState: () => catalogState,
    refreshTrashTalkCatalog: async () => {},
    subscribeTrashTalkCatalog: () => () => {},
  };
  const hooks = moduleFrom('./use-games.ts', (path) => {
    if (path === 'react') return react;
    if (path === '@/lib/api') return api;
    if (path === '@/lib/use-trash-talk-catalog') return catalog;
    throw new Error(`Unexpected import ${path}`);
  }, { Date: { now: () => now }, Error });
  const mount = () => {
    const instance = { slots: [], effects: [], cursor: 0 };
    instance.render = () => {
      current = instance;
      instance.cursor = 0;
      const value = hooks.useGames();
      current = null;
      for (const effect of instance.effects.splice(0)) effect();
      return value;
    };
    instance.render();
    return instance;
  };
  return { mount, responses, advance: () => { now += 11_000; }, hooks };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('games initial failure recovers for every already mounted consumer', async () => {
  const harness = gamesHarness();
  harness.responses.push(() => Promise.reject(new Error('offline')));
  const first = harness.mount();
  await settle();
  assert.equal(first.render().error, 'offline');
  assert.equal(first.render().stale, false);
  harness.responses.push(() => Promise.resolve([{ id: 1 }]));
  const second = harness.mount();
  await settle();
  for (const consumer of [first, second]) {
    assert.equal(consumer.render().error, null);
    assert.equal(consumer.render().games[0].id, 1);
    assert.equal(consumer.render().loading, false);
  }
});

test('failed revalidation exposes staleness, preserves data and clears errors after successful update', async () => {
  const harness = gamesHarness();
  harness.responses.push(() => Promise.resolve([{ id: 1 }]));
  const first = harness.mount();
  await settle();
  harness.advance();
  harness.responses.push(() => Promise.reject(new Error('offline refresh')));
  const second = harness.mount();
  await settle();
  for (const consumer of [first, second]) {
    assert.equal(consumer.render().stale, true);
    assert.equal(consumer.render().error, 'offline refresh');
    assert.equal(consumer.render().games[0].id, 1);
  }
  harness.hooks.mutateGames([{ id: 2 }]);
  for (const consumer of [first, second]) {
    assert.equal(consumer.render().error, null);
    assert.equal(consumer.render().stale, false);
    assert.equal(consumer.render().games[0].id, 2);
  }
});
