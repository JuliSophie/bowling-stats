'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import GamePreviewCard from '@/components/game-preview-card';
import { fetchGames, renamePlayer } from '@/lib/api';
import { useGames } from '@/lib/use-games';
import { useStickyState } from '@/lib/use-sticky-state';
import {
  clampPercent,
  comebackInfo,
  countPerGameBenchmark,
  deltaBenchmark,
  highestLossInfo,
  medianConsistencyBenchmark,
  finishStrengthInfo,
  firstThrowBenchmark,
  firstThrowInfo,
  medianAverageInfo,
  openFrameBenchmark,
  playerLossScoreBenchmark,
  playerScoreBenchmark,
  playerScoreInfo,
  rateBenchmark,
  spareInfo,
  streakBenchmark,
  strikeFollowInfo,
  type StatBenchmark,
} from '@/lib/trash-talk';
import type { GameRead, FrameData } from '@/types';
import { isStrikeFrame, isSpareFrame, median, parseCumulative, getFirstThrowPins, getFramePoints, formatNullableScore, getPlayerGames } from '@/lib/frame-utils';
import { type PlayerSummary, derivePlayerSummaries, buildPlayerTrendData } from '@/lib/player-stats';
import InfoTip from '@/components/ui/info-tip';
import { StatCard, InsightCard } from '@/components/ui/stat-card';
import SectionCard from '@/components/ui/section-card';
import CardGrid from '@/components/ui/card-grid';
import StatSection from '@/components/ui/stat-section';
import ChartFrame from '@/components/ui/chart-frame';
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

type PlayerAdvancedStats = {
  finishStrength: number;
  fatigueFactor: number;
  strikeFollowRate: number;
  comebackRate: number;
  bestStrikeStreak: number;
  bestStrikeStreakLabel: string;
  firstThrowAverage: number;
  secondThrowZeroRate: number;
  wins: number;
  losses: number;
  winRate: number;
  totalStrikes: number;
  avgPointsPerStrike: number;
  totalSpares: number;
  avgPointsPerSpare: number;
  bestWinningPoints: number | null;
  bestWinningPointsGameId: number | null;
  lowestWinningPoints: number | null;
  lowestWinningPointsGameId: number | null;
  averageWinningPoints: number | null;
  highestLosingPoints: number | null;
  highestLosingPointsGameId: number | null;
  bestStrikeStreakGameId: number | null;
};

type PlayerScoreHeatmapFrame = {
  frame: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  samples: number;
  bins: { score: number; count: number; opacity: number }[];
};

type PlayerScoreHeatmapGameLine = {
  label: string;
  total: number;
  values: (number | null)[];
};

type PlayerScoreHeatmapData = {
  frames: PlayerScoreHeatmapFrame[];
  maxScore: number;
  binSize: number;
  bestGame: PlayerScoreHeatmapGameLine | null;
  worstGame: PlayerScoreHeatmapGameLine | null;
};

function signedDelta(value: number) {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : String(value);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(average(values) * 10) / 10;
}

function buildBestStrikeStreakLabel(streak: number) {
  if (streak >= 3) return 'Turkey';
  if (streak === 2) return 'Double';
  if (streak === 1) return 'Single';
  return 'Keine Serie';
}

function buildPlayerAdvancedStats(games: GameRead[], playerName: string): PlayerAdvancedStats {
  const playerGames = getPlayerGames(games, playerName).slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id);
  const allFramePoints: number[] = [];
  const tenthFramePoints: number[] = [];
  const firstThrowPins: number[] = [];
  const strikeFramePoints: number[] = [];
  const spareFramePoints: number[] = [];
  const gameScores: number[] = [];
  const winningScores: number[] = [];
  const losingScores: number[] = [];

  let wins = 0;
  let losses = 0;
  let totalStrikes = 0;
  let totalSpares = 0;
  let strikeFollowOpportunities = 0;
  let strikeFollowSuccesses = 0;
  let comebackOpportunities = 0;
  let comebackSuccesses = 0;
  let bestStrikeStreak = 0;
  let bestStrikeStreakGameId: number | null = null;
  let bestWinningPointsGameId: number | null = null;
  let lowestWinningPointsGameId: number | null = null;
  let highestLosingPointsGameId: number | null = null;
  let secondThrowAttempts = 0;
  let secondThrowZeroes = 0;

  for (const game of playerGames) {
    const playerScore = game.scores.find((score) => score.player_name === playerName);
    if (!playerScore) continue;

    const highScore = Math.max(...game.scores.map((score) => score.total_score));
    if (playerScore.total_score === highScore) {
      wins++;
      winningScores.push(playerScore.total_score);
      if (bestWinningPointsGameId === null || playerScore.total_score > Math.max(...winningScores.slice(0, -1), Number.NEGATIVE_INFINITY)) {
        bestWinningPointsGameId = game.id;
      }
      if (lowestWinningPointsGameId === null || playerScore.total_score < Math.min(...winningScores.slice(0, -1), Number.POSITIVE_INFINITY)) {
        lowestWinningPointsGameId = game.id;
      }
    } else {
      losses++;
      losingScores.push(playerScore.total_score);
      if (highestLosingPointsGameId === null || playerScore.total_score > Math.max(...losingScores.slice(0, -1), Number.NEGATIVE_INFINITY)) {
        highestLosingPointsGameId = game.id;
      }
    }
    gameScores.push(playerScore.total_score);

    let runningStrikeStreak = 0;
    let previousCumulative = 0;

    playerScore.frames.forEach((frame, index) => {
      const strike = isStrikeFrame(frame);
      const spare = isSpareFrame(frame);
      const open = !strike && !spare;
      const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
      const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();

      firstThrowPins.push(getFirstThrowPins(frame));

      if (throw1 !== 'x' && throw2) {
        secondThrowAttempts++;
        if (throw2 === '-' || throw2 === '0' || throw2 === 'f') secondThrowZeroes++;
      }

      if (strike) {
        totalStrikes++;
        runningStrikeStreak++;
        if (runningStrikeStreak > bestStrikeStreak) {
          bestStrikeStreak = runningStrikeStreak;
          bestStrikeStreakGameId = game.id;
        }
      } else {
        runningStrikeStreak = 0;
      }

      if (spare) totalSpares++;

      const framePoints = getFramePoints(frame, previousCumulative);
      const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
      if (!Number.isNaN(cumulative)) previousCumulative = cumulative;

      if (framePoints != null) {
        allFramePoints.push(framePoints);
        if (index === 9) tenthFramePoints.push(framePoints);
        if (strike) strikeFramePoints.push(framePoints);
        if (spare) spareFramePoints.push(framePoints);
      }

      if (index >= playerScore.frames.length - 1) return;

      const nextFrame = playerScore.frames[index + 1];
      const nextStrike = isStrikeFrame(nextFrame);
      const nextSpare = isSpareFrame(nextFrame);

      if (strike) {
        strikeFollowOpportunities++;
        if (nextStrike) strikeFollowSuccesses++;
      }

      if (open) {
        comebackOpportunities++;
        if (nextStrike || nextSpare) comebackSuccesses++;
      }
    });
  }

  const avgFramePoints = average(allFramePoints);
  const avgTenthFramePoints = average(tenthFramePoints);
  const firstGameScore = gameScores[0] ?? 0;
  const laterGameScores = gameScores.slice(1);
  const avgLaterGames = average(laterGameScores);
  const fatigueFactor = firstGameScore > 0 && laterGameScores.length > 0
    ? Math.round((((firstGameScore - avgLaterGames) / firstGameScore) * 100) * 10) / 10
    : 0;

  return {
    finishStrength: Math.round((avgTenthFramePoints - avgFramePoints) * 10) / 10,
    fatigueFactor,
    strikeFollowRate: strikeFollowOpportunities > 0 ? Math.round((strikeFollowSuccesses / strikeFollowOpportunities) * 1000) / 10 : 0,
    comebackRate: comebackOpportunities > 0 ? Math.round((comebackSuccesses / comebackOpportunities) * 1000) / 10 : 0,
    bestStrikeStreak,
    bestStrikeStreakLabel: buildBestStrikeStreakLabel(bestStrikeStreak),
    firstThrowAverage: Math.round(average(firstThrowPins) * 10) / 10,
    secondThrowZeroRate: secondThrowAttempts > 0 ? Math.round((secondThrowZeroes / secondThrowAttempts) * 1000) / 10 : 0,
    wins,
    losses,
    winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0,
    totalStrikes,
    avgPointsPerStrike: Math.round(average(strikeFramePoints) * 10) / 10,
    totalSpares,
    avgPointsPerSpare: Math.round(average(spareFramePoints) * 10) / 10,
    bestWinningPoints: winningScores.length > 0 ? Math.max(...winningScores) : null,
    bestWinningPointsGameId,
    lowestWinningPoints: winningScores.length > 0 ? Math.min(...winningScores) : null,
    lowestWinningPointsGameId,
    averageWinningPoints: averageOrNull(winningScores),
    highestLosingPoints: losingScores.length > 0 ? Math.max(...losingScores) : null,
    highestLosingPointsGameId,
    bestStrikeStreakGameId,
  };
}

function formatCompactPercent(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function formatOneDecimal(value: number) {
  if (Number.isInteger(value)) return value.toFixed(1);
  return value.toFixed(1);
}

function formatSignedPercent(value: number) {
  if (value === 0) return '±0%';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

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

function buildPlayerScoreHeatmap(games: GameRead[], playerName: string): PlayerScoreHeatmapData {
  const sortedGames = getPlayerGames(games, playerName).slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id);
  const gamesWithScores = sortedGames.map((game, index) => {
    const score = game.scores.find((entry) => entry.player_name === playerName);
    return {
      label: `Spiel ${index + 1} · ${game.played_at}`,
      total: score?.total_score ?? 0,
      values: Array.from({ length: 10 }, (_, frameIndex) => score?.frames[frameIndex] ? parseCumulative(score.frames[frameIndex] as FrameData) : null),
    };
  }).filter((game) => game.values.some((value) => value !== null));

  const allValues = gamesWithScores.flatMap((game) => game.values).filter((value): value is number => value !== null);
  const maxScore = Math.max(100, Math.ceil(((Math.max(...allValues, 0) || 0) + 10) / 25) * 25);
  const binSize = maxScore > 220 ? 10 : 5;

  const frames = Array.from({ length: 10 }, (_, frameIndex) => {
    const values = gamesWithScores.map((game) => game.values[frameIndex]).filter((value): value is number => value !== null);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const avg = values.length > 0 ? Math.round(average(values) * 10) / 10 : 0;
    const medianScore = values.length > 0 ? Math.round(median(values) * 10) / 10 : 0;
    const binCounts = new Map<number, number>();

    values.forEach((value) => {
      const bin = Math.max(0, Math.min(maxScore - binSize, Math.floor(value / binSize) * binSize));
      binCounts.set(bin, (binCounts.get(bin) ?? 0) + 1);
    });

    const maxCount = Math.max(...binCounts.values(), 1);
    const bins = [...binCounts.entries()].map(([score, count]) => ({
      score,
      count,
      opacity: 0.16 + (count / maxCount) * 0.68,
    }));

    return { frame: frameIndex + 1, min, max, avg, median: medianScore, samples: values.length, bins };
  });

  const bestGame = gamesWithScores.reduce<PlayerScoreHeatmapGameLine | null>((best, game) => (!best || game.total > best.total ? game : best), null);
  const worstGame = gamesWithScores.reduce<PlayerScoreHeatmapGameLine | null>((worst, game) => (!worst || game.total < worst.total ? game : worst), null);

  return { frames, maxScore, binSize, bestGame, worstGame };
}

function PlayerScoreHeatmap({ chart }: { chart: PlayerScoreHeatmapData }) {
  const width = 860;
  const height = 360;
  const margin = { top: 18, right: 28, bottom: 44, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const frameStep = plotWidth / 10;
  const yTicks = Array.from({ length: Math.floor(chart.maxScore / 50) + 1 }, (_, index) => index * 50);

  const xCenter = (frame: number) => margin.left + (frame - 0.5) * frameStep;
  const yForScore = (score: number) => margin.top + ((chart.maxScore - score) / chart.maxScore) * plotHeight;
  const linePath = (values: (number | null)[]) => values
    .reduce<string[]>((parts, value, index) => {
      if (value === null) return parts;
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${xCenter(index + 1)} ${yForScore(value)}`);
      return parts;
    }, [])
    .filter(Boolean)
    .join(' ');
  const rangePath = chart.frames.length > 0
    ? `${chart.frames.map((frame, index) => `${index === 0 ? 'M' : 'L'} ${xCenter(frame.frame)} ${yForScore(frame.max)}`).join(' ')} ${chart.frames.slice().reverse().map((frame) => `L ${xCenter(frame.frame)} ${yForScore(frame.min)}`).join(' ')} Z`
    : '';
  const bestWorstRangePath = chart.bestGame && chart.worstGame
    ? `${chart.bestGame.values.map((bestValue, index) => {
        const worstValue = chart.worstGame?.values[index] ?? null;
        if (bestValue === null || worstValue === null) return null;
        return `${index === 0 ? 'M' : 'L'} ${xCenter(index + 1)} ${yForScore(Math.max(bestValue, worstValue))}`;
      }).filter(Boolean).join(' ')} ${chart.bestGame.values.slice().reverse().map((bestValue, reversedIndex) => {
        const index = chart.bestGame ? chart.bestGame.values.length - 1 - reversedIndex : 0;
        const worstValue = chart.worstGame?.values[index] ?? null;
        if (bestValue === null || worstValue === null) return null;
        return `L ${xCenter(index + 1)} ${yForScore(Math.min(bestValue, worstValue))}`;
      }).filter(Boolean).join(' ')} Z`
    : rangePath;
  const averagePath = chart.frames.map((frame, index) => `${index === 0 ? 'M' : 'L'} ${xCenter(frame.frame)} ${yForScore(frame.avg)}`).join(' ');
  const medianPath = chart.frames.map((frame, index) => `${index === 0 ? 'M' : 'L'} ${xCenter(frame.frame)} ${yForScore(frame.median)}`).join(' ');
  const boundaryForFrame = (frame: PlayerScoreHeatmapFrame, index: number) => {
    const bestValue = chart.bestGame?.values[index] ?? null;
    const worstValue = chart.worstGame?.values[index] ?? null;
    if (bestValue !== null && worstValue !== null) {
      return { upper: Math.max(bestValue, worstValue), lower: Math.min(bestValue, worstValue) };
    }
    return { upper: frame.max, lower: frame.min };
  };
  const clampedMedianForFrame = (frame: PlayerScoreHeatmapFrame, index: number) => {
    const boundary = boundaryForFrame(frame, index);
    return Math.min(boundary.upper, Math.max(boundary.lower, frame.median));
  };
  const interpolatedPath = (side: 'upper' | 'lower', innerRatio: number, outerRatio: number) => {
    const innerPoints = chart.frames.map((frame, index) => {
      const boundary = boundaryForFrame(frame, index);
      const medianScore = clampedMedianForFrame(frame, index);
      const edgeScore = side === 'upper' ? boundary.upper : boundary.lower;
      return {
        x: xCenter(frame.frame),
        y: yForScore(medianScore + (edgeScore - medianScore) * innerRatio),
      };
    });
    const outerPoints = chart.frames.map((frame, index) => {
      const boundary = boundaryForFrame(frame, index);
      const medianScore = clampedMedianForFrame(frame, index);
      const edgeScore = side === 'upper' ? boundary.upper : boundary.lower;
      return {
        x: xCenter(frame.frame),
        y: yForScore(medianScore + (edgeScore - medianScore) * outerRatio),
      };
    });

    return `${innerPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} ${outerPoints.slice().reverse().map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
  };
  const heatmapLayers = Array.from({ length: 18 }, (_, index) => {
    const innerRatio = index / 18;
    const outerRatio = (index + 1) / 18;
    const opacity = 0.18 * Math.pow(1 - innerRatio, 1.7);

    return [
      {
        key: `upper-${index}`,
        path: interpolatedPath('upper', innerRatio, outerRatio),
        opacity,
      },
      {
        key: `lower-${index}`,
        path: interpolatedPath('lower', innerRatio, outerRatio),
        opacity,
      },
    ];
  }).flat();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-lane-600">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Häufige Bereiche</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold"><span className="h-0.5 w-4 bg-amber-500" />Durchschnitt</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold"><span className="h-0.5 w-4 bg-green-600" />Bestes Spiel</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold"><span className="h-0.5 w-4 bg-red-600" />Schlechtestes Spiel</span>
      </div>
      <div className="overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] rounded-xl bg-lane-50/80" role="img" aria-label="Heatmap aller Spielverläufe">
          <defs>
            <filter id="scoreHeatSoftBlur" x="-8%" y="-8%" width="116%" height="116%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <clipPath id="scoreHeatRangeClip">
              <path d={bestWorstRangePath} />
            </clipPath>
          </defs>
          <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} fill="var(--surface-soft)" />
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={yForScore(tick)} y2={yForScore(tick)} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={margin.left - 10} y={yForScore(tick) + 4} textAnchor="end" className="fill-lane-500 text-[11px]">{tick}</text>
            </g>
          ))}
          {chart.frames.map((frame) => (
            <g key={frame.frame}>
              <line x1={xCenter(frame.frame)} x2={xCenter(frame.frame)} y1={margin.top} y2={height - margin.bottom} stroke="var(--border)" opacity={0.65} />
              <text x={xCenter(frame.frame)} y={height - 18} textAnchor="middle" className="fill-lane-600 text-[12px]">{frame.frame}</text>
            </g>
          ))}
          {rangePath && <path d={rangePath} fill="#93c5fd" opacity={0.08} />}
          <g clipPath="url(#scoreHeatRangeClip)" filter="url(#scoreHeatSoftBlur)">
            {heatmapLayers.map((layer) => (
              <path key={layer.key} d={layer.path} fill="#2563eb" opacity={layer.opacity} />
            ))}
            <path d={medianPath} fill="none" stroke="#2563eb" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" opacity={0.14} />
          </g>
          <path d={medianPath} fill="none" stroke="transparent" strokeWidth={1} />
          <path d={averagePath} fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          {chart.bestGame && <path d={linePath(chart.bestGame.values)} fill="none" stroke="#16a34a" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><title>{`${chart.bestGame.label}: ${chart.bestGame.total}`}</title></path>}
          {chart.worstGame && <path d={linePath(chart.worstGame.values)} fill="none" stroke="#dc2626" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><title>{`${chart.worstGame.label}: ${chart.worstGame.total}`}</title></path>}
          <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke="var(--muted)" />
          <line x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} stroke="var(--muted)" />
          <text x={width - margin.right} y={height - 4} textAnchor="end" className="fill-lane-500 text-[11px]">Frame</text>
          <text x={14} y={margin.top + 4} textAnchor="start" className="fill-lane-500 text-[11px]">Punkte</text>
        </svg>
      </div>
    </div>
  );
}

export default function PlayerDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const playerName = decodeURIComponent(pathname.split('/').pop() ?? '');
  const { games, loading, mutate } = useGames();
  const [editingName, setEditingName] = useState(playerName);
  const [isEditing, setIsEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showScoreTrend, setShowScoreTrend] = useStickyState<boolean>(`player:${playerName}:showTrend`, true);
  const [expandedGameId, setExpandedGameId] = useStickyState<number | null>(`player:${playerName}:expandedGame`, null);

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
      mutate(refreshedGames);
      setEditingName(result.player_name);
      setIsEditing(false);
      setNotice(result.merged ? 'Spieler wurden zusammengefuehrt.' : 'Spielername aktualisiert.');
      if (result.player_name !== playerName) {
        // Reflect the new name in the URL; playerName is derived from the path.
        router.replace(`/stats/players/${encodeURIComponent(result.player_name)}`);
      }
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
  const advanced = buildPlayerAdvancedStats(games, playerName);
  const trendData = buildPlayerTrendData(games, playerName);
  const scoreHeatmap = buildPlayerScoreHeatmap(games, playerName);
  const gamesPlayed = summary?.gamesPlayed ?? playerGames.length;
  const maxScoreGame = summary ? playerGames.find((game) => game.scores.some((score) => score.player_name === playerName && score.total_score === summary.maxScore)) : null;
  const gameHref = (gameId: number | null | undefined) => gameId == null ? undefined : `/stats/games/${gameId}`;

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <BackButton className="flex items-center gap-1.5 self-start back-button" />

        <SectionCard>
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
                    className="back-button"
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
                    className="back-button"
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
            <CardGrid cols={6} className="mt-4">
              <StatCard label="Spiele" value={summary.gamesPlayed} info="Anzahl gespeicherter Spiele. Je mehr Spiele, desto aussagekräftiger werden Durchschnitt und Prozentwerte." benchmark={{ percent: clampPercent((summary.gamesPlayed / 30) * 100), label: summary.gamesPlayed >= 20 ? 'Sehr belastbar' : summary.gamesPlayed >= 10 ? 'Gute Datenbasis' : 'Noch kleine Stichprobe', detail: 'Skala bis 30 Spiele', tone: summary.gamesPlayed >= 10 ? 'okay' : 'neutral' }} />
              <StatCard label="Siege" value={summary.wins} sub="gewonnene Spiele" info="Zählt Spiele, in denen du den höchsten Score hattest. Bei Gleichstand zählt es ebenfalls als Sieg." benchmark={rateBenchmark(summary.gamesPlayed > 0 ? (summary.wins / summary.gamesPlayed) * 100 : 0, 'win')} />
              <StatCard label="Durchschnitt" value={summary.avgScore} info={playerScoreInfo(summary.avgScore, summary.avgScore, 'average')} benchmark={playerScoreBenchmark(summary.avgScore, summary.avgScore, 'average')} />
              <StatCard label="Median" value={summary.medianScore} sub={`${signedDelta(Math.round((summary.medianScore - summary.avgScore) * 10) / 10)} zu Ø`} info={medianAverageInfo(summary.avgScore, summary.medianScore)} benchmark={medianConsistencyBenchmark(summary.avgScore, summary.medianScore)} />
              <StatCard label="Bestleistung" value={summary.maxScore} href={gameHref(maxScoreGame?.id)} info={playerScoreInfo(summary.maxScore, summary.avgScore, 'peak')} benchmark={playerScoreBenchmark(summary.maxScore, summary.avgScore, 'peak')} />
              <StatCard label="Offene Frames" value={`${summary.openFrameRate}%`} info="Anteil Frames ohne Strike oder Spare. Niedriger ist besser; offene Frames sind die freundliche Punkte-Spende an alle anderen." benchmark={openFrameBenchmark(summary.openFrameRate)} />
            </CardGrid>
          )}
        </SectionCard>

        <StatSection title="Konstanz & Muster" cols={4}>
            <InsightCard
              title="Schlussstärke"
              value={signedDelta(advanced.finishStrength)}
              description="10. Frame vs. Durchschnitt"
              info={finishStrengthInfo(advanced.finishStrength)}
              benchmark={deltaBenchmark(advanced.finishStrength, 'finish')}
            />
            <InsightCard
              title="Ermüdungsfaktor"
              value={formatSignedPercent(advanced.fatigueFactor)}
              description="Spiel 1 vs. spätere Spiele"
              info="Zeigt, wie stark spätere Spiele gegenüber deinem ersten Spiel abfallen. Positive Werte bedeuten Ermüdung, negative Werte bedeuten spätere Steigerung."
              benchmark={deltaBenchmark(advanced.fatigueFactor, 'fatigue')}
            />
            <InsightCard
              title="Strike-Folge"
              value={`${formatCompactPercent(advanced.strikeFollowRate)}%`}
              description="Folge-Strike nach Strike"
              info={strikeFollowInfo(advanced.strikeFollowRate, advanced.bestStrikeStreak)}
              benchmark={rateBenchmark(advanced.strikeFollowRate, 'strikeFollow')}
            />
            <InsightCard
              title="Comeback-Rate"
              value={`${formatCompactPercent(advanced.comebackRate)}%`}
              description="Strike/Spare nach offenem Frame"
              info={summary ? comebackInfo(advanced.comebackRate, summary.openFrameRate) : 'Misst, wie oft nach einem offenen Frame direkt Strike oder Spare folgt. Fehlerverarbeitung statt schöner Ausreden.'}
              benchmark={rateBenchmark(advanced.comebackRate, 'comeback')}
            />
            <InsightCard
              title="Beste Serie"
              value={advanced.bestStrikeStreakLabel}
              description={`${advanced.bestStrikeStreak} Strikes am Stück`}
              info="Deine längste Strike-Serie. Ein Turkey ist der Moment, in dem man kurz so tut, als wäre alles Absicht."
              benchmark={streakBenchmark(advanced.bestStrikeStreak)}
              href={gameHref(advanced.bestStrikeStreakGameId)}
            />
        </StatSection>

        <StatSection title="Würfe & Bilanz" cols={4}>
            <InsightCard
              title="Erster Wurf Ø"
              value={formatOneDecimal(advanced.firstThrowAverage)}
              description="Ø Pins mit dem 1. Wurf"
              info={firstThrowInfo(advanced.firstThrowAverage, advanced.secondThrowZeroRate)}
              benchmark={firstThrowBenchmark(advanced.firstThrowAverage)}
            />
            <InsightCard
              title="Win/Lose"
              value={`${advanced.wins}/${advanced.losses}`}
              description={`${formatCompactPercent(advanced.winRate)}% Win-Rate`}
              info="Direkter Vergleich gegen die anderen Spieler im selben Spiel. Die Prozentzahl ist deine Siegquote."
              benchmark={rateBenchmark(advanced.winRate, 'win')}
            />
            <InsightCard
              title="Strikes gesamt"
              value={String(advanced.totalStrikes)}
              description={`Ø ${formatOneDecimal(advanced.avgPointsPerStrike)} Pins/Strike`}
              info="Gesamtzahl deiner Strike-Frames. Die Leiste bewertet fairer pro Spiel, weil reine Gesamtzahl von der Spielanzahl abhängt."
              benchmark={countPerGameBenchmark(advanced.totalStrikes, gamesPlayed, 'strike')}
            />
            <InsightCard
              title="Spares gesamt"
              value={String(advanced.totalSpares)}
              description={`Ø ${formatOneDecimal(advanced.avgPointsPerSpare)} Pins/Spare`}
              info={summary ? spareInfo(summary.openFrameRate, advanced.secondThrowZeroRate) : spareInfo(0, advanced.secondThrowZeroRate)}
              benchmark={countPerGameBenchmark(advanced.totalSpares, gamesPlayed, 'spare')}
            />
        </StatSection>

        <StatSection title="Sieg-Punkte" cols={4}>
            <InsightCard
              title="Bester Punkt-Sieg"
              value={formatNullableScore(advanced.bestWinningPoints)}
              description="Höchste Punktzahl bei einem Sieg"
              info={advanced.bestWinningPoints === null || !summary ? 'Dein höchster Score in einem Spiel, das du gewonnen hast. Zeigt, wie hoch dein Sieger-Peak war.' : playerScoreInfo(advanced.bestWinningPoints, summary.avgScore, 'winningPeak')}
              benchmark={advanced.bestWinningPoints === null || !summary ? undefined : playerScoreBenchmark(advanced.bestWinningPoints, summary.avgScore, 'winningPeak')}
              href={gameHref(advanced.bestWinningPointsGameId)}
            />
            <InsightCard
              title="Niedrigster Punkt-Sieg"
              value={formatNullableScore(advanced.lowestWinningPoints)}
              description="Niedrigste Punktzahl, die noch gewonnen hat"
              info={advanced.lowestWinningPoints === null || !summary ? 'Der niedrigste Score, der in deinem Feld noch gereicht hat. Das sagt mehr über den Spielkontext als über Peak-Leistung.' : playerScoreInfo(advanced.lowestWinningPoints, summary.avgScore, 'cheapWin')}
              benchmark={advanced.lowestWinningPoints === null || !summary ? undefined : playerScoreBenchmark(advanced.lowestWinningPoints, summary.avgScore, 'cheapWin')}
              href={gameHref(advanced.lowestWinningPointsGameId)}
            />
            <InsightCard
              title="Ø Siegpunkte"
              value={formatNullableScore(advanced.averageWinningPoints)}
              description="Durchschnitt aller gewonnenen Spiele"
              info={advanced.averageWinningPoints === null || !summary ? 'Dein durchschnittlicher Score in gewonnenen Spielen. Das ist deine typische Sieg-Schwelle gegen diese Mitspieler.' : playerScoreInfo(advanced.averageWinningPoints, summary.avgScore, 'winningAverage')}
              benchmark={advanced.averageWinningPoints === null || !summary ? undefined : playerScoreBenchmark(advanced.averageWinningPoints, summary.avgScore, 'winningAverage')}
            />
            <InsightCard
              title="Höchste Niederlage"
              value={formatNullableScore(advanced.highestLosingPoints)}
              description="Beste Punktzahl ohne Sieg"
              info={highestLossInfo(advanced.highestLosingPoints, advanced.averageWinningPoints)}
              benchmark={advanced.highestLosingPoints === null || !summary ? undefined : playerLossScoreBenchmark(advanced.highestLosingPoints, summary.avgScore)}
              href={gameHref(advanced.highestLosingPointsGameId)}
            />
        </StatSection>

        {trendData.length > 1 && (
          <SectionCard padding="md" title="Punkte pro Spiel">
            <ChartFrame height={280}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} label={{ value: 'Spiel #', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    labelFormatter={() => ''}
                    formatter={(value: number) => [value, 'Punkte']}
                  />
                  <Legend onClick={() => setShowScoreTrend((value) => !value)} wrapperStyle={{ cursor: 'pointer' }} />
                  {summary && (
                    <ReferenceLine
                      y={summary.medianScore}
                      stroke="#d97706"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      label={{ value: `Median ${summary.medianScore}`, position: 'insideTopRight', fill: '#92400e', fontSize: 12 }}
                    />
                  )}
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name={playerName} hide={!showScoreTrend} />
                </LineChart>
            </ChartFrame>
          </SectionCard>
        )}

        {scoreHeatmap.frames.some((frame) => frame.samples > 0) && (
          <SectionCard
            padding="md"
            title="Alle Spiele als Score-Heatmap"
            subtitle="Verteilung der kumulativen Punkte pro Frame: Spanne, typische Bereiche, Durchschnitt sowie bestes und schlechtestes Spiel."
          >
            {playerGames.length < 2 ? (
              <p className="text-sm text-lane-600">Für die Heatmap braucht es mindestens zwei Spiele — mit nur einem Spiel gibt es keine Verteilung zu zeigen.</p>
            ) : (
              <PlayerScoreHeatmap chart={scoreHeatmap} />
            )}
          </SectionCard>
        )}

        <SectionCard padding="md" title={`Spiele (${playerGames.length})`}>
          <div className="space-y-2">
            {playerGames.map((game) => (
              <GamePreviewCard
                key={game.id}
                game={game}
                allGames={games}
                highlightPlayer={playerName}
                expanded={expandedGameId === game.id}
                onExpandedChange={(nextExpanded) => setExpandedGameId(nextExpanded ? game.id : null)}
              />
            ))}
          </div>
        </SectionCard>
      </main>
    </>
  );
}
