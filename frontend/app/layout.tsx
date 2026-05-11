import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';


export const metadata: Metadata = {
  title: {
    default: 'Bowling Stats',
    template: '%s | Bowling Stats',
  },
  applicationName: 'Bowling Stats',
  description: 'Mobile-first OCR-Workflow und Statistik-Dashboard für Bowling-Runden.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Bowling Scorecard',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon',
  },
};


export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
