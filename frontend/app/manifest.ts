import type { MetadataRoute } from 'next';


export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bowling Scorecard OCR',
    short_name: 'Bowling Stats',
    description: 'OCR-Workflow und Bowling-Auswertung fuer schnelle Scorecard-Erfassung auf dem Homescreen.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4ede2',
    theme_color: '#eadcc5',
    lang: 'de-DE',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}