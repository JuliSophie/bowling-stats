'use client';

import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import GameDayPreviewCard from '@/components/game-day-preview-card';
import { fetchGames } from '@/lib/api';
import type { GameRead } from '@/types';

type GamesByDay = {
  date: string;
  games: GameRead[];
};

export default function GamesListPage() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);

  useEffect(() => {
    fetchGames().then(setGames).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Spiele...</div>
        </main>
      </>
    );
  }

  // Group games by date
  const grouped = new Map<string, GameRead[]>();
  for (const game of games) {
    const date = game.played_at;
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(game);
  }

  const gamesByDay: GamesByDay[] = [...grouped.entries()]
    .map(([date, dayGames]) => ({ date, games: dayGames }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <div className="flex items-center gap-3">
          <BackButton className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" />
          <h1 className="text-2xl font-bold text-lane-900">Alle Spiele</h1>
          <span className="text-sm text-lane-600">({games.length})</span>
        </div>

        <div className="grid gap-4">
          {gamesByDay.map((dayGroup) => (
            <GameDayPreviewCard
              key={dayGroup.date}
              date={dayGroup.date}
              games={dayGroup.games}
              allGames={games}
              expandedGameId={expandedGameId}
              onExpandedGameChange={setExpandedGameId}
            />
          ))}
        </div>
      </main>
    </>
  );
}
