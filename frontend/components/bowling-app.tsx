'use client';

import { startTransition, useEffect, useState } from 'react';

import { fetchStats, saveGame, uploadScorecard } from '@/lib/api';
import StatsDashboard from '@/components/stats-dashboard';
import type { DetectedScore, GameDraft, StatsResponse, UploadResult } from '@/types';


function todayIsoString() {
  return new Date().toISOString().split('T')[0];
}


function emptyDraft(): GameDraft {
  return {
    played_at: todayIsoString(),
    location: 'Squash-House',
    mode: '10-Pin',
    scores: [],
  };
}


export default function BowlingApp() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [draft, setDraft] = useState<GameDraft>(emptyDraft);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  async function refreshStats() {
    setStatsLoading(true);
    try {
      const data = await fetchStats();
      startTransition(() => {
        setStats(data);
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Statistiken konnten nicht geladen werden.');
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    void refreshStats();
  }, []);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    setStatusMessage('OCR läuft...');

    try {
      const result = await uploadScorecard(file);
      setUploadResult(result);
      setDraft((current) => ({
        ...current,
        scores: result.detected_scores.length
          ? result.detected_scores
          : [{ player_name: '', total_score: 0, frames: [] }],
      }));
      setStatusMessage('OCR-Entwurf geladen. Bitte Namen und Scores kontrollieren.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function updateScore(index: number, patch: Partial<DetectedScore>) {
    setDraft((current) => ({
      ...current,
      scores: current.scores.map((score, scoreIndex) => (scoreIndex === index ? { ...score, ...patch } : score)),
    }));
  }

  function addScoreRow() {
    setDraft((current) => ({
      ...current,
      scores: [...current.scores, { player_name: '', total_score: 0, frames: [] }],
    }));
  }

  async function handleSave() {
    if (!draft.scores.length) {
      setStatusMessage('Bitte zuerst OCR-Daten laden oder mindestens einen Score erfassen.');
      return;
    }

    setSaving(true);
    setStatusMessage('Spiel wird gespeichert...');

    try {
      await saveGame(draft);
      setUploadResult(null);
      setDraft(emptyDraft());
      setStatusMessage('Spiel gespeichert. Dashboard wird aktualisiert.');
      await refreshStats();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="panel overflow-hidden rounded-[2.4rem] border border-lane-200/60 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.36em] text-lane-500">bowling.sophiealexandra.de</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-lane-900 sm:text-5xl">
              Bowling-Runden vom Monitorfoto direkt ins Statistik-Dashboard.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-lane-700 sm:text-lg">
              Mobile-first Upload, OCR-Prüfung vor dem Speichern und ein Dashboard mit Verlauf, Durchschnitt und Hall of Fame.
            </p>
          </div>
          <div className="grid gap-3 rounded-[2rem] bg-[rgba(41,24,9,0.92)] p-5 text-white">
            <span className="text-xs uppercase tracking-[0.3em] text-lane-200">Workflow</span>
            <div className="grid gap-2 text-sm text-lane-50/90 sm:grid-cols-3 sm:text-base">
              <div className="rounded-2xl bg-white/10 p-3">1. Foto hochladen</div>
              <div className="rounded-2xl bg-white/10 p-3">2. OCR prüfen</div>
              <div className="rounded-2xl bg-white/10 p-3">3. Spiel speichern</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="panel rounded-[2rem] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-lane-500">OCR Upload</p>
              <h2 className="mt-2 text-2xl font-semibold text-lane-800">Scorecard einlesen</h2>
            </div>
            <span className="rounded-full bg-mint px-3 py-1 text-sm font-medium text-lane-800">
              {uploading ? 'Verarbeite...' : 'Bereit'}
            </span>
          </div>

          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-lane-300 bg-white/50 px-4 py-10 text-center transition hover:border-lane-500 hover:bg-white/70">
            <span className="text-lg font-medium text-lane-800">Bild auswählen</span>
            <span className="mt-2 text-sm text-lane-600">PNG oder JPG direkt vom Bowling-Monitor</span>
            <input className="hidden" type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} />
          </label>

          <div className="mt-5 rounded-[1.5rem] bg-white/60 p-4 text-sm text-lane-700">
            <p className="font-medium text-lane-800">Hinweis</p>
            <p className="mt-2">Uploads werden nur für die OCR-Verarbeitung verwendet und in der Zielarchitektur nicht dauerhaft gespeichert.</p>
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-[1.3rem] border border-lane-200 bg-lane-50 px-4 py-3 text-sm text-lane-700">
              {statusMessage}
            </div>
          ) : null}

          {uploadResult?.warnings.length ? (
            <ul className="mt-4 grid gap-2">
              {uploadResult.warnings.map((warning) => (
                <li key={warning} className="rounded-[1.2rem] border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-lane-800">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {uploadResult ? (
            <div className="mt-5 rounded-[1.5rem] bg-[rgba(255,255,255,0.74)] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-lane-500">OCR Rohtext</p>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-[1.2rem] bg-lane-900 px-4 py-3 text-sm text-lane-50">
                {uploadResult.raw_text || 'Kein Rohtext erkannt.'}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="panel rounded-[2rem] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Verification</p>
              <h2 className="mt-2 text-2xl font-semibold text-lane-800">Erkannten Spielstand bestätigen</h2>
            </div>
            <button
              className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700"
              onClick={addScoreRow}
              type="button"
            >
              Spieler hinzufügen
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-lane-700">
              Datum
              <input
                className="rounded-2xl border border-lane-200 bg-white/70 px-4 py-3"
                type="date"
                value={draft.played_at}
                onChange={(event) => setDraft((current) => ({ ...current, played_at: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm text-lane-700">
              Modus
              <input
                className="rounded-2xl border border-lane-200 bg-white/70 px-4 py-3"
                value={draft.mode}
                onChange={(event) => setDraft((current) => ({ ...current, mode: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm text-lane-700 sm:col-span-2">
              Ort
              <input
                className="rounded-2xl border border-lane-200 bg-white/70 px-4 py-3"
                value={draft.location}
                onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
              />
            </label>
          </div>

          <div className="mt-6 grid gap-3">
            {draft.scores.map((score, index) => (
              <div key={`${index}-${score.player_name}`} className="rounded-[1.5rem] border border-lane-200 bg-white/70 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                  <label className="grid gap-2 text-sm text-lane-700">
                    Spielername
                    <input
                      className="rounded-2xl border border-lane-200 bg-white px-4 py-3"
                      value={score.player_name}
                      onChange={(event) => updateScore(index, { player_name: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-lane-700">
                    Score
                    <input
                      className="rounded-2xl border border-lane-200 bg-white px-4 py-3"
                      type="number"
                      min={0}
                      max={300}
                      value={score.total_score}
                      onChange={(event) => updateScore(index, { total_score: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-coral px-5 py-3 text-sm font-semibold text-lane-900 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSave}
              type="button"
              disabled={saving}
            >
              {saving ? 'Speichere...' : 'Spiel speichern'}
            </button>
            <span className="text-sm text-lane-600">Speichert erst nach manueller Bestätigung.</span>
          </div>
        </div>
      </section>

      <StatsDashboard data={stats} loading={statsLoading} />
    </main>
  );
}