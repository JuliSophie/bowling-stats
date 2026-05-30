'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

function combine(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Standard frame for a Recharts chart: the `touch-action: pan-y` wrapper (so the
 * page still scrolls vertically over a chart on mobile) plus a full-width
 * ResponsiveContainer at a fixed height.
 */
export default function ChartFrame({
  height,
  children,
  className,
}: {
  height: number;
  children: ReactElement;
  className?: string;
}) {
  return (
    <div className={combine(className)} style={{ touchAction: 'pan-y' }}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
