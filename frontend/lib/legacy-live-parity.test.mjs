import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectLiveCommentary } from './live-commentary.ts';

const source = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));
const pools = source.scenarios.filter(s => s.kind === 'legacy-live').map(pool => ({
  ...pool, templateSelectionIds: pool.templates.map((_, index) => `${pool.legacyLiveScenario}.${index + 1}`),
}));
const first = (pins, fallenPins) => ({ player: 'Synthetic', frame: 1, throw: 1, pinsKnockedDown: pins, fallenPins });
const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const split = [1, 2, 3, 4, 5, 6, 8, 9];
const cases = [
  ['live.strike', first(10), []],
  ['live.throw', first(6), []],
  ['live.leave.single', first(9, nine), []],
  ['live.bonus', { ...first(6), frame: 10, throw: 3 }, []],
  ['live.spare', { ...first(3), throw: 2 }, [first(7)]],
  ['live.open', { ...first(2), throw: 2 }, [first(7)]],
  ['live.miss.single', { ...first(0, []), throw: 2, alreadyDownPins: nine }, [first(9, nine)]],
  ['live.split.converted', { ...first(2, [7, 10]), throw: 2, alreadyDownPins: split }, [first(8, split)]],
];
// The original live fallback used one-based occurrence keys with this FNV-1a ranking.
function rank(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

test('all eight live fallback banks preserve baseline output and surviving winners after disable', () => {
  assert.equal(pools.length, 8);
  for (const [scenario, event, history] of cases) {
    const pool = pools.find(item => item.legacyLiveScenario === scenario);
    assert.ok(pool);
    for (let seed = 0; seed < 128; seed++) {
      const throwId = `legacy-${seed}`;
      const candidates = pool.templates.map((text, i) => ({
        text, id: `${scenario}.${i + 1}`, index: i,
        rank: rank(`${throwId}|${scenario}|${scenario}.${i + 1}`),
      })).sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
      const winner = candidates[0];
      const expected = winner.text.replace(/\{player\}/g, 'Synthetic')
        .replace(/\{pins\}/g, String(event.pinsKnockedDown)).replace(/\{pin\}/g, '10');
      const selected = selectLiveCommentary({ ...event, throwId }, history, { scenarios: pools });
      assert.equal(selected.scenario, scenario);
      assert.equal(selected.text, expected, `${scenario}/${seed}`);
      const removed = winner.index === 0 ? 1 : 0;
      const filtered = { ...pool,
        templates: pool.templates.filter((_, i) => i !== removed),
        templateIds: pool.templateIds.filter((_, i) => i !== removed),
        templateSelectionIds: pool.templateSelectionIds.filter((_, i) => i !== removed),
      };
      const after = selectLiveCommentary({ ...event, throwId }, history,
        { scenarios: pools.map(item => item.id === pool.id ? filtered : item) });
      assert.equal(after.text, selected.text, `${scenario}/${seed}: surviving winner changed`);
    }
  }
});

test('disabled and exhausted primary pools do not revive their migrated fallback', () => {
  for (const primary of [
    { id: 'live.strike', enabled: false, templates: ['Forbidden.'], templateIds: ['forbidden'] },
    { id: 'live.strike', enabled: true, templates: [], templateIds: [] },
  ]) {
    const selected = selectLiveCommentary({ ...first(10), throwId: 'review-1' }, [],
      { scenarios: [primary, ...pools] });
    assert.equal(selected.text, 'Wurf registriert.');
    assert.notEqual(selected.text, 'Forbidden.');
  }
});
