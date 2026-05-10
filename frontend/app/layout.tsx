import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';


export const metadata: Metadata = {
  title: 'Bowling Stats',
  description: 'Mobile-first OCR-Workflow und Statistik-Dashboard für Bowling-Runden.',
};


export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
