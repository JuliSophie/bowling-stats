'use client';

import { useState, type ReactNode } from 'react';

export type SectionCardPadding = 'none' | 'md' | 'lg';

export type SectionCardProps = {
  /** Section heading (rendered as an h2). */
  title?: ReactNode;
  /** Optional line under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header content (e.g. a count badge or action button). Ignored when collapsible. */
  action?: ReactNode;
  children: ReactNode;
  padding?: SectionCardPadding;
  className?: string;
  /** Turn the header into a toggle that shows/hides the content. */
  collapsible?: boolean;
  /** Controlled open state (use with onToggle). Falls back to internal state when undefined. */
  open?: boolean;
  onToggle?: () => void;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
};

const PADDING_CLASS: Record<SectionCardPadding, string> = {
  none: '',
  md: 'p-4',
  lg: 'p-5',
};

// Body padding for collapsible cards: the header button already carries the top
// padding, so the revealed content only needs horizontal + bottom padding.
const BODY_PADDING_CLASS: Record<SectionCardPadding, string> = {
  none: '',
  md: 'px-4 pb-4',
  lg: 'px-5 pb-5',
};

function combine(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/** The large rounded panel used to group content across the app. */
export default function SectionCard({
  title,
  subtitle,
  action,
  children,
  padding = 'lg',
  className,
  collapsible = false,
  open,
  onToggle,
  defaultOpen = true,
}: SectionCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internalOpen;

  const handleToggle = () => {
    if (open === undefined) setInternalOpen((value) => !value);
    onToggle?.();
  };

  if (collapsible) {
    return (
      <section className={combine('section-card overflow-hidden', className)}>
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          className={combine('flex w-full cursor-pointer items-start justify-between gap-4 text-left transition', PADDING_CLASS[padding])}
        >
          <div className="min-w-0">
            {title != null && <h2 className="text-lg font-semibold text-lane-800">{title}</h2>}
            {subtitle != null && <p className="mt-1 text-sm text-lane-600">{subtitle}</p>}
          </div>
          <span className={combine('mt-1 shrink-0 text-sm font-bold text-lane-500 transition', isOpen && 'rotate-180')}>⌄</span>
        </button>
        {isOpen && <div className={BODY_PADDING_CLASS[padding]}>{children}</div>}
      </section>
    );
  }

  const hasHeader = title != null || subtitle != null || action != null;

  return (
    <section className={combine('section-card', PADDING_CLASS[padding], className)}>
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title != null && <h2 className="text-lg font-semibold text-lane-800">{title}</h2>}
            {subtitle != null && <p className="mt-1 text-sm text-lane-600">{subtitle}</p>}
          </div>
          {action != null && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
