'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { fetchGames } from '@/lib/api';
import type { GameRead } from '@/types';

type DashboardStats = {
  totalGames: number;
  totalPlayers: number;
  averageScore: number | null;
  highScore: { player: string; score: number; location: string; date: string; gameId: number } | null;
  lastGame: GameRead | null;
};

function buildDashboardStats(games: GameRead[]): DashboardStats {
  const players = new Set<string>();
  const allScores: number[] = [];
  let highScore: DashboardStats['highScore'] = null;

  for (const game of games) {
    for (const score of game.scores) {
      players.add(score.player_name);
      allScores.push(score.total_score);

      if (!highScore || score.total_score > highScore.score) {
        highScore = {
          player: score.player_name,
          score: score.total_score,
          location: game.location,
          date: game.played_at,
          gameId: game.id,
        };
      }
    }
  }

  const lastGame = games.length > 0
    ? [...games].sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id)[0]
    : null;

  return {
    totalGames: games.length,
    totalPlayers: players.size,
    averageScore: allScores.length ? Math.round((allScores.reduce((sum, score) => sum + score, 0) / allScores.length) * 10) / 10 : null,
    highScore,
    lastGame,
  };
}

function StatTile({ label, value, hint, href }: { label: string; value: string; hint: string; href: string }) {
  return (
    <Link href={href} className="group block rounded-3xl border p-4 shadow-inner subtle-surface transition hover:-translate-y-0.5 hover:shadow-lg">
      <p className="eyebrow">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-black text-lane-950">{value}</p>
        <span className="text-sm font-black text-coral opacity-75 transition group-hover:translate-x-0.5 group-hover:opacity-100">→</span>
      </div>
      <p className="mt-1 text-xs font-medium text-lane-600">{hint}</p>
    </Link>
  );
}

export default function HomeDashboard() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => buildDashboardStats(games), [games]);

  return (
    <div className="grid gap-4 md:grid-cols-[1.35fr_0.9fr]">
      <section className="hero-card overflow-hidden p-6 sm:p-8">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-amber-100/75">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
            OCR Score Tracking
          </div>

          <h1 className="mt-5 max-w-xl text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl">
            Bowling-Abende sauber erfassen.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-amber-50/72">
            Fotografiere den Score-Monitor, prüfe die OCR-Erkennung und verwandle jede Runde in verwertbare Spieler- und Tagesstatistiken.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/upload" className="primary-action justify-center">
              Scorecard hochladen
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/stats/games" className="secondary-action justify-center">
              Spiele ansehen
            </Link>
          </div>
        </div>
      </section>

      <aside className="soft-card grid gap-3 p-4">
        <StatTile
          label="Spiele"
          value={loading ? '…' : String(stats.totalGames)}
          hint="gespeicherte Runden"
          href="/stats/games"
        />
        <StatTile
          label="Ø Score"
          value={loading ? '…' : stats.averageScore?.toString() ?? '–'}
          hint="Bestenliste öffnen"
          href="/stats/players"
        />
        <StatTile
          label="Spieler"
          value={loading ? '…' : String(stats.totalPlayers)}
          hint="aktive Rangliste"
          href="/stats/players"
        />
        <StatTile
          label="Highscore"
          value={loading ? '…' : stats.highScore ? String(stats.highScore.score) : '–'}
          hint={stats.highScore ? `${stats.highScore.player} · ${stats.highScore.date}` : 'noch kein Spiel'}
          href={stats.highScore ? `/stats/games/${stats.highScore.gameId}` : '/stats/games'}
        />
      </aside>

      <section className="soft-card p-5 md:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Schnell weiter</p>
            <h2 className="mt-2 text-xl font-black text-lane-950">Nächster sinnvoller Schritt</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Link href="/upload" className="action-card">
            <span className="icon-badge bg-coral/20 text-coral">↥</span>
            <span className="font-bold text-lane-950">Upload</span>
            <span className="text-sm text-lane-600">Neues Bild auswerten</span>
          </Link>
          <Link href="/stats/games" className="action-card">
            <span className="icon-badge bg-aqua/25 text-lane-800">🎳</span>
            <span className="font-bold text-lane-950">Spiele</span>
            <span className="text-sm text-lane-600">Scorecards vergleichen</span>
          </Link>
          <Link href="/stats/players" className="action-card">
            <span className="icon-badge bg-mint/60 text-lane-800">★</span>
            <span className="font-bold text-lane-950">Bestenliste</span>
            <span className="text-sm text-lane-600">Ranglisten und Bestwerte</span>
          </Link>
        </div>

        {stats.lastGame && (
          <Link href={`/stats/games/${stats.lastGame.id}`} className="mt-4 block rounded-3xl border border-lane-200/70 bg-lane-50/80 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lg">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lane-500">Letztes Spiel</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-lane-950">{stats.lastGame.location}</p>
                <p className="text-sm text-lane-600">{stats.lastGame.played_at} · {stats.lastGame.scores.length} Spieler</p>
              </div>
              <span className="text-lane-400">→</span>
            </div>
          </Link>
        )}
      </section>
    </div>
  );
}
