'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);

  const positionPanel = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const margin = 16;
    const width = Math.min(256, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
    if (rect.bottom + 190 > window.innerHeight && rect.top > window.innerHeight / 2) {
      setPanelPosition({ left, bottom: window.innerHeight - rect.top + 8, width });
    } else {
      setPanelPosition({ left, top: rect.bottom + 8, width });
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="info-tip-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) positionPanel(event.currentTarget);
          setOpen((value) => !value);
        }}
        onBlur={() => {
          setOpen(false);
          setPanelPosition(null);
        }}
        aria-label="Info"
      >
        i
      </button>
      {open && panelPosition && createPortal(
        <span className="info-tip-panel" style={{ left: panelPosition.left, top: panelPosition.top, bottom: panelPosition.bottom, width: panelPosition.width }}>
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
