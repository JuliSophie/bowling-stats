'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import { fetchGames } from '@/lib/api';
import type { GameRead } from '@/types';

type DaySession = {
  date: string;
  games: GameRead[];
};

function groupGamesByDay(games: GameRead[]): DaySession[] {
  const grouped = new Map<string, GameRead[]>();
  
  for (const game of games) {
    const date = game.played_at;
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(game);
  }

  return [...grouped.entries()]
    .map(([date, games]) => ({ date, games }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

type DayPlayerStats = {
  name: string;
  totalPins: number;
  gamesCount: number;
  avgScore: number;
};

function computeDayPlayerStats(games: GameRead[]): DayPlayerStats[] {
  const map = new Map<string, { pins: number; games: number }>();
  
  for (const game of games) {
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { pins: 0, games: 0 };
      entry.pins += score.total_score;
      entry.games++;
      map.set(score.player_name, entry);
    }
  }

  return [...map.entries()]
    .map(([name, { pins, games }]) => ({
      name,
      totalPins: pins,
      gamesCount: games,
      avgScore: Math.round((pins / games) * 10) / 10,
    }))
    .sort((a, b) => b.totalPins - a.totalPins);
}

export default function DaysListPage() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames().then(setGames).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Tage...</div>
        </main>
      </>
    );
  }

  const daySessions = groupGamesByDay(games).filter((session) => session.games.length > 0);

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <div className="flex items-center gap-3">
          <BackButton className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" />
          <h1 className="text-2xl font-bold text-lane-900">Tagesgruppen</h1>
          <span className="text-sm text-lane-600">({daySessions.length})</span>
        </div>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 overflow-hidden">
          {daySessions.map((session, i) => {
            const dayPlayers = computeDayPlayerStats(session.games);
            const winner = dayPlayers[0];

            return (
              <Link key={session.date} href={`/stats/days/${session.date}`}
                className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-lane-50 ${i < daySessions.length - 1 ? 'border-b border-lane-100' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-lane-900">{session.date}</h3>
                  <p className="mt-1 text-xs text-lane-500">
                    {session.games.length} Spiel{session.games.length !== 1 ? 'e' : ''} · {session.games[0].location}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dayPlayers.slice(0, 3).map((player) => (
                      <span key={player.name} className="rounded-full bg-lane-100 px-2 py-0.5 text-xs font-medium text-lane-700">
                        {player.name}: {player.totalPins} Pins
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <p className="font-semibold text-lane-900">👑 {winner?.name}</p>
                  <p className="text-lane-600 mt-0.5">{winner?.totalPins} Pins</p>
                  <p className="text-lane-400 mt-2">→</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
