'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PIN_LAYOUT = [
  { pin: 7, row: 0, offset: -1.5 },
  { pin: 8, row: 0, offset: -0.5 },
  { pin: 9, row: 0, offset: 0.5 },
  { pin: 10, row: 0, offset: 1.5 },
  { pin: 4, row: 1, offset: -1 },
  { pin: 5, row: 1, offset: 0 },
  { pin: 6, row: 1, offset: 1 },
  { pin: 2, row: 2, offset: -0.5 },
  { pin: 3, row: 2, offset: 0.5 },
  { pin: 1, row: 3, offset: 0 },
];

const PIN_CENTER_SPACING_IN = 12;
const LANE_WIDTH_IN = 41.5;
const PIN_SPACING_PCT = (PIN_CENTER_SPACING_IN / LANE_WIDTH_IN) * 100;

function pinDeckPosition(pin: (typeof PIN_LAYOUT)[number]) {
  return {
    x: 50 + pin.offset * PIN_SPACING_PCT,
    y: 19 + pin.row * 23,
  };
}

export default function SplitPatternPopover({
  standingPins,
  converted,
}: {
  standingPins: number[];
  converted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const standing = new Set(standingPins);

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.min(rect.left, window.innerWidth - 130),
      top: rect.bottom + 6,
    });
  };

  const toggleOpen = () => {
    updatePosition();
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="absolute inset-0 z-20 text-coral"
        aria-expanded={open}
        aria-label="Split-Muster anzeigen"
      >
        <span className="absolute right-0 top-0 px-0.5 text-[0.55rem] font-black leading-none">S</span>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} role="presentation">
              <div
                className="z-[9999] w-32 rounded-xl border p-2 text-left shadow-xl"
                onClick={(event) => event.stopPropagation()}
                style={{
                  position: 'fixed',
                  left: position.left,
                  top: position.top,
                  color: 'var(--foreground)',
                  background: 'var(--popover-bg, var(--surface-strong))',
                  borderColor: 'var(--border)',
                }}
              >
                <span className="mb-1 block text-[0.58rem] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
                  Split {converted ? 'geräumt' : 'offen'}
                </span>
                <span className="relative block h-20 rounded-lg border border-lane-200 bg-[var(--lane-deck)]">
                  {PIN_LAYOUT.map((pin) => {
                    const { x, y } = pinDeckPosition(pin);
                    const isStanding = standing.has(pin.pin);
                    return (
                      <span
                        key={pin.pin}
                        className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                          isStanding
                            ? 'border-2 border-[var(--split-pin-color)] bg-[var(--split-pin-color)] shadow'
                            : 'border-2 border-[var(--split-pin-color)] bg-transparent opacity-95 shadow'
                        }`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                      />
                    );
                  })}
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
