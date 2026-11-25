import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyThrow, strikeStreakLength, throwCellKey } from './live-effects.ts';

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

test('streak length counts this bowler across other players and stops at an open frame', () => {
  const strike = (frame) => ({ ...throwEvent('Alex', frame, 1, 10), playerIndex: 0 });
  const rival = { ...throwEvent('Alex', 1, 1, 10), playerIndex: 1 };
  assert.equal(strikeStreakLength(strike(4), [strike(1), rival, strike(2), strike(3)]), 4);
  assert.equal(strikeStreakLength(strike(4), [strike(1), strike(2), { ...throwEvent('Alex', 3, 1, 8), playerIndex: 0 }]), 1);
  assert.equal(strikeStreakLength({ ...throwEvent('Alex', 1, 2, 10), playerIndex: 0 }, [
    { ...throwEvent('Alex', 1, 1, 0), playerIndex: 0 },
  ]), 0);
});

test('same-named roster slots do not share strikes or spares', () => {
  const first = { ...throwEvent('Alex', 1, 1, 10), playerIndex: 0 };
  const other = { ...throwEvent('Alex', 1, 1, 10), playerIndex: 1 };
  assert.equal(classifyThrow(other, [first]), 'strike');
  assert.equal(classifyThrow({ ...throwEvent('Alex', 2, 1, 10), playerIndex: 0 }, [first, other]), 'double');
  const prior = { ...throwEvent('Alex', 3, 1, 9), playerIndex: 0 };
  assert.equal(classifyThrow({ ...throwEvent('Alex', 3, 2, 1), playerIndex: 1 }, [prior]), 'throw');
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
