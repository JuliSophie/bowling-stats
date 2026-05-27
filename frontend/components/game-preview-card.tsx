'use client';

import Link from 'next/link';
import { useState } from 'react';

import GameChart from '@/components/game-chart';
import { calculateGameExcitement, formatTensionIndex } from '@/lib/excitement';
import type { GameRead } from '@/types';

type GamePreviewCardProps = {
  game: GameRead;
  allGames?: GameRead[];
  highlightPlayer?: string;
  label?: string;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
  showDate?: boolean;
  showLocation?: boolean;
  detailsLabel?: string;
};

function combineClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

function getWinner(game: GameRead) {
  const maxScore = Math.max(...game.scores.map((score) => score.total_score));
  const winners = game.scores.filter((score) => score.total_score === maxScore);
  return { maxScore, winners };
}

function getGameAverage(game: GameRead) {
  if (game.scores.length === 0) return 0;
  return Math.round(game.scores.reduce((sum, score) => sum + score.total_score, 0) / game.scores.length);
}

export default function GamePreviewCard({
  game,
  allGames,
  highlightPlayer,
  label,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  className,
  showDate = true,
  showLocation = true,
  detailsLabel = 'Mehr Details',
}: GamePreviewCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;
  const { maxScore, winners } = getWinner(game);
  const winnerNames = winners.map((winner) => winner.player_name).join(', ');
  const gameAverage = getGameAverage(game);
  const excitement = calculateGameExcitement(game);
  const highlightedScore = highlightPlayer ? game.scores.find((score) => score.player_name === highlightPlayer) : undefined;

  const setExpanded = (nextExpanded: boolean) => {
    if (!isControlled) setInternalExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  return (
    <article className={combineClasses('overflow-hidden rounded-[1.15rem] border border-lane-200 bg-white/90 shadow-sm transition hover:border-lane-300 hover:shadow-md', className)}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-lane-50 focus:outline-none focus:ring-2 focus:ring-lane-700/20 sm:px-2"
          onClick={() => setExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {label && <span className="rounded-full bg-lane-800 px-2.5 py-1 text-xs font-semibold text-white">{label}</span>}
              {showLocation && <h3 className="text-sm font-bold text-lane-900">{game.location}</h3>}
              {showDate && <span className="text-xs font-medium text-lane-500">{game.played_at}</span>}
              {highlightedScore && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {highlightedScore.player_name}: {highlightedScore.total_score}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {game.scores.map((score) => {
                const isWinner = score.total_score === maxScore;
                const isHighlighted = score.player_name === highlightPlayer;
                return (
                  <span
                    key={score.player_name}
                    className={combineClasses(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      isWinner ? 'bg-lane-800 text-white' : 'bg-lane-100 text-lane-700',
                      isHighlighted && !isWinner && 'ring-2 ring-blue-200',
                    )}
                  >
                    {score.player_name}: {score.total_score}
                  </span>
                );
              })}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-lane-500">
              <span>⌀ {gameAverage}</span>
              {winnerNames && <span>👑 {winnerNames}</span>}
              {excitement && (
                <span className="font-bold text-orange-700">
                  🔥 Spannung {formatTensionIndex(excitement.tensionIndex)} · {excitement.leadChanges} Wechsel · {excitement.finalGap} Pins
                </span>
              )}
            </div>
          </div>

          <span className={combineClasses('mt-1 shrink-0 text-sm font-bold text-lane-400 transition', isExpanded && 'rotate-180')}>▼</span>
        </button>

        <Link
          href={`/stats/games/${game.id}`}
          className="inline-flex shrink-0 items-center justify-center self-start rounded-full border border-lane-300 bg-white px-3 py-2 text-xs font-bold text-lane-700 transition hover:-translate-y-0.5 hover:border-lane-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-lane-700/20 sm:self-center"
        >
          {detailsLabel}
        </Link>
      </div>

      {isExpanded && (
        <div className="border-t border-lane-100 bg-lane-50/30 p-4">
          <GameChart game={game} allGames={allGames} highlightPlayer={highlightPlayer} />
        </div>
      )}
    </article>
  );
}
