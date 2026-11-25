import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsLiveEvent, acceptsLiveRevision, reconcileLiveCommentary, selectLiveCommentary } from './live-commentary.ts';

const event = (extra = {}) => ({ throwId: 'stable-1', player: 'Anna', frame: 1, throw: 1, pinsKnockedDown: 10, ...extra });

test('selection is deterministic and stable across rerenders', () => {
  assert.deepEqual(selectLiveCommentary(event()), selectLiveCommentary(event()));
});

test('correction context changes the semantic slot without random churn', () => {
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 3, fallenPins: [8,9,10], alreadyDownPins: [1,2,3,4,5,6,7] }), [
    event({ pinsKnockedDown: 7, fallenPins: [1,2,3,4,5,6,7] }),
  ]).scenario, 'live.spare');
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 2 }), [event({ pinsKnockedDown: 7 })]).scenario, 'live.open');
});

test('count-only 7+3 is a spare and count-only 0+10 is not a strike', () => {
  const first = event({ throw: 1, pinsKnockedDown: 7 });
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 3 }), [first]).scenario, 'live.spare');
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 10 }), [
    event({ throw: 1, pinsKnockedDown: 0 }),
  ]).scenario, 'live.spare');
  assert.notEqual(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 10 }), [
    event({ throw: 1, pinsKnockedDown: 0 }),
  ]).scenario, 'live.strike');
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 3, fallenPins: [8,9,10] }), [first]).scenario, 'live.spare');
});

test('tenth-frame first-ball strike is still a strike while later balls are bonus', () => {
  assert.equal(selectLiveCommentary(event({ frame: 10, throw: 1, pinsKnockedDown: 10 })).scenario, 'live.strike');
});

test('tenth-frame bonus throws after an X stay neutral', () => {
  const first = event({ frame: 10, throw: 1, pinsKnockedDown: 10 });
  assert.equal(selectLiveCommentary(event({ frame: 10, throw: 2, pinsKnockedDown: 7 }), [first]).scenario, 'live.bonus');
  assert.equal(selectLiveCommentary(event({ frame: 10, throw: 3, pinsKnockedDown: 2 }), [first, event({ frame: 10, throw: 2, pinsKnockedDown: 7 })]).scenario, 'live.bonus');
  assert.equal(selectLiveCommentary(event({ frame: 10, throw: 3, pinsKnockedDown: 2 }), [
    event({ frame: 10, throw: 1, pinsKnockedDown: 7 }),
    event({ frame: 10, throw: 2, pinsKnockedDown: 3 }),
  ]).scenario, 'live.bonus');
});

test('pin evidence distinguishes a nine-pin first ball from a count-only throw', () => {
  assert.equal(selectLiveCommentary(event({ pinsKnockedDown: 9, fallenPins: [1,2,3,4,5,6,7,8,9] })).scenario, 'live.leave.single');
  assert.equal(selectLiveCommentary(event({ pinsKnockedDown: 9 })).scenario, 'live.throw');
});

test('does not infer a single-pin miss from 9+0 without pin evidence', () => {
  const prior = event({ pinsKnockedDown: 9, fallenPins: [1,2,3,4,5,6,7,8,9] });
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 0 }), [prior]).scenario, 'live.open');
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 0, fallenPins: [], alreadyDownPins: [1,2,3,4,5,6,7,8,9] }), [prior]).scenario, 'live.miss.single');
});

test('requires valid unique pin sets and recognizes an evidenced split conversion', () => {
  const prior = event({ pinsKnockedDown: 8, fallenPins: [1,2,3,4,5,6,8,9] });
  const converted = event({ throw: 2, pinsKnockedDown: 2, fallenPins: [7,10], alreadyDownPins: [1,2,3,4,5,6,8,9] });
  assert.equal(selectLiveCommentary(event({ pinsKnockedDown: 8, fallenPins: [1,1,2,3,4,5,6,7] })).scenario, 'live.throw');
  assert.equal(selectLiveCommentary(converted, [prior]).scenario, 'live.split.converted');
});

test('rejects malformed or conflicting already-down evidence', () => {
  const first = event({ pinsKnockedDown: 7, fallenPins: [1,2,3,4,5,6,7] });
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 3, fallenPins: [8,9,10], alreadyDownPins: [1,1,2] }), [first]).scenario, 'live.throw');
  assert.equal(selectLiveCommentary(event({ throw: 2, pinsKnockedDown: 3, fallenPins: [8,9,10], alreadyDownPins: [4,5,6] }), [first]).scenario, 'live.throw');
  assert.equal(selectLiveCommentary(event({ pinsKnockedDown: 9, fallenPins: [1,2,3,4,5,6,7,8,9], alreadyDownPins: [10] })).scenario, 'live.throw');
});

test('first-throw count-only open uses the neutral throw scenario', () => {
  assert.equal(selectLiveCommentary(event({ pinsKnockedDown: 6 })).scenario, 'live.throw');
});

test('interpolates strict bindings and does not revive disabled catalog text', () => {
  const catalog = {
    release: 'r1',
    scenarios: [
      { id: 'live.strike', enabled: true, templates: ['{player} schlägt {pins}.'], templateIds: ['strike.custom'], bindings: ['player', 'pins'] },
      { id: 'live.throw', enabled: false, templates: ['{player} verboten.'], templateIds: ['throw.disabled'], bindings: ['player'] },
    ],
  };
  const selected = selectLiveCommentary(event(), [], catalog);
  assert.equal(selected.text, 'Anna schlägt 10.');
  assert.notEqual(selectLiveCommentary(event({ pinsKnockedDown: 6 }), [], catalog).text, 'Anna verboten.');
});

test('filtered legacy occurrences retain their original identity', () => {
  const full = ['first', 'second', 'third', 'fourth'].map((text, index) => ({
    id: `live.throw.${index}`, text: `{player} ${text} {pins}.`,
  }));
  const catalog = {
    scenarios: [{
      id: 'live.throw', enabled: true,
      templates: full.map((item) => item.text), templateIds: full.map((item) => item.id),
    }],
  };
  const filtered = {
    scenarios: [{ ...catalog.scenarios[0], templates: full.slice(1).map((item) => item.text),
      templateIds: full.slice(1).map((item) => item.id) }],
  };
  const selected = selectLiveCommentary(event({ pinsKnockedDown: 6 }), [], filtered);
  assert.ok(full.slice(1).some((item) => selected.text === `Anna ${item.text.split(' ')[1]} 6.`));
});

test('correction replaces the same stable bubble and deletion removes it', () => {
  const first = event({ throwId: 'same', pinsKnockedDown: 9, fallenPins: [1,2,3,4,5,6,7,8,9] });
  const current = { same: selectLiveCommentary(first) };
  const corrected = event({ throwId: 'same', pinsKnockedDown: 10, fallenPins: [1,2,3,4,5,6,7,8,9,10] });
  const replaced = reconcileLiveCommentary(current, [corrected]);
  assert.equal(replaced.same.scenario, 'live.strike');
  assert.deepEqual(reconcileLiveCommentary(replaced, []), {});
});

test('commentary without a throw ID survives a score update under its fallback key', () => {
  const throwWithoutId = event({ throwId: undefined, pinsKnockedDown: 4 });
  const caption = selectLiveCommentary(throwWithoutId);

  const updated = reconcileLiveCommentary({ [caption.throwId]: caption }, [throwWithoutId]);

  assert.equal(updated['Anna:1:1']?.throwId, 'Anna:1:1');
});

test('same-named roster slots keep separate commentary without throw IDs', () => {
  const fallenPins = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const first = event({
    throwId: undefined, player: 'Alex', playerIndex: 0, frame: 4, pinsKnockedDown: 9,
    fallenPins, alreadyDownPins: [],
    commentaryContext: { version: 1, valid: true, pinPattern: { kind: 'recurring-leave', pin: 10 } },
  });
  const second = event({
    throwId: undefined, player: 'Alex', playerIndex: 1, frame: 4, pinsKnockedDown: 9,
    fallenPins, alreadyDownPins: [],
  });
  const catalog = { scenarios: [
    { id: 'live.leave.recurring', templates: ['Die {pin} steht wieder.'] },
    { id: 'live.leave.single', templates: ['Pin {pin} wartet.'] },
  ] };
  const recurring = selectLiveCommentary(first, [], catalog);
  const ordinary = selectLiveCommentary(second, [], catalog);

  const updated = reconcileLiveCommentary({
    [recurring.throwId]: recurring,
    [ordinary.throwId]: ordinary,
  }, [first, second], catalog);

  assert.notEqual(recurring.throwId, ordinary.throwId);
  assert.equal(updated[recurring.throwId]?.scenario, 'live.leave.recurring');
  assert.equal(updated[ordinary.throwId]?.scenario, 'live.leave.single');
});

test('an unknown roster slot cannot give another Alex a spare', () => {
  const prior = event({ throwId: 'prior', player: 'Alex', playerIndex: undefined, frame: 4, throw: 1, pinsKnockedDown: 9 });
  const current = event({ throwId: 'current', player: 'Alex', playerIndex: 1, frame: 4, throw: 2, pinsKnockedDown: 1 });

  assert.equal(selectLiveCommentary(current, [prior]).scenario, 'live.open');
});

test('revision gate rejects stale events but accepts a reset session revision', () => {
  assert.equal(acceptsLiveRevision(20, 19), false);
  assert.equal(acceptsLiveRevision(0, 0), true);
});

test('lifecycle gate rejects stale and switched-session events before processing', () => {
  assert.equal(acceptsLiveEvent('session-b', 'session-a', 0, 0), false);
  assert.equal(acceptsLiveEvent('session-b', 'session-b', 0, 0), true);
  assert.equal(acceptsLiveEvent('session-b', 'session-b', 4, 3), false);
  assert.equal(acceptsLiveEvent('session-b', undefined, 4, 5), true);
});

test('pin patterns select enabled catalog variants only on a matching physical delivery', () => {
  const down = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const leave = event({ pinsKnockedDown: 9, fallenPins: down, alreadyDownPins: [] });
  const spare = event({ throw: 2, pinsKnockedDown: 1, fallenPins: [10], alreadyDownPins: down });
  const recurring = { kind: 'recurring-leave', pin: 10 };
  const strong = { kind: 'strong-side-spare', pin: 10, side: 'right' };
  const scenarios = [
    { id: 'live.leave.recurring', templates: ['Stammgast {pin}.'] },
    { id: 'live.spare.strong_side', templates: ['{side}: {pin}.'] },
    { id: 'live.spare', templates: ['Spare.'] },
    { id: 'live.leave.single', templates: ['Pin {pin}.'] },
  ];
  for (const [row, pinPattern, expected, text] of [
    [leave, recurring, 'live.leave.recurring', 'Stammgast 10.'],
    [spare, strong, 'live.spare.strong_side', 'rechts: 10.'],
    [leave, { ...recurring, pin: 7 }, 'live.leave.single', 'Pin 10.'],
    [spare, { ...strong, side: 'left' }, 'live.spare', 'Spare.'],
    [{ ...spare, fallenPins: null, alreadyDownPins: null }, strong, 'live.spare', 'Spare.'],
  ]) {
    const history = row.throw === 2 ? [leave] : [];
    const selected = selectLiveCommentary({ ...row, commentaryContext: { version: 1, valid: true, pinPattern } }, history, { scenarios });
    assert.equal(selected.scenario, expected);
    assert.equal(selected.text, text);
  }
  const proven = { ...leave, commentaryContext: { version: 1, valid: true, pinPattern: recurring } };
  const disabled = scenarios.map(s => ({ ...s, enabled: s.id !== 'live.leave.recurring' }));
  assert.equal(selectLiveCommentary(proven, [], { scenarios: disabled }).scenario, 'live.leave.single');
  assert.equal(selectLiveCommentary({ ...proven, commentaryContext: { ...proven.commentaryContext, valid: false } }, [], { scenarios }).scenario, 'live.leave.single');
});
