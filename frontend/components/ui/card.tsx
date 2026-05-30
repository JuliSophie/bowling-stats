'use client';

import Link from 'next/link';
import type { KeyboardEvent, MouseEventHandler, ReactNode } from 'react';

import InfoTip from '@/components/ui/info-tip';

export type CardTone = 'default' | 'winner' | 'good' | 'warn' | 'info';
export type CardPadding = 'sm' | 'md' | 'lg';
export type CardHeaderSize = 'md' | 'lg' | 'xl';

export type CardProps = {
  /** Small muted label above the header (e.g. "Größter Vorsprung", "Letztes Spiel"). */
  title?: ReactNode;
  /** Render the title in uppercase eyebrow style. */
  eyebrow?: boolean;
  /** Prominent heading / value (e.g. "45 Pins", "Squash House"). */
  header?: ReactNode;
  headerSize?: CardHeaderSize;
  /** Secondary line under the header. */
  subtext?: ReactNode;
  /** Arbitrary body: tables, lists, benchmark bars, etc. (alias of children). */
  content?: ReactNode;
  children?: ReactNode;
  /** Sassy one-liner, rendered as muted detail text at the bottom. */
  trashTalk?: ReactNode;
  /** Info tooltip text — shows the "i" button top-right. */
  info?: string;
  /** Color theme. */
  tone?: CardTone;
  /** Leading element, e.g. an icon badge. */
  icon?: ReactNode;
  /** Right-aligned, vertically-centered element (e.g. a "→" arrow). */
  trailing?: ReactNode;
  /** Makes the whole card a link. */
  href?: string;
  /** Makes the whole card clickable (ignored when href is set). */
  onClick?: MouseEventHandler<HTMLDivElement>;
  padding?: CardPadding;
  className?: string;
};

const PADDING_CLASS: Record<CardPadding, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const TONE_CLASS: Record<CardTone, string> = {
  default: '',
  winner: 'app-card--winner',
  good: 'app-card--good',
  warn: 'app-card--warn',
  info: 'app-card--info',
};

const HEADER_CLASS: Record<CardHeaderSize, string> = {
  md: 'text-lg font-bold text-lane-900',
  lg: 'text-xl font-black text-lane-900',
  xl: 'text-2xl font-black text-lane-900',
};

function combine(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function Card({
  title,
  eyebrow = false,
  header,
  headerSize = 'md',
  subtext,
  content,
  children,
  trashTalk,
  info,
  tone = 'default',
  icon,
  trailing,
  href,
  onClick,
  padding = 'md',
  className,
}: CardProps) {
  const body = content ?? children;
  const interactive = Boolean(href || onClick);

  const cardClass = combine(
    'app-card',
    PADDING_CLASS[padding],
    TONE_CLASS[tone],
    interactive && 'app-card--interactive',
    className,
  );

  const titleClass = eyebrow
    ? 'text-xs font-bold uppercase tracking-[0.18em] text-lane-500'
    : 'text-xs font-semibold text-lane-500';

  const main = (
    <>
      {icon && <div className="mb-2">{icon}</div>}

      {(title || (info && !trailing)) && (
        <div className="flex items-start justify-between gap-2">
          {title ? <p className={titleClass}>{title}</p> : <span />}
          {info && !trailing && <InfoTip text={info} />}
        </div>
      )}

      {header != null && header !== '' && <div className={combine(HEADER_CLASS[headerSize], title ? 'mt-1' : undefined)}>{header}</div>}
      {subtext != null && subtext !== '' && <p className="mt-1 text-xs text-lane-500">{subtext}</p>}
      {body && <div className={combine(header != null || title ? 'mt-2' : undefined)}>{body}</div>}
      {trashTalk && <p className="mt-2 text-xs font-semibold leading-relaxed text-lane-500">{trashTalk}</p>}
    </>
  );

  // When there is a trailing element (or info alongside one), lay the card out
  // as [main | trailing/info] so the right rail is vertically centered.
  const inner = trailing || (info && trailing) ? (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">{main}</div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        {info && <InfoTip text={info} />}
        {trailing}
      </div>
    </div>
  ) : (
    main
  );

  if (href) {
    return (
      <Link href={href} className={combine('block', cardClass)}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick(event as unknown as Parameters<MouseEventHandler<HTMLDivElement>>[0]);
      }
    };
    return (
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKey} className={cardClass}>
        {inner}
      </div>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}
