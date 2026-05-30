import type { ReactNode } from 'react';

import SectionCard, { type SectionCardProps } from '@/components/ui/section-card';
import CardGrid, { type CardGridColumns } from '@/components/ui/card-grid';

export type StatSectionProps = Omit<SectionCardProps, 'children'> & {
  /** Desktop column count for the card grid. */
  cols?: CardGridColumns;
  /** Use the denser grid ramp (two-up on mobile) for compact cards. */
  dense?: boolean;
  gridClassName?: string;
  children: ReactNode;
};

/** A titled panel whose body is a responsive grid of cards — SectionCard + CardGrid. */
export default function StatSection({ cols = 4, dense = false, gridClassName, children, ...section }: StatSectionProps) {
  return (
    <SectionCard {...section}>
      <CardGrid cols={cols} dense={dense} className={gridClassName}>
        {children}
      </CardGrid>
    </SectionCard>
  );
}
