import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectLiveCommentary, shouldAnimateLiveThrow } from './live-commentary.ts';

const catalog = JSON.parse(readFileSync(
  new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8',
));

const context = (before, current, extra = {}) => ({
  version: 1, revision: 9, valid: true,
  previousClearance: null, weakPerformance: null,
  before: { position: before }, current: { position: current }, ...extra,
});

test('French and Paris pools require authoritative immediate clearance and exact count', () => {
  const one = selectLiveCommentary({
    throwId: 'a1', player: 'A', playerIndex: 0, frame: 2, throw: 1, pinsKnockedDown: 1,
    commentaryContext: { ...context('unique-leader', 'behind'),
      previousClearance: { throwId: 'x', kind: 'strike' } },
  }, [], catalog);
  assert.equal(one.scenario, 'live.postclearance.one.lead_lost');
  assert.match(one.text, /vorläufig/i);

  const zero = selectLiveCommentary({
    throwId: 'a2', player: 'A', playerIndex: 0, frame: 2, throw: 1, pinsKnockedDown: 0,
    commentaryContext: { ...context('unique-leader', 'unique-leader'),
      previousClearance: { throwId: 'x', kind: 'spare' } },
  }, [], catalog);
  assert.equal(zero.scenario, 'live.postclearance.zero.leader');
  assert.match(zero.text, /vorläufig/i);
});

test('ties and non-leading histories do not become lead-loss or leader claims', () => {
  const tied = selectLiveCommentary({
    throwId: 'tie', player: 'A', playerIndex: 0, frame: 2, throw: 1, pinsKnockedDown: 1,
    commentaryContext: { ...context('tied-leader', 'tied-leader'),
      previousClearance: { throwId: 'x', kind: 'strike' } },
  }, [], catalog);
  assert.equal(tied.scenario, 'live.postclearance.one');

  const behind = selectLiveCommentary({
    throwId: 'weak', player: 'A', playerIndex: 0, frame: 2, throw: 2, pinsKnockedDown: 4,
    commentaryContext: { ...context('behind', 'behind'),
      weakPerformance: { kind: 'open-frame' } },
  }, [], catalog);
  assert.equal(behind.scenario, 'live.open');
});

test('duplicate names use playerIndex for same-frame spare context', () => {
  const priorOther = {
    throwId: 'b1', player: 'Same', playerIndex: 1, frame: 1, throw: 1,
    pinsKnockedDown: 9, fallenPins: [1,2,3,4,5,6,7,8,9],
  };
  const current = {
    throwId: 'a2', player: 'Same', playerIndex: 0, frame: 1, throw: 2,
    pinsKnockedDown: 0, fallenPins: [], alreadyDownPins: [1,2,3,4,5,6,7,8,9],
  };
  assert.notEqual(selectLiveCommentary(current, [priorOther], catalog).scenario, 'live.spare');
});

test('generic text is safe for every count and ordinal without pin evidence', () => {
  const unsafe = /Rest wartet|Aufräumarbeiten|nächste Antwort|Erster Wurf|noch etwas zu tun/i;
  const fallbackOnly = { ...catalog, scenarios: catalog.scenarios.map(scenario =>
    scenario.kind || scenario.id === 'live.throw' ? scenario : { ...scenario, enabled: false }) };
  for (let count = 0; count <= 10; count += 1) {
    for (const ordinal of [1, 2, 3]) {
      const selected = selectLiveCommentary({
        throwId: `g-${count}-${ordinal}`, player: 'A', frame: ordinal === 3 ? 10 : 1,
        throw: ordinal, pinsKnockedDown: count,
      }, [], fallbackOnly);
      assert.doesNotMatch(selected.text, unsafe);
    }
  }
  const unknown = selectLiveCommentary({ throwId: 'unknown', player: 'A', throw: 2 }, [], fallbackOnly);
  assert.doesNotMatch(unknown.text, unsafe);
});

test('invalid context cannot enable a post-clearance flavor or leadership claim', () => {
  for (const invalid of [{ valid: false }, { version: 99 }]) {
    const selected = selectLiveCommentary({
      throwId: 'invalid', player: 'A', playerIndex: 0, frame: 2, throw: 1, pinsKnockedDown: 1,
      commentaryContext: { ...context('unique-leader', 'behind'), ...invalid,
        previousClearance: { throwId: 'x', kind: 'strike' } },
    }, [], catalog);
    assert.equal(selected.scenario, 'live.throw');
  }
});

test('plain variants coexist with correctly named Strike/Spare and zero-only Paris flavor', () => {
  for (const kind of ['strike', 'spare']) {
    for (const pinsKnockedDown of [0, 1]) {
      const texts = new Set();
      for (let seed = 0; seed < 128; seed++) {
        const selected = selectLiveCommentary({
          throwId: `flavor-${seed}`, player: 'A', playerIndex: 0, frame: 2, throw: 1, pinsKnockedDown,
          commentaryContext: { ...context(null, null), previousClearance: { throwId: 'x', kind } },
        }, [], catalog);
        assert.equal(selected.scenario, `live.postclearance.${pinsKnockedDown === 0 ? 'zero' : 'one'}`);
        assert.doesNotMatch(selected.text, /Strike\/Spare|\{clearance\}|Eine Pin/);
        if (pinsKnockedDown === 1) assert.doesNotMatch(selected.text, /Paris/);
        texts.add(selected.text);
      }
      assert.ok([...texts].some(text => /französisch|Paris/i.test(text)));
      assert.ok([...texts].some(text => !/französisch|Paris/i.test(text)));
    }
  }
});

test('authoritative same-revision snapshot suppresses late throw effects', () => {
  const covered = new Set(['t-1']);
  assert.equal(shouldAnimateLiveThrow('t-1', covered), false);
  assert.equal(shouldAnimateLiveThrow('t-2', covered), true);
});
