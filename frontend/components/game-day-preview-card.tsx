import Link from 'next/link';

import GamePreviewCard from '@/components/game-preview-card';
import type { GameRead } from '@/types';

type GameDayPreviewCardProps = {
  date: string;
  games: GameRead[];
  allGames?: GameRead[];
  expandedGameId?: number | null;
  onExpandedGameChange?: (gameId: number | null) => void;
};

function buildDayPlayers(games: GameRead[]) {
  const playerPins = new Map<string, number>();

  for (const game of games) {
    for (const score of game.scores) {
      playerPins.set(score.player_name, (playerPins.get(score.player_name) ?? 0) + score.total_score);
    }
  }

  return [...playerPins.entries()]
    .map(([name, pins]) => ({ name, pins }))
    .sort((a, b) => b.pins - a.pins);
}

export default function GameDayPreviewCard({
  date,
  games,
  allGames,
  expandedGameId,
  onExpandedGameChange,
}: GameDayPreviewCardProps) {
  const sortedGames = games.slice().sort((a, b) => a.id - b.id);
  const dayPlayers = buildDayPlayers(sortedGames);
  const winner = dayPlayers[0];
  const totalPins = dayPlayers.reduce((sum, player) => sum + player.pins, 0);

  return (
    <section className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 border-b border-lane-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-lane-900">{date}</h2>
            <span className="rounded-full bg-lane-100 px-2.5 py-1 text-xs font-semibold text-lane-700">
              {sortedGames.length} Spiel{sortedGames.length !== 1 ? 'e' : ''}
            </span>
            <span className="rounded-full bg-lane-100 px-2.5 py-1 text-xs font-semibold text-lane-700">
              {totalPins} Pins
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dayPlayers.map((player, index) => (
              <span
                key={player.name}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${index === 0 ? 'bg-lane-800 text-white' : 'bg-lane-100 text-lane-700'}`}
              >
                {index === 0 ? '👑 ' : ''}{player.name}: {player.pins}
              </span>
            ))}
          </div>
        </div>

        <Link
          href={`/stats/days/${date}`}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-lane-300 bg-white px-3 py-2 text-xs font-bold text-lane-700 transition hover:-translate-y-0.5 hover:border-lane-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-lane-700/20"
        >
          Tag Details
        </Link>
      </div>

      <div className="grid gap-2">
        {sortedGames.map((game, index) => (
          <GamePreviewCard
            key={game.id}
            game={game}
            allGames={allGames}
            label={`Spiel ${index + 1}`}
            showDate={false}
            expanded={expandedGameId === game.id}
            onExpandedChange={(nextExpanded) => onExpandedGameChange?.(nextExpanded ? game.id : null)}
          />
        ))}
      </div>
    </section>
  );
}
