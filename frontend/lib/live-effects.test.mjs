import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyThrow, throwCellKey } from './live-effects.ts';

const throwEvent = (player, frame, throwNumber, pinsKnockedDown) => ({
  sessionId: 'test',
  capturedAt: new Date().toISOString(),
  player,
  frame,
  throw: throwNumber,
  pinsKnockedDown,
  isLikelyRatShot: false,
  lowConfidence: false,
  trajectory: [],
});

test('classifies spare and tenth-frame bonus throws', () => {
  const first = throwEvent('Anna', 10, 1, 7);
  assert.equal(classifyThrow(throwEvent('Anna', 10, 2, 3), [first]), 'spare');
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 10), [first]), 'strike');
});

test('only consecutive strikes become double/turkey', () => {
  const strike1 = throwEvent('Anna', 1, 1, 10);
  const strike2 = throwEvent('Anna', 2, 1, 10);
  const open = throwEvent('Anna', 3, 1, 8);
  assert.equal(classifyThrow(strike2, [strike1]), 'double');
  assert.equal(classifyThrow(throwEvent('Anna', 4, 1, 10), [strike1, strike2, open]), 'strike');
});

test('cell keys identify the thrower, not the next current player', () => {
  assert.notEqual(throwCellKey('Anna', 1, 1), throwCellKey('Ben', 1, 1));
});

test('tenth-frame third ball only completes a spare on the same rack', () => {
  const first = throwEvent('Anna', 10, 1, 10);
  const second = throwEvent('Anna', 10, 2, 7);
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 3), [first, second]), 'spare');
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 7), [
    throwEvent('Anna', 10, 1, 7), throwEvent('Anna', 10, 2, 3),
  ]), 'throw');
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 0), [
    first, throwEvent('Anna', 10, 2, 10),
  ]), 'throw');
});

test('ten pins after a miss are a spare, never a strike streak', () => {
  const miss = throwEvent('Anna', 9, 1, 0);
  const spare = throwEvent('Anna', 9, 2, 10);
  assert.equal(classifyThrow(spare, [miss]), 'spare');
  assert.equal(classifyThrow(throwEvent('Anna', 10, 1, 10), [miss, spare]), 'strike');
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 10), [
    throwEvent('Anna', 10, 1, 10), throwEvent('Anna', 10, 2, 0),
  ]), 'spare');
});

test('three strikes including bonus balls are a turkey across interleaved players', () => {
  const first = throwEvent('Anna', 10, 1, 10);
  const second = throwEvent('Anna', 10, 2, 10);
  assert.equal(classifyThrow(throwEvent('Anna', 10, 3, 10), [
    first, throwEvent('Ben', 10, 1, 7), second,
  ]), 'turkey');
});
