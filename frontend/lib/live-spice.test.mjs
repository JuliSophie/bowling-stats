import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLiveCommentary } from './live-commentary.ts';

const event = (extra = {}) => ({
  throwId: 'current', player: 'Mara', playerIndex: 0, frame: 3, throw: 1,
  pinsKnockedDown: 6, ...extra,
});
const catalog = { scenarios: [
  { id: 'live.throw', templates: ['Wurf {pins}.'] },
  { id: 'live.throw.first.low', templates: ['{player}: {pins} weg, {remaining} stehen in Frame {frame}.'] },
  { id: 'live.throw.first.mid', templates: ['{player}: {pins} weg, {remaining} stehen in Frame {frame}.'] },
  { id: 'live.throw.first.high', templates: ['{player}: {pins} weg, {remaining} stehen in Frame {frame}.'] },
  { id: 'live.throw.first.below_usual', templates: ['Na ja, {player}: {pins}.'] },
  { id: 'live.throw.first.above_usual', templates: ['Immerhin, {player}: {pins}.'] },
  { id: 'live.open', templates: ['Offen.'] },
  { id: 'live.open.late', templates: ['Frame {frame} bleibt offen.'] },
  { id: 'live.strike', templates: ['Strike.'] },
  { id: 'live.strike.double', templates: ['DOUBLE für {player} in Frame {frame}.'] },
  { id: 'live.strike.turkey', templates: ['TURKEY für {player} in Frame {frame}.'] },
  { id: 'live.strike.turkey.opponent', templates: ['TURKEY für {player}. {opponent}, Frame {frame}.'] },
  { id: 'live.strike.streak', templates: ['{streak} Strikes für {player} in Frame {frame}.'] },
] };

test('first-ball count pools use the actual frame and remaining pins', () => {
  for (const [pins, scenario, remaining] of [
    [2, 'live.throw.first.low', 8],
    [6, 'live.throw.first.mid', 4],
    [8, 'live.throw.first.high', 2],
  ]) {
    const result = selectLiveCommentary(event({ pinsKnockedDown: pins }), [], catalog);
    assert.equal(result.scenario, scenario);
    assert.equal(result.text, `Mara: ${pins} weg, ${remaining} stehen in Frame 3.`);
  }
  const disabled = { scenarios: catalog.scenarios.map((item) => ({
    ...item, enabled: item.id !== 'live.throw.first.mid',
  })) };
  const fallback = selectLiveCommentary(event(), [], disabled);
  assert.equal(fallback.scenario, 'live.throw');
  assert.equal(fallback.text, 'Wurf 6.');
});

test('personal pace needs a valid current-game fact from at least three earlier first balls', () => {
  const context = (kind, priorFirstBallCount = 3, valid = true) => ({
    version: 1, valid, personalPace: { kind, priorFirstBallCount },
  });
  const below = selectLiveCommentary(event({ commentaryContext: context('below-usual') }), [], catalog);
  const above = selectLiveCommentary(event({ commentaryContext: context('above-usual') }), [], catalog);
  assert.equal(below.text, 'Na ja, Mara: 6.');
  assert.equal(above.text, 'Immerhin, Mara: 6.');
  assert.equal(selectLiveCommentary(event({ commentaryContext: context('below-usual', 2) }), [], catalog).scenario, 'live.throw.first.mid');
  assert.equal(selectLiveCommentary(event({ commentaryContext: context('above-usual', 3, false) }), [], catalog).scenario, 'live.throw.first.mid');
});

test('a late open frame gets a round-specific line without inventing a spare', () => {
  const first = event({ throwId: 'first', frame: 9, pinsKnockedDown: 3 });
  const second = event({ frame: 9, throw: 2, pinsKnockedDown: 2 });
  const selected = selectLiveCommentary(second, [first], catalog);
  assert.equal(selected.scenario, 'live.open.late');
  assert.equal(selected.text, 'Frame 9 bleibt offen.');
});

test('double, turkey, named opponent and longer streak follow only Mara across Tom', () => {
  const strike = (id, playerIndex, frame) => event({
    throwId: id, player: playerIndex === 0 ? 'Mara' : 'Tom',
    playerIndex, frame, throw: 1, pinsKnockedDown: 10,
  });
  const m1 = strike('m1', 0, 1);
  const t1 = strike('t1', 1, 1);
  const m2 = strike('m2', 0, 2);
  const t2 = strike('t2', 1, 2);
  assert.equal(selectLiveCommentary(m2, [m1, t1], catalog).text, 'DOUBLE für Mara in Frame 2.');
  const m3 = strike('m3', 0, 3);
  const history = [m1, t1, m2, t2];
  const named = { ...m3, commentaryContext: { version: 1, valid: true, opponentName: 'Tom' } };
  assert.equal(selectLiveCommentary(named, history, catalog).text, 'TURKEY für Mara. Tom, Frame 3.');
  assert.equal(selectLiveCommentary(named, [...history, named], catalog).scenario, 'live.strike.turkey.opponent');
  assert.equal(selectLiveCommentary({ ...named, commentaryContext: { version: 1, valid: true, opponentName: 'Mara' } }, history, catalog).scenario, 'live.strike.turkey');
  const m4 = strike('m4', 0, 4);
  assert.equal(selectLiveCommentary(m4, [...history, m3], catalog).text, '4 Strikes für Mara in Frame 4.');
});

test('tenth-frame bonus strikes can complete a Turkey', () => {
  const first = event({ throwId: 'first', frame: 10, throw: 1, pinsKnockedDown: 10 });
  const second = event({ throwId: 'second', frame: 10, throw: 2, pinsKnockedDown: 10 });
  const third = event({ frame: 10, throw: 3, pinsKnockedDown: 10 });
  assert.equal(selectLiveCommentary(third, [first, second], catalog).scenario, 'live.strike.turkey');
});
