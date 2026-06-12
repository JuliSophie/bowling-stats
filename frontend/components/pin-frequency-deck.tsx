'use client';

// Standard 10-pin triangle as the rack appears on the overhead display: the 7-8-9-10 back row at
// the top, the head pin (1) at the bottom. Positions are in a 100×104 viewBox.
const PIN_SPACING = 16;
const PIN_LAYOUT: { pin: number; x: number; y: number }[] = [
  { pin: 7, x: 50 - 1.5 * PIN_SPACING, y: 16 },
  { pin: 8, x: 50 - 0.5 * PIN_SPACING, y: 16 },
  { pin: 9, x: 50 + 0.5 * PIN_SPACING, y: 16 },
  { pin: 10, x: 50 + 1.5 * PIN_SPACING, y: 16 },
  { pin: 4, x: 50 - 1.0 * PIN_SPACING, y: 40 },
  { pin: 5, x: 50, y: 40 },
  { pin: 6, x: 50 + 1.0 * PIN_SPACING, y: 40 },
  { pin: 2, x: 50 - 0.5 * PIN_SPACING, y: 64 },
  { pin: 3, x: 50 + 0.5 * PIN_SPACING, y: 64 },
  { pin: 1, x: 50, y: 88 },
];

// Heatmap stops: red (rarely knocked down / disliked pin) → amber → green (reliably knocked down).
const HEAT_STOPS: { t: number; c: [number, number, number] }[] = [
  { t: 0, c: [220, 38, 38] },
  { t: 0.5, c: [245, 158, 11] },
  { t: 1, c: [22, 163, 74] },
];

function heatColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  let lo = HEAT_STOPS[0];
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (t >= HEAT_STOPS[i].t && t <= HEAT_STOPS[i + 1].t) {
      lo = HEAT_STOPS[i];
      hi = HEAT_STOPS[i + 1];
      break;
    }
  }
  const f = (t - lo.t) / (hi.t - lo.t || 1);
  const c = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Pin-deck heatmap: each pin is colored by its [rates] value (0..1) — cold red = low (rarely
 * knocked / a disliked pin), warm green = high. A null rate renders neutral (no data for that pin).
 * Read left vs right to spot a side preference; cold pins are the player's problem spots.
 */
export default function PinFrequencyHeatmap({ rates }: { rates: (number | null)[] }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 100 104" className="h-56 w-56" role="img" aria-label="Pin-Heatmap: Trefferquote je Pin">
        {PIN_LAYOUT.map(({ pin, x, y }) => {
          const rate = rates[pin - 1];
          return (
            <g key={pin}>
              <circle cx={x} cy={y} r={9.5} fill={rate == null ? 'var(--surface-soft)' : heatColor(rate)} stroke="#ffffff" strokeWidth={1} />
              <text x={x} y={y - 0.5} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[6px] font-black">
                {pin}
              </text>
              <text x={x} y={y + 4.5} textAnchor="middle" dominantBaseline="middle" className="fill-white/90 text-[4px] font-semibold">
                {rate == null ? '–' : `${Math.round(rate * 100)}%`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-2 text-[11px] font-semibold text-lane-600">
        <span>Selten getroffen</span>
        <span className="h-2.5 w-28 rounded-full" style={{ background: 'linear-gradient(to right, rgb(220,38,38), rgb(245,158,11), rgb(22,163,74))' }} />
        <span>Oft getroffen</span>
      </div>
    </div>
  );
}
