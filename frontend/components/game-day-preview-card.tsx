'use client';

import Link from 'next/link';
import { useState } from 'react';

import GamePreviewCard from '@/components/game-preview-card';
import type { GameRead } from '@/types';

type GameDayPreviewCardProps = {
  date: string;
  games: GameRead[];
  allGames?: GameRead[];
  expandedGameId?: number | null;
  onExpandedGameChange?: (gameId: number | null) => void;
  defaultOpen?: boolean;
};

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function formatDateDE(isoDate: string): string {
  const date = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

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
  defaultOpen = true,
}: GameDayPreviewCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sortedGames = games.slice().sort((a, b) => a.id - b.id);
  const dayPlayers = buildDayPlayers(sortedGames);
  const location = sortedGames[0]?.location;

  const toggleOpen = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <section className="section-card overflow-hidden">
      <div className="flex items-stretch">
        <Link
          href={`/stats/days/${date}`}
          className="min-w-0 flex-1 p-4 transition hover:bg-lane-50"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-bold text-lane-900">{formatDateDE(date)}</h2>
            <span className="text-xs font-medium text-lane-500">
              {location} · {sortedGames.length} Spiel{sortedGames.length !== 1 ? 'e' : ''}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dayPlayers.map((player, index) => (
              <span
                key={player.name}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${index === 0 ? 'winner-chip' : 'bg-lane-100 text-lane-700'}`}
              >
                {index === 0 ? '👑 ' : ''}{player.name}: {player.pins}
              </span>
            ))}
          </div>
        </Link>

        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={open ? 'Spiele einklappen' : 'Spiele ausklappen'}
          className="flex shrink-0 items-center px-4 transition hover:bg-lane-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-lane-700/20"
        >
          <span className={`text-sm font-bold text-lane-400 transition ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>

      {open && (
        <div className="grid gap-2 border-t border-lane-100 p-3">
          {sortedGames.map((game, index) => (
            <GamePreviewCard
              key={game.id}
              game={game}
              allGames={allGames}
              label={`Spiel ${index + 1}`}
              showDate={false}
              showLocation={false}
              expanded={expandedGameId === game.id}
              onExpandedChange={(nextExpanded) => onExpandedGameChange?.(nextExpanded ? game.id : null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
