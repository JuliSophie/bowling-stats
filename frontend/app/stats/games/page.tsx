'use client';

import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import GameDayPreviewCard from '@/components/game-day-preview-card';
import { useGames } from '@/lib/use-games';
import { useStickyState } from '@/lib/use-sticky-state';
import type { GameRead } from '@/types';

type GamesByDay = {
  date: string;
  games: GameRead[];
};

export default function GamesListPage() {
  const { games, loading } = useGames();
  const [expandedGameId, setExpandedGameId] = useStickyState<number | null>('games:expandedGame', null);

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
          <BackButton className="back-button" />
          <h1 className="text-2xl font-bold text-lane-900">Alle Spiele</h1>
          <span className="text-sm text-lane-600">({games.length})</span>
        </div>

        <div className="grid gap-4">
          {/* Only the newest day starts expanded. gamesByDay is sorted newest-first, so that is
            index 0. With ~40 games, opening every day built a card per game up front — each one
            running calculateGameExcitement over all ten frames — which is a lot of DOM to paint
            and composite on a slow phone for rows nobody has asked to see yet. */}
          {gamesByDay.map((dayGroup, index) => (
            <GameDayPreviewCard
              key={dayGroup.date}
              date={dayGroup.date}
              games={dayGroup.games}
              allGames={games}
              defaultOpen={index === 0}
              expandedGameId={expandedGameId}
              onExpandedGameChange={setExpandedGameId}
            />
          ))}
        </div>
      </main>
    </>
  );
}
