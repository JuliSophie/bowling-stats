import assert from 'node:assert/strict';
import test from 'node:test';

import { extendLanePath } from './lane-trajectory.ts';

test('the deck extension keeps the last visible direction on desktop and mobile', () => {
  for (const { points, size } of [
    {
      points: [{ left: 45, top: 40 }, { left: 87.78, top: 12.5 }],
      size: { width: 1084, height: 196 },
    },
    {
      points: [{ left: 60, top: 55 }, { left: 25, top: 12.22 }],
      size: { width: 150, height: 440 },
    },
  ]) {
    const result = extendLanePath(points, [], [], size);
    const [previous, end, extended] = result.points;
    const cross = (end.left - previous.left) * (extended.top - end.top)
      - (end.top - previous.top) * (extended.left - end.left);
    assert.ok(Math.abs(cross) < 1e-8, 'the continuation must be collinear in screen pixels');
    assert.equal(result.impact, null);
    assert.ok(
      [size.width * 0.01, size.width * 0.99].some((edge) => Math.abs(extended.left - edge) < 1e-8)
      || [size.height * 0.01, size.height * 0.99].some((edge) => Math.abs(extended.top - edge) < 1e-8),
      'a missed throw continues until it leaves the visible deck',
    );
  }
});

test('a ball that passes a standing pin does not acquire a pin impact', () => {
  const result = extendLanePath(
    [{ left: 60, top: 50 }, { left: 88, top: 50 }],
    [{ pin: 4, left: 94, top: 50 }, { pin: 7, left: 94, top: 10 }],
    [7],
    { width: 1000, height: 200 },
  );

  assert.equal(result.impact, null);
  assert.equal(result.points.at(-1).left, 990);
});

test('the ball stops where it visibly touches a pin known to have fallen', () => {
  const pin = { pin: 4, left: 94, top: 50 };
  const result = extendLanePath(
    [{ left: 60, top: 50 }, { left: 88, top: 50 }],
    [pin],
    [4],
    { width: 1000, height: 200 },
  );

  assert.ok(result.impact);
  assert.ok(Math.abs(Math.hypot(result.impact.left - 940, result.impact.top - 100) - 16) < 1e-8);
  assert.deepEqual(result.points.at(-1), result.impact);
});
