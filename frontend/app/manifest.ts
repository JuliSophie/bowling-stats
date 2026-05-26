import type { MetadataRoute } from 'next';


export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Bowling Scorecard OCR',
    short_name: 'Bowling Stats',
    description: 'OCR-Workflow und Bowling-Auswertung fuer schnelle Scorecard-Erfassung auf dem Homescreen.',
    start_url: '/',
    scope: '/',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4ede2',
    theme_color: '#eadcc5',
    lang: 'de-DE',
    prefer_related_applications: false,
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
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