'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navigation from '@/components/navigation';
import { fetchTrashTalkBatch, type TrashTalkBatch } from '@/lib/api';

function candidateText(text: string, scenarioId: string) {
  if (text.length > 0) return text;
  return scenarioId.startsWith('legacy.') ? '(leerer Baustein)' : '(leerer Text)';
}

export default function TrashTalkBatchDetailPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<TrashTalkBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!params.id) return;
    fetchTrashTalkBatch(params.id).then(setBatch).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Batch konnte nicht geladen werden.'));
  }, [params.id]);
  return <><Navigation /><main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6">
    <Link href="/stats/trash-talk" className="text-sm font-bold text-coral hover:underline">← Zur Historie</Link>
    <h1 className="mt-4 text-2xl font-black text-lane-950 dark:text-white">Generierungs-Batch</h1>
    {error && <p className="mt-4 rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm">{error}</p>}
    {!batch && !error && <p className="mt-4 text-sm text-lane-500">Batch wird geladen …</p>}
    {batch && <article className="mt-4 rounded-lg border border-lane-200 bg-white p-4 dark:border-lane-700 dark:bg-lane-900">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="font-bold">ID</dt><dd>{batch.id}</dd></div>
        <div><dt className="font-bold">Status</dt><dd>{batch.status}</dd></div>
        <div><dt className="font-bold">Quelle</dt><dd>{batch.source ?? '–'}</dd></div>
        <div><dt className="font-bold">Erstellt</dt><dd>{batch.created_at}</dd></div>
      </dl>
      {batch.error && <p className="mt-3 text-sm text-coral">{batch.error}</p>}
      <h2 className="mt-6 font-bold">Kandidaten</h2>
      <div className="mt-2 grid gap-3">{batch.candidates.map((candidate) => <div key={candidate.id} className="rounded border border-lane-200 p-3 text-sm">
        <p className="font-bold">{candidate.scenario_id} · {candidate.id}</p>
        <p className="mt-1">{candidateText(candidate.text, candidate.scenario_id)}</p>
        <p className="mt-1 text-xs text-lane-500">{candidate.enabled ? 'Aktiv' : 'Deaktiviert'}{candidate.errors.length ? ` · ${candidate.errors.join(' · ')}` : ''}</p>
      </div>)}</div>
    </article>}
  </main></>;
}
