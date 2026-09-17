import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingPins, presetAllowed, requestIsCurrent } from './playground-logic.mjs';

const session = (throws, frame = 1, currentThrow = throws.length + 1, players = 1) => ({
  playerCount: players, currentFrame: frame, currentThrow,
  currentPlayerIndex: 0, scoreboard: { players: [{ frames: Array.from({length: frame}, (_, index) => ({ throws: index === frame - 1 ? throws : [] })) }] },
});

test('remaining pins follows authoritative throw counts', () => {
  assert.equal(remainingPins(session([], 1, 1)), 10);
  assert.equal(remainingPins(session([7], 1, 2)), 3);
  assert.equal(remainingPins(session([0], 1, 2)), 10);
  assert.equal(remainingPins(session([10], 10, 2)), 10);
  assert.equal(remainingPins(session([10, 7], 10, 3)), 3);
  assert.equal(remainingPins(session([7, 3], 10, 3)), 10);
});

test('multi-step presets require a fresh one-player frame', () => {
  assert.equal(presetAllowed(session([], 1, 1, 1), 2), true);
  assert.equal(presetAllowed(session([], 1, 1, 2), 2), false);
  assert.equal(presetAllowed(session([], 10, 1, 1), 2), false);
  assert.equal(presetAllowed(session([], 10, 1, 2), 1), true);
});

test('stale session and operation responses cannot overwrite current state', () => {
  assert.equal(requestIsCurrent(1, 1, 4, 4, 'A', 'A'), true);
  assert.equal(requestIsCurrent(1, 2, 4, 4, 'A', 'B'), false);
  assert.equal(requestIsCurrent(1, 1, 4, 5, 'A', 'A'), false);
  assert.equal(requestIsCurrent(1, 1, 4, 4, 'A', 'B'), false);
});
