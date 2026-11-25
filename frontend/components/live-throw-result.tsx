import type { ThrowAnalysis } from '@/types';
import type { ThrowEffectKind } from '@/lib/live-effects';

export const THROW_TRAVEL_MS = 900;
export const THROW_EFFECT_DURATION: Record<ThrowEffectKind, number> = {
  throw: 3000,
  spare: 4000,
  strike: 4000,
  double: 5000,
  turkey: 5000,
};

export type ActiveThrowEffect = {
  readonly key: string;
  readonly event: ThrowAnalysis;
  readonly kind: ThrowEffectKind;
};

const EFFECT_CLASS: Record<ThrowEffectKind, string> = {
  throw: 'live-effect-throw',
  spare: 'live-effect-spare',
  strike: 'live-effect-strike',
  double: 'live-effect-double',
  turkey: 'live-effect-turkey',
};
const RESULT_CLASS = {
  zero: 'live-result-zero',
  low: 'live-result-low',
  medium: 'live-result-medium',
  high: 'live-result-high',
  unknown: '',
} as const;

export default function LiveThrowResult({ effect }: { readonly effect: ActiveThrowEffect }) {
  const { event, kind } = effect;
  const pins = event.pinsKnockedDown;
  const travel = event.path && event.path.length >= 2 ? THROW_TRAVEL_MS : 0;
  const variant = pins === 0 ? 'zero' : pins == null ? 'unknown' : pins <= 3 ? 'low' : pins <= 6 ? 'medium' : 'high';

  return (
    <div
      className={`live-effect-banner ${EFFECT_CLASS[kind]} live-effect-${variant}`}
      style={{
        animationDuration: '1000ms, 600ms',
        animationDelay: `${travel}ms, ${THROW_EFFECT_DURATION[kind] - 600}ms`,
      }}
    >
      <div className="live-effect-breath" style={{ animationDelay: `${travel + 800}ms` }}>
        {kind !== 'throw' && (
          <svg className="live-effect-crown" viewBox="0 0 120 84" aria-hidden="true">
            {[{ x: 22, y: 24 }, { x: 60, y: 12 }, { x: 98, y: 24 }].map(({ x, y }) => (
              <polygon
                key={x}
                className="live-effect-star"
                transform={`translate(${x} ${y})`}
                points="0,-9 2.6,-3.1 9,-2.8 4.2,1.5 5.6,8 0,4.6 -5.6,8 -4.2,1.5 -9,-2.8 -2.6,-3.1"
              />
            ))}
            <path d="M12 40 33 54 60 28 87 54 108 40 99 71H21Z" />
            <path d="M22 77H98V82H22Z" />
          </svg>
        )}
        <span
          className={`live-effect-result ${kind === 'throw' ? RESULT_CLASS[variant] : ''}`}
          style={{ animationDelay: `${travel}ms` }}
          aria-label={kind === 'throw'
            ? pins === 0 ? 'Kein Pin' : pins === 1 ? '1 Pin' : pins == null ? 'Pins unbekannt' : `${pins} Pins`
            : undefined}
        >
          {kind === 'throw' ? pins ?? '–' : `${kind.toUpperCase()}!`}
        </span>
        <strong className="live-effect-player">{event.player}</strong>
      </div>
    </div>
  );
}
