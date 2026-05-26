import Link from 'next/link';
import HomeDashboard from '@/components/home-dashboard';
import Navigation from '@/components/navigation';

export const metadata = {
  title: 'Home',
};

export default function HomePage() {
  const workflowSteps = [
    { label: 'Foto aufnehmen', href: '/upload' },
    { label: 'Monitor wählen', href: '/upload' },
    { label: 'Tabelle prüfen', href: '/upload' },
    { label: 'OCR kontrollieren', href: '/upload' },
    { label: 'Spiel speichern', href: '/stats/games' },
  ];

  return (
    <>
      <Navigation />
      <main className="app-main">
        <HomeDashboard />

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <Link
          href="/upload"
          className="group action-card min-h-56 justify-between"
        >
          <div>
            <div className="icon-badge bg-coral/20 text-coral transition group-hover:bg-coral/30">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-lane-950">Upload</h2>
            <p className="mt-2 text-sm leading-6 text-lane-700">
              Lade ein Bild von deinem Bowling-Scorecard-Monitor hoch und lasse den OCR automatisch die Ergebnisse extrahieren.
            </p>
          </div>
          <span className="inline-flex items-center text-sm font-black text-coral transition group-hover:text-lane-900">
            Zum Upload →
          </span>
        </Link>

        <Link
          href="/stats/players"
          className="group action-card min-h-56 justify-between"
        >
          <div>
            <div className="icon-badge bg-aqua/25 text-lane-800 transition group-hover:bg-aqua/40">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-lane-950">Bestenliste</h2>
            <p className="mt-2 text-sm leading-6 text-lane-700">
              Vergleiche Durchschnitt, Highscores und Gesamtpins aller Spieler in einer Rangliste.
            </p>
          </div>
          <span className="inline-flex items-center text-sm font-black text-coral transition group-hover:text-lane-900">
            Zur Bestenliste →
          </span>
        </Link>
      </div>

      <section className="soft-card p-6 text-sm text-lane-700">
        <p className="eyebrow">Workflow</p>
        <h3 className="mt-2 text-xl font-black text-lane-950">Vom Foto zur Analyse</h3>
        <ol className="mt-4 grid gap-3 sm:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <li key={step.label}>
              <Link href={step.href} className="group block rounded-2xl bg-lane-50/80 p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                <span className="text-xs font-black text-coral">0{index + 1}</span>
                <span className="mt-1 block font-bold text-lane-900">{step.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
    </>
  );
}
