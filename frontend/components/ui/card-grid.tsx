import type { ReactNode } from 'react';

export type CardGridColumns = 2 | 3 | 4 | 5 | 6;

// Responsive ramps per desktop column count. Static strings because Tailwind
// can't see dynamically built class names.
const COLUMN_CLASS: Record<CardGridColumns, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

// Denser ramps for compact cards (e.g. day stats): keep two-up on mobile.
const DENSE_COLUMN_CLASS: Record<CardGridColumns, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

function combine(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/** Responsive grid for laying out cards — replaces repeated inline grid classes. */
export default function CardGrid({
  cols = 3,
  dense = false,
  className,
  children,
}: {
  cols?: CardGridColumns;
  /** Use the denser ramp (two-up on mobile) for compact cards. */
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const columns = dense ? DENSE_COLUMN_CLASS[cols] : COLUMN_CLASS[cols];
  return <div className={combine('grid gap-4', columns, className)}>{children}</div>;
}
