import type { FrameType } from '@/lib/frame-utils';

export function PinDot({ cx, cy, payload, dataKey, stroke }: {
  cx?: number; cy?: number; payload?: Record<string, string | number>; dataKey?: string; stroke?: string;
}) {
  if (cx == null || cy == null || !payload || !dataKey) return null;
  const frameType = payload[`${dataKey}_type`] as FrameType | undefined;

  if (frameType === 'strike') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <ellipse cx={0} cy={2} rx={4} ry={3} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <ellipse cx={0} cy={-3} rx={2.8} ry={2.8} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <rect x={-1.2} y={-1} width={2.4} height={3} fill="#FFD700" rx={0.5} />
      </g>
    );
  }

  if (frameType === 'spare') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <ellipse cx={0} cy={2} rx={3.5} ry={2.5} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <ellipse cx={0} cy={-2.5} rx={2.4} ry={2.4} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <rect x={-1} y={-0.5} width={2} height={2.5} fill="#C0C0C0" rx={0.5} />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={4} fill={stroke} />;
}

export const PIN_LEGEND = (
  <div className="flex items-center gap-4 text-xs text-lane-600">
    <span className="flex items-center gap-1.5">
      <svg width="14" height="16" viewBox="-6 -7 12 14">
        <ellipse cx={0} cy={2} rx={4} ry={3} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <ellipse cx={0} cy={-3} rx={2.8} ry={2.8} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <rect x={-1.2} y={-1} width={2.4} height={3} fill="#FFD700" rx={0.5} />
      </svg>
      Strike
    </span>
    <span className="flex items-center gap-1.5">
      <svg width="14" height="16" viewBox="-6 -7 12 14">
        <ellipse cx={0} cy={2} rx={3.5} ry={2.5} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <ellipse cx={0} cy={-2.5} rx={2.4} ry={2.4} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <rect x={-1} y={-0.5} width={2} height={2.5} fill="#C0C0C0" rx={0.5} />
      </svg>
      Spare
    </span>
  </div>
);
