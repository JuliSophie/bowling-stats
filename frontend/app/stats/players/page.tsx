'use client';

import Link from 'next/link';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import { useGames } from '@/lib/use-games';
import { derivePlayerSummaries } from '@/lib/player-stats';

function rankBadge(index: number) {
  if (index === 0) return { label: '1', icon: '🏆', className: 'bg-gradient-to-br from-amber-200 to-coral text-lane-950 shadow-[0_12px_30px_rgba(255,140,105,0.28)]' };
  if (index === 1) return { label: '2', icon: '🥈', className: 'bg-gradient-to-br from-slate-100 to-slate-300 text-lane-950' };
  if (index === 2) return { label: '3', icon: '🥉', className: 'bg-gradient-to-br from-orange-100 to-orange-300 text-lane-950' };
  return { label: String(index + 1), icon: null, className: 'bg-lane-100 text-lane-800' };
}

export default function PlayersListPage() {
  const { games, loading } = useGames();

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="soft-card p-6 text-sm text-lane-600">Lade Bestenliste...</div>
        </main>
      </>
    );
  }

  const players = derivePlayerSummaries(games);

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <div className="flex items-center gap-3">
          <BackButton className="back-button" />
          <h1 className="text-2xl font-bold text-lane-900">Bestenliste</h1>
          <span className="text-sm text-lane-600">({players.length})</span>
        </div>

        {players[0] && (
          <Link href={`/stats/players/${encodeURIComponent(players[0].name)}`} className="hero-card block overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-[0_28px_95px_rgba(0,0,0,0.34)] sm:p-8">
            <div className="relative z-10 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/75">Leaderboard</p>
                <h2 className="mt-3 text-4xl font-black tracking-tight text-white">{players[0].name} führt das Feld an</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-amber-50/70">
                  Sortiert nach Durchschnittsscore. Tippe auf einen Namen, um Verlauf, Bestwerte und Details zu sehen.
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 text-right backdrop-blur-xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-100/70">Top Ø Score</p>
                <p className="mt-2 text-5xl font-black text-white">{players[0].avgScore}</p>
                <p className="mt-1 text-sm font-semibold text-amber-50/70">{players[0].wins} Siege · Median {players[0].medianScore} · Offen {players[0].openFrameRate}%</p>
              </div>
            </div>
          </Link>
        )}

        <div className="soft-card overflow-hidden p-3 sm:p-4">
          {players.map((player, i) => {
            const playerGamesList = games.filter((g) => g.scores.some((s) => s.player_name === player.name))
              .slice().sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id).slice(0, 3);
            const badge = rankBadge(i);
            
            return (
              <Link key={player.name} href={`/stats/players/${encodeURIComponent(player.name)}`}
                className={`leaderboard-row group grid w-full gap-4 rounded-[1.5rem] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg sm:grid-cols-[auto_1fr_auto] sm:items-center ${i < players.length - 1 ? 'mb-2' : ''} ${i === 0 ? 'leaderboard-row-gold' : i < 3 ? 'leaderboard-row-podium' : ''}`}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-black ${badge.className}`}>
                  {badge.icon ?? badge.label}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-lane-950 group-hover:text-coral">{player.name}</h3>
                    <span className="rounded-full bg-lane-950 px-2.5 py-1 text-xs font-black text-white">#{i + 1}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-lane-500">
                    Zuletzt: {playerGamesList.map((g) => {
                      const s = g.scores.find((s) => s.player_name === player.name);
                      return `${s?.total_score ?? '–'} (${g.played_at})`;
                    }).join('  ·  ')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="leaderboard-chip">{player.gamesPlayed} Spiele</span>
                    <span className="leaderboard-chip">{player.wins} Siege</span>
                    <span className="leaderboard-chip">{player.totalPins} Pins gesamt</span>
                    <span className="leaderboard-chip">{player.openFrameRate}% offene Frames</span>
                    <span className="leaderboard-chip">zuletzt {player.lastPlayed}</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center sm:min-w-80">
                  <div className="leaderboard-metric">
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lane-500">Ø</p>
                    <p className="text-xl font-black text-lane-950">{player.avgScore}</p>
                  </div>
                  <div className="leaderboard-metric">
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lane-500">Median</p>
                    <p className="text-xl font-black text-lane-950">{player.medianScore}</p>
                  </div>
                  <div className="leaderboard-metric">
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lane-500">Max</p>
                    <p className="text-xl font-black text-lane-950">{player.maxScore}</p>
                  </div>
                  <div className="leaderboard-metric">
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lane-500">Offen</p>
                    <p className="text-xl font-black text-coral">{player.openFrameRate}%</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
