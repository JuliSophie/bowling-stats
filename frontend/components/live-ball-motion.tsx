'use client';

import { useEffect, useRef, useState } from 'react';

import { extendLanePath, type LanePin, type LanePoint } from '@/lib/lane-trajectory';

/** Draw the measured trail and its pin-deck continuation in the same screen coordinates. */
export default function LiveBallMotion({
  points,
  pins,
  fallenPins,
  animated,
}: {
  readonly points: readonly LanePoint[];
  readonly pins: readonly LanePin[];
  readonly fallenPins: readonly number[];
  readonly animated: boolean;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(lane);
    return () => observer.disconnect();
  }, []);

  const { points: pixels, impact } = extendLanePath(points, pins, fallenPins, size);
  const length = pixels.reduce((distance, point, index) => {
    const previous = pixels[index - 1];
    return previous ? distance + Math.hypot(point.left - previous.left, point.top - previous.top) : distance;
  }, 0);
  const route = pixels.map(({ left, top }, index) =>
    `${index ? 'L' : 'M'} ${left.toFixed(2)} ${top.toFixed(2)}`,
  ).join(' ');
  const polyline = pixels.map(({ left, top }) => `${left},${top}`).join(' ');

  return (
    <>
      <div ref={laneRef} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
        {size.width > 0 && size.height > 0 && (
          <svg className="h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`}>
            <polyline
              className={animated ? 'live-path-reveal' : undefined}
              points={polyline}
              fill="none"
              stroke="var(--lane-path)"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={animated ? { strokeDasharray: length, strokeDashoffset: length } : undefined}
            />
          </svg>
        )}
        {impact && (
          <span
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg"
            style={{ left: impact.left, top: impact.top, borderColor: '#e11d48' }}
            title="Pins"
          />
        )}
      </div>
      {animated && size.width > 0 && size.height > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          <span className="live-rolling-ball" style={{ offsetPath: `path("${route}")` }} />
        </div>
      )}
    </>
  );
}
