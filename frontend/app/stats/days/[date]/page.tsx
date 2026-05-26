'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { fetchGames } from '@/lib/api';
import type { FrameData, GameRead } from '@/types';
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#be123c'];

type DayPlayerStats = {
  name: string;
  totalPins: number;
  gamesCount: number;
  wins: number;
  avgScore: number;
  medianScore: number;
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function computeDayPlayerStats(games: GameRead[]): DayPlayerStats[] {
  const map = new Map<string, { pins: number; games: number; wins: number; scores: number[] }>();
  
  for (const game of games) {
    const highScore = Math.max(...game.scores.map((score) => score.total_score));
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { pins: 0, games: 0, wins: 0, scores: [] };
      entry.pins += score.total_score;
      entry.games++;
      entry.scores.push(score.total_score);
      if (score.total_score === highScore) entry.wins++;
      map.set(score.player_name, entry);
    }
  }

  return [...map.entries()]
    .map(([name, { pins, games, wins, scores }]) => ({
      name,
      totalPins: pins,
      gamesCount: games,
      wins,
      avgScore: Math.round((pins / games) * 10) / 10,
      medianScore: Math.round(median(scores) * 10) / 10,
    }))
    .sort((a, b) => b.wins - a.wins || b.totalPins - a.totalPins);
}

function buildDayGameHistoryChart(games: GameRead[]) {
  const sortedGames = games.slice().sort((a, b) => a.id - b.id);
  const playerColorIndex = new Map<string, number>();
  const lines: { key: string; name: string; color: string; playerName: string }[] = [];
  const data: Record<string, string | number>[] = Array.from({ length: 10 }, (_, frameIndex) => ({ frame: `${frameIndex + 1}`, roundNumber: (frameIndex + 1) * 10 }));

  sortedGames.forEach((game, gameIndex) => {
    game.scores.forEach((score) => {
      if (!playerColorIndex.has(score.player_name)) playerColorIndex.set(score.player_name, playerColorIndex.size);
      const colorIndex = playerColorIndex.get(score.player_name) ?? 0;
      const key = `game_${game.id}_${score.player_name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push({ key, name: `Spiel ${gameIndex + 1} · ${score.player_name}`, color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length], playerName: score.player_name });

      score.frames.forEach((frame, frameIndex) => {
        const cumulative = parseInt(String((frame as FrameData).cumulative ?? ''), 10);
        if (!Number.isNaN(cumulative) && data[frameIndex]) data[frameIndex][key] = cumulative;
      });
    });
  });

  const legend = [...playerColorIndex.entries()].map(([name, index]) => ({ name, color: PLAYER_COLORS[index % PLAYER_COLORS.length] }));
  return { data, lines, legend };
}

function buildSessionScoreChart(games: GameRead[]) {
  const sortedGames = games.slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id);
  const playerColorIndex = new Map<string, number>();

  const data: Record<string, string | number>[] = sortedGames.map((game, index) => {
    const point: Record<string, string | number> = {
      game: `Spiel ${index + 1}`,
      gameNumber: index + 1,
      location: game.location,
    };

    game.scores.forEach((score) => {
      if (!playerColorIndex.has(score.player_name)) playerColorIndex.set(score.player_name, playerColorIndex.size);
      point[score.player_name] = score.total_score;
    });

    return point;
  });

  const lines = [...playerColorIndex.entries()].map(([name, index]) => ({
    key: name,
    name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
  }));

  return { data, lines };
}

export default function DayDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [hiddenDayPlayers, setHiddenDayPlayers] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    params.then(({ date }) => {
      setDate(date);
      fetchGames().then(setGames).finally(() => setLoading(false));
    });
  }, [params]);

  if (loading || !date) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Tag...</div>
        </main>
      </>
    );
  }

  const dayGames = games.filter((g) => g.played_at === date);

  if (dayGames.length === 0) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <Link href="/" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
            ← Home
          </Link>
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-center">
            <p className="text-sm text-lane-600">Keine Spiele für diesen Tag gefunden.</p>
          </div>
        </main>
      </>
    );
  }

  const dayPlayers = computeDayPlayerStats(dayGames);
  const winner = dayPlayers[0];
  const totalPins = dayPlayers.reduce((sum, p) => sum + p.totalPins, 0);
  const avgPinsPerGame = Math.round((totalPins / dayGames.length) * 10) / 10;
  const dayGameHistoryChart = buildDayGameHistoryChart(dayGames);
  const sessionScoreChart = buildSessionScoreChart(dayGames);

  const toggleDayPlayer = (name: string) => {
    setHiddenDayPlayers((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <Link href="/" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
          ← Home
        </Link>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h1 className="text-2xl font-bold text-lane-900">{date}</h1>
          <p className="text-sm text-lane-600 mt-2">{dayGames.length} Spiel{dayGames.length !== 1 ? 'e' : ''} · Ort: {dayGames[0].location}</p>
          
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
              <p className="text-xs text-lane-600">Gesamtpunkte</p>
              <p className="mt-1 text-lg font-bold text-lane-900">{totalPins}</p>
            </div>
            <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
              <p className="text-xs text-lane-600">Spiele</p>
              <p className="mt-1 text-lg font-bold text-lane-900">{dayGames.length}</p>
            </div>
            <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
              <p className="text-xs text-lane-600">Ø pro Spiel</p>
              <p className="mt-1 text-lg font-bold text-lane-900">{avgPinsPerGame}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h2 className="text-lg font-semibold text-lane-800 mb-4">Spieler ({dayPlayers.length})</h2>
          <div className="space-y-3">
            {dayPlayers.map((player, i) => (
              <Link key={player.name} href={`/stats/players/${encodeURIComponent(player.name)}`} className="flex items-center justify-between gap-3 rounded-lg border border-lane-200 bg-lane-50 p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-lane-900">{i + 1}.</span>
                    <span className="text-base font-semibold text-lane-900">{player.name}</span>
                    {i === 0 && <span className="text-sm">👑</span>}
                  </div>
                  <p className="text-xs text-lane-600 mt-1">{player.gamesCount} Spiel{player.gamesCount !== 1 ? 'e' : ''} · Median {player.medianScore}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-lane-900">{player.totalPins} Pins</p>
                  <p className="text-xs text-lane-600">{player.wins} Sieg{player.wins !== 1 ? 'e' : ''} · ⌀ {player.avgScore}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {sessionScoreChart.lines.length > 0 && dayGames.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-lane-800">Session-Verlauf nach Endscore</h2>
              <p className="text-xs text-lane-600">Finale Punktzahl je Spiel, damit Trends über den ganzen Bowling-Tag sichtbar werden.</p>
            </div>
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-lane-600">
              {sessionScoreChart.lines.map((line) => (
                <span key={line.key} className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
                  {line.name}
                </span>
              ))}
            </div>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={sessionScoreChart.data} margin={{ top: 22, right: 24, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="game" tick={{ fontSize: 12 }} label={{ value: 'Spiel im Tagesverlauf', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as Record<string, string | number> | undefined;
                      return item ? `${item.game} · ${item.location}` : '';
                    }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  {sessionScoreChart.lines.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2.4} dot={{ r: 4 }} activeDot={{ r: 6 }} name={line.name}>
                      <LabelList dataKey={line.key} position="top" fontSize={11} fill={line.color} />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {dayGameHistoryChart.lines.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-lane-800">Alle Spielverläufe des Tages</h2>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {dayGameHistoryChart.legend.map((item) => {
                const hidden = hiddenDayPlayers.has(item.name);
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={!hidden}
                    onClick={() => toggleDayPlayer(item.name)}
                    className={`chart-toggle rounded-full border px-3 py-1.5 text-xs font-semibold transition ${hidden ? 'border-lane-300 bg-white/70 text-lane-500 opacity-60' : 'border-lane-300 bg-white/70 text-lane-700'}`}
                  >
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </button>
                );
              })}
            </div>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={dayGameHistoryChart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" />
                  {dayGameHistoryChart.lines.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={1.8} dot={false} activeDot={false} name={line.name} opacity={0.48} hide={hiddenDayPlayers.has(line.playerName)} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h2 className="text-lg font-semibold text-lane-800 mb-4">Spiele ({dayGames.length})</h2>
          <div className="space-y-2">
            {dayGames.map((game) => {
              const gameAvg = Math.round(game.scores.reduce((a, s) => a + s.total_score, 0) / game.scores.length);
              const maxScore = Math.max(...game.scores.map((s) => s.total_score));
              const gameWinner = game.scores.find((s) => s.total_score === maxScore);

              return (
                <Link key={game.id} href={`/stats/games/${game.id}`}
                  className="block rounded-lg border border-lane-200 p-3 transition hover:bg-lane-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-lane-900">{game.location}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {game.scores.map((score) => (
                          <span key={score.player_name} className={`text-xs px-2 py-0.5 rounded-full ${score.total_score === maxScore ? 'bg-lane-800 text-white font-medium' : 'bg-lane-100 text-lane-700'}`}>
                            {score.player_name} {score.total_score}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-lane-600">⌀ {gameAvg}</p>
                      {gameWinner && <p className="text-lane-600 mt-1">→</p>}
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
