'use client';

import Link from 'next/link';
import { useState } from 'react';

import GameChart from '@/components/game-chart';
import { calculateGameExcitement } from '@/lib/excitement';
import { formatPlayedAtTime } from '@/lib/frame-utils';
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
};

function combineClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

function getWinner(game: GameRead) {
  const maxScore = Math.max(...game.scores.map((score) => score.total_score));
  const winners = game.scores.filter((score) => score.total_score === maxScore);
  return { maxScore, winners };
}

function fireCount(tensionIndex: number): number {
  if (tensionIndex >= 4) return 5;
  if (tensionIndex >= 2.5) return 4;
  if (tensionIndex >= 1.5) return 3;
  if (tensionIndex >= 0.7) return 2;
  if (tensionIndex >= 0.2) return 1;
  return 0;
}

function FireScale({ lit }: { lit: number }) {
  return (
    <span className="inline-flex gap-0.5 text-sm leading-none">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < lit ? '' : 'opacity-15 grayscale'}>{i < lit ? '🔥' : '🔥'}</span>
      ))}
    </span>
  );
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
}: GamePreviewCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;
  const { maxScore } = getWinner(game);
  const excitement = calculateGameExcitement(game);
  const lit = excitement ? fireCount(excitement.tensionIndex) : 0;
  const analysisId = `game-analysis-${game.id}`;
  const analysisSummary = excitement
    ? `Spannungsindex: ${excitement.tensionIndex.toFixed(2)}`
    : game.scores.length < 2
      ? 'Spannungsindex nicht berechenbar: mindestens zwei Spieler erforderlich.'
      : 'Spannungsindex nicht berechenbar: lückenhafte Rundendaten.';

  const toggleExpanded = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const nextExpanded = !isExpanded;
    if (!isControlled) setInternalExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  return (
    <article className={combineClasses('overflow-hidden rounded-xl border border-lane-200 bg-white/90 transition', className)}>
      <div className="flex items-stretch">
        <Link
          href={`/stats/games/${game.id}`}
          className="min-w-0 flex-1 px-3 py-2.5 transition hover:bg-lane-50 sm:px-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {label && <span className="rounded-full bg-lane-800 px-2 py-0.5 text-[0.65rem] font-bold text-white">{label}</span>}
              {showLocation && <span className="text-sm font-bold text-lane-900">{game.location}</span>}
              {showDate && <span className="text-xs text-lane-500">{game.played_at}</span>}
              {formatPlayedAtTime(game.played_at_time) && <span className="text-xs text-lane-500">{formatPlayedAtTime(game.played_at_time)} Uhr</span>}
            </div>
            {excitement && <span className="shrink-0" title={`Spannung ${excitement.tensionIndex.toFixed(1)}`}><FireScale lit={lit} /></span>}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {game.scores.map((score) => {
              const isWinner = score.total_score === maxScore;
              const isHighlighted = score.player_name === highlightPlayer;
              return (
                <span
                  key={score.player_name}
                  className={combineClasses(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    isWinner ? 'winner-chip' : 'bg-lane-100 text-lane-900',
                    isHighlighted && !isWinner && 'ring-2 ring-blue-200',
                  )}
                >
                  {score.player_name}: {score.total_score}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs font-medium text-lane-600">{analysisSummary}</p>
        </Link>

        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={analysisId}
          aria-label={`${isExpanded ? 'Analyse schließen' : 'Analyse ansehen'} für Spiel ${game.id}`}
          className="flex shrink-0 items-center px-3 text-xs font-bold text-coral transition hover:bg-lane-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-lane-700/20"
        >
          <span>{isExpanded ? 'Analyse schließen' : 'Analyse ansehen'}</span>
        </button>
      </div>

      <div id={analysisId} hidden={!isExpanded} className="border-t border-lane-100 bg-lane-50/30 p-4">
        {isExpanded && <GameChart game={game} allGames={allGames} highlightPlayer={highlightPlayer} />}
      </div>
    </article>
  );
}
