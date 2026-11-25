export type LanePoint = { readonly left: number; readonly top: number };
export type LanePin = LanePoint & { readonly pin: number };

type LaneSize = { readonly width: number; readonly height: number };

/** Continue the visible final segment toward the rack, ending only at a pin known to have fallen. */
export function extendLanePath(
  points: readonly LanePoint[],
  pins: readonly LanePin[],
  fallenPins: readonly number[],
  size: LaneSize,
): { readonly points: readonly LanePoint[]; readonly impact: LanePoint | null } {
  if (points.length < 2 || size.width <= 0 || size.height <= 0) {
    return { points: [], impact: null };
  }

  const pixels = points.map(({ left, top }) => ({
    left: left * size.width / 100,
    top: top * size.height / 100,
  }));
  const end = pixels[pixels.length - 1];
  let previousIndex = pixels.length - 2;
  while (previousIndex >= 0 && Math.hypot(end.left - pixels[previousIndex].left, end.top - pixels[previousIndex].top) < 0.5) {
    previousIndex -= 1;
  }
  if (previousIndex < 0) return { points: pixels, impact: null };

  const previous = pixels[previousIndex];
  const segmentLength = Math.hypot(end.left - previous.left, end.top - previous.top);
  const directionX = (end.left - previous.left) / segmentLength;
  const directionY = (end.top - previous.top) / segmentLength;
  const edgeX = directionX > 0 ? size.width * 0.99 : size.width * 0.01;
  const edgeY = directionY > 0 ? size.height * 0.99 : size.height * 0.01;
  const edgeTravel = Math.min(
    directionX === 0 ? Infinity : (edgeX - end.left) / directionX,
    directionY === 0 ? Infinity : (edgeY - end.top) / directionY,
  );
  if (edgeTravel <= 0) return { points: pixels, impact: null };

  const fallen = new Set(fallenPins);
  const contactRadius = 16; // 18 px ball plus 14 px pin, measured from their centres
  let travel = edgeTravel;
  let impact: LanePoint | null = null;
  for (const pin of pins) {
    if (!fallen.has(pin.pin)) continue;
    const pinX = pin.left * size.width / 100 - end.left;
    const pinY = pin.top * size.height / 100 - end.top;
    const along = pinX * directionX + pinY * directionY;
    if (along < -contactRadius) continue;
    const missSquared = Math.max(0, pinX * pinX + pinY * pinY - along * along);
    if (missSquared > contactRadius * contactRadius) continue;
    if (along < 0 && pinX * pinX + pinY * pinY > contactRadius * contactRadius) continue;
    const firstContact = Math.max(0, along - Math.sqrt(contactRadius * contactRadius - missSquared));
    if (firstContact <= travel) {
      travel = firstContact;
      impact = { left: end.left + directionX * travel, top: end.top + directionY * travel };
    }
  }

  return {
    points: [...pixels, impact ?? { left: end.left + directionX * travel, top: end.top + directionY * travel }],
    impact,
  };
}
