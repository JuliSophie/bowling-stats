'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { fetchGames, renamePlayer } from '@/lib/api';
import type { GameRead, FrameData } from '@/types';
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type PlayerSummary = {
  name: string;
  gamesPlayed: number;
  avgScore: number;
  medianScore: number;
  maxScore: number;
  lastPlayed: string;
  openFrameRate: number;
};

function isOpenFrame(frame: FrameData) {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 !== 'x' && throw2 !== 'x' && throw2 !== '/';
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function signedDelta(value: number) {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : String(value);
}

function derivePlayerSummaries(games: GameRead[]): PlayerSummary[] {
  const map = new Map<string, { scores: number[]; lastPlayed: string; openFrames: number; totalFrames: number }>();
  for (const game of games) {
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { scores: [], lastPlayed: game.played_at, openFrames: 0, totalFrames: 0 };
      entry.scores.push(score.total_score);
      entry.openFrames += score.frames.filter(isOpenFrame).length;
      entry.totalFrames += score.frames.length;
      if (game.played_at > entry.lastPlayed) entry.lastPlayed = game.played_at;
      map.set(score.player_name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, { scores, lastPlayed, openFrames, totalFrames }]) => ({
      name,
      gamesPlayed: scores.length,
      avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      medianScore: Math.round(median(scores) * 10) / 10,
      maxScore: Math.max(...scores),
      lastPlayed,
      openFrameRate: totalFrames > 0 ? Math.round((openFrames / totalFrames) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

function getPlayerGames(games: GameRead[], playerName: string): GameRead[] {
  return games.filter((g) => g.scores.some((s) => s.player_name === playerName));
}

function buildPlayerTrendData(games: GameRead[], playerName: string): Record<string, string | number>[] {
  return getPlayerGames(games, playerName)
    .slice()
    .sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id)
    .map((game, i) => ({
      label: `${game.played_at}\n${game.location}`,
      index: i + 1,
      score: game.scores.find((s) => s.player_name === playerName)?.total_score ?? 0,
    }));
}

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#be123c'];

function buildPlayerGameHistoryChart(games: GameRead[], playerName: string) {
  const sortedGames = getPlayerGames(games, playerName).slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id);
  const lines = sortedGames.map((game, index) => ({
    key: `game_${game.id}`,
    name: `Spiel ${index + 1} · ${game.played_at}`,
    color: '#2563eb',
  }));
  const data: Record<string, string | number>[] = Array.from({ length: 10 }, (_, frameIndex) => ({ frame: `${frameIndex + 1}`, roundNumber: (frameIndex + 1) * 10 }));

  sortedGames.forEach((game) => {
    const score = game.scores.find((entry) => entry.player_name === playerName);
    if (!score) return;
    score.frames.forEach((frame, frameIndex) => {
      const cumulative = parseInt(String((frame as FrameData).cumulative ?? ''), 10);
      if (!Number.isNaN(cumulative) && data[frameIndex]) data[frameIndex][`game_${game.id}`] = cumulative;
    });
  });

  return { data, lines };
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      <p className="text-xs text-lane-600">{label}</p>
      <p className="mt-1 text-lg font-bold text-lane-900">{value}</p>
      {sub && <p className="text-xs text-lane-400">{sub}</p>}
    </div>
  );
}

export default function PlayerDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showScoreTrend, setShowScoreTrend] = useState(true);

  useEffect(() => {
    params.then(({ name }) => {
      const decodedName = decodeURIComponent(name);
      setPlayerName(decodedName);
      setEditingName(decodedName);
      fetchGames().then(setGames).finally(() => setLoading(false));
    });
  }, [params]);

  const handleRename = async () => {
    if (!playerName) return;
    const nextName = editingName.trim();
    if (!nextName) {
      setError('Der Spielername darf nicht leer sein.');
      return;
    }

    setRenaming(true);
    setError('');
    setNotice('');

    try {
      const result = await renamePlayer({ current_name: playerName, new_name: nextName });
      const refreshedGames = await fetchGames();
      setGames(refreshedGames);
      setPlayerName(result.player_name);
      setEditingName(result.player_name);
      setIsEditing(false);
      setNotice(result.merged ? 'Spieler wurden zusammengefuehrt.' : 'Spielername aktualisiert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spieler konnte nicht umbenannt werden.');
    } finally {
      setRenaming(false);
    }
  };

  if (loading || !playerName) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Spieler...</div>
        </main>
      </>
    );
  }

  const playerGames = getPlayerGames(games, playerName).slice().sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id);
  const summary = derivePlayerSummaries(games).find((p) => p.name === playerName);
  const trendData = buildPlayerTrendData(games, playerName);
  const gameHistoryChart = buildPlayerGameHistoryChart(games, playerName);

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <Link href="/" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
          ← Home
        </Link>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-[220px] rounded-lg border border-lane-200 px-3 py-2 text-base font-semibold text-lane-900 outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Spielername"
                  />
                  <button
                    type="button"
                    className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRename}
                    disabled={renaming}
                  >
                    {renaming ? 'Speichert...' : 'Speichern'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
                    onClick={() => {
                      setIsEditing(false);
                      setEditingName(playerName);
                      setError('');
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-lane-900">{playerName}</h1>
                  <button
                    type="button"
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
                    onClick={() => {
                      setEditingName(playerName);
                      setIsEditing(true);
                      setError('');
                      setNotice('');
                    }}
                  >
                    Bearbeiten
                  </button>
                </div>
              )}
              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
              {!error && notice && <p className="mt-2 text-sm text-green-700">{notice}</p>}
            </div>
          </div>
          
          {summary && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Spiele" value={summary.gamesPlayed} />
              <StatCard label="Durchschnitt" value={summary.avgScore} />
              <StatCard label="Median" value={summary.medianScore} sub={`${signedDelta(Math.round((summary.medianScore - summary.avgScore) * 10) / 10)} zu Ø`} />
              <StatCard label="Bestleistung" value={summary.maxScore} />
              <StatCard label="Offene Frames" value={`${summary.openFrameRate}%`} />
            </div>
          )}
        </div>

        {trendData.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
            <h2 className="mb-3 text-lg font-semibold text-lane-800">Punkte pro Spiel</h2>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} label={{ value: 'Spiel #', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as Record<string, string | number> | undefined;
                      return item?.label ?? '';
                    }}
                    formatter={(value: number) => [value, 'Punkte']}
                  />
                  <Legend onClick={() => setShowScoreTrend((value) => !value)} wrapperStyle={{ cursor: 'pointer' }} />
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name={playerName} hide={!showScoreTrend} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {gameHistoryChart.lines.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-lane-800">Alle Spiele</h2>
            </div>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={gameHistoryChart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" />
                  {gameHistoryChart.lines.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={1.7} dot={false} activeDot={false} name={line.name} opacity={0.35} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
          <h2 className="mb-3 text-lg font-semibold text-lane-800">Spiele ({playerGames.length})</h2>
          <div className="space-y-2">
            {playerGames.map((game) => {
              const playerScore = game.scores.find((s) => s.player_name === playerName);
              const maxScore = Math.max(...game.scores.map((s) => s.total_score));
              const isWinner = playerScore?.total_score === maxScore;
              
              return (
                <Link key={game.id} href={`/stats/games/${game.id}`}
                  className="block rounded-lg border border-lane-200 p-3 transition hover:bg-lane-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-lane-900">{game.location}</p>
                      <p className="text-xs text-lane-600 mt-1">{game.played_at}</p>
                    </div>
                    <div className={`text-right ${isWinner ? 'text-lane-900 font-bold' : 'text-lane-700'}`}>
                      <p className="text-sm">{playerScore?.total_score} Punkte</p>
                      {isWinner && <p className="text-xs text-amber-600">🏆 Gewinner</p>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
