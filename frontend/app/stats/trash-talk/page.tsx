'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/navigation';
import { fetchTrashTalkBatches, fetchTrashTalkCatalog, fetchTrashTalkCoverage, type TrashTalkBatch, type TrashTalkCatalog } from '@/lib/api';

function candidateText(text: string, kind?: string) {
  if (text.length > 0) return text;
  return kind?.startsWith('legacy-') ? '(leerer Baustein)' : '(leerer Text)';
}

export default function TrashTalkHistoryPage() {
  const [catalog, setCatalog] = useState<TrashTalkCatalog | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<TrashTalkBatch[] | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setBatches(null);
    Promise.all([fetchTrashTalkCatalog(), fetchTrashTalkCoverage(), fetchTrashTalkBatches(50, offset)])
      .then(([current, coverage, history]) => {
        if (cancelled) return;
        setCatalog(current.catalog);
        setWarnings([...current.validation.errors, ...coverage.warnings]);
        setBatches(history.batches);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Katalog konnte nicht geladen werden.');
      });
    return () => { cancelled = true; };
  }, [offset]);

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-coral">Stats-Kontext</p>
            <h1 className="mt-1 text-3xl font-black text-lane-950 dark:text-white">Sprüche & Katalog</h1>
            <p className="mt-2 text-sm text-lane-600 dark:text-lane-300">Nur-Lese-Ansicht der aktiv verwendeten deutschen Inhalte.</p>
          </div>
          {catalog && <span className="rounded-full bg-lane-100 px-3 py-1 text-xs font-bold dark:bg-lane-800">v{catalog.version}</span>}
        </div>
        {error && <p className="rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm">{error}</p>}
        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Abdeckungs-Hinweise:</strong> {warnings.join(' · ')}
          </div>
        )}
        {catalog && (
          <details className="mt-4 rounded-lg border border-lane-200 dark:border-lane-700">
            <summary className="cursor-pointer list-none p-3 font-bold">
              Aktiver Katalog · {catalog.scenarios.length} Pools
              <span className="ml-2 text-xs font-normal text-lane-500">(öffnen zum Prüfen)</span>
            </summary>
            <section className="grid gap-3 border-t border-lane-200 p-3 sm:grid-cols-2 dark:border-lane-700">
              {catalog.scenarios.map((scenario) => (
                <article key={scenario.id} className="rounded-lg border border-lane-200 bg-lane-50 p-3 dark:border-lane-700 dark:bg-lane-900">
                  <div className="flex justify-between gap-3">
                    <h2 className="font-bold">{scenario.id}</h2>
                    <span className="text-xs text-lane-500">{scenario.templates.length} Varianten · {scenario.templateIds.length} IDs</span>
                  </div>
                  <p className="mt-2 text-sm text-lane-700 dark:text-lane-200">{scenario.templates[0]}</p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer">Alle Texte und IDs · {scenario.enabled ? 'aktiv' : 'deaktiviert'}</summary>
                    <ul className="mt-2 space-y-2">
                      {scenario.templates.map((text, index) => <li key={scenario.templateIds[index]}><code className="break-all">{scenario.templateIds[index]}</code><p>{text}</p></li>)}
                    </ul>
                  </details>
                </article>
              ))}
            </section>
          </details>
        )}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-black text-lane-900 dark:text-white">Generierungs-Historie</h2>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <button type="button" className="back-button disabled:opacity-40" disabled={offset === 0 || batches === null} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Neuere Batches</button>
            <span>Seite {offset / 50 + 1}</span>
            <button type="button" className="back-button disabled:opacity-40" disabled={!batches || batches.length < 50 || offset >= 1_000_000} onClick={() => setOffset((value) => value + 50)}>Ältere Batches</button>
          </div>
          {batches === null && !error && <p className="text-sm text-lane-500">Historie wird geladen …</p>}
          {batches?.length === 0 && <p className="rounded-lg border border-lane-200 bg-lane-50 p-3 text-sm text-lane-600 dark:border-lane-700 dark:bg-lane-900 dark:text-lane-300">Noch keine lokalen Generierungs-Batches.</p>}
          {batches && batches.length > 0 && (
            <div className="grid gap-3">
              {batches.map((batch) => (
                <article key={batch.id} className="rounded-lg border border-lane-200 bg-white p-3 dark:border-lane-700 dark:bg-lane-900">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-lane-500">
                    <span>{String(batch.candidates[0]?.scenario_id ?? 'Szenario unbekannt')}</span>
                    <span>{String(batch.created_at ?? batch.id)}</span>
                    <span>{String(batch.status ?? 'unbekannt')}</span>
                    <Link className="font-bold text-coral hover:underline" href={`/stats/trash-talk/batches/${encodeURIComponent(batch.id)}`}>Details</Link>
                  </div>
                  {(batch.cost || batch.usage) && <p className="mt-2 text-xs text-lane-500">{batch.cost ? `Kosten: ${JSON.stringify(batch.cost)}` : ''}{batch.usage ? ` · Nutzung: ${JSON.stringify(batch.usage)}` : ''}</p>}
                  {batch.error && <p className="mt-2 text-xs text-coral">{batch.error}</p>}
                  {batch.candidates?.map((candidate, index) => (
                    <div key={candidate.id ?? index} className="mt-2 text-sm">
                      <p>{candidateText(candidate.text, catalog?.scenarios.find((scenario) => scenario.id === candidate.scenario_id)?.kind)} <span className="text-xs text-lane-500">({candidate.id}) · {candidate.enabled ? 'aktiv' : 'inaktiv'}</span></p>
                      {candidate.errors.length > 0 && <p className="text-xs text-coral">{candidate.errors.join(' · ')}</p>}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
        {!catalog && !error && <p className="text-sm text-lane-500">Katalog wird geladen …</p>}
      </main>
    </>
  );
}
