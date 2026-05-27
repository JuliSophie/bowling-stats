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
