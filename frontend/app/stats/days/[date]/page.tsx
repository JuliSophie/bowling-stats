'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import GamePreviewCard from '@/components/game-preview-card';
import { fetchGames } from '@/lib/api';
import {
  averagePerGameBenchmark,
  dayLossScoreBenchmark,
  dayScoreBenchmark,
  gamesBenchmark,
  highestLossInfo,
  lowestWinInfo,
  playerDayContext,
  totalPinsBenchmark,
  underdogBenchmark,
} from '@/lib/trash-talk';
import type { FrameData, GameRead } from '@/types';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PLAYER_COLORS } from '@/lib/constants';
import { type FrameType, getFrameType, isOpenFrame, median, parseCumulative, formatNullableScore } from '@/lib/frame-utils';
import InfoTip from '@/components/ui/info-tip';
import BenchmarkBar from '@/components/ui/benchmark-bar';
import { StatCard } from '@/components/ui/stat-card';
import ChartToggle from '@/components/ui/chart-toggle';

type DayPlayerStats = {
  name: string;
  totalPins: number;
  gamesCount: number;
  wins: number;
  avgScore: number;
  medianScore: number;
  openFrameRate: number;
};

type DayUnderdog = {
  name: string;
  dayAverage: number;
  globalAverage: number;
  upliftPercent: number;
};

type CumulativeChartMode = 'frames' | 'rounds';
type OpenChartSection = 'cumulative' | 'difference' | 'history' | null;

type WinningPointStats = {
  bestWinning: WinningPointEntry | null;
  lowestWinning: WinningPointEntry | null;
  averageWinningPoints: number | null;
  highestLosing: WinningPointEntry | null;
};

type WinningPointEntry = {
  points: number;
  playerName: string;
  gameId: number;
  gameLabel: string;
};

function computeDayPlayerStats(games: GameRead[]): DayPlayerStats[] {
  const map = new Map<string, { pins: number; games: number; wins: number; scores: number[]; openFrames: number; totalFrames: number }>();
  
  for (const game of games) {
    const highScore = Math.max(...game.scores.map((score) => score.total_score));
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { pins: 0, games: 0, wins: 0, scores: [], openFrames: 0, totalFrames: 0 };
      entry.pins += score.total_score;
      entry.games++;
      entry.scores.push(score.total_score);
      entry.openFrames += score.frames.filter(isOpenFrame).length;
      entry.totalFrames += score.frames.length;
      if (score.total_score === highScore) entry.wins++;
      map.set(score.player_name, entry);
    }
  }

  return [...map.entries()]
    .map(([name, { pins, games, wins, scores, openFrames, totalFrames }]) => ({
      name,
      totalPins: pins,
      gamesCount: games,
      wins,
      avgScore: Math.round((pins / games) * 10) / 10,
      medianScore: Math.round(median(scores) * 10) / 10,
      openFrameRate: totalFrames > 0 ? Math.round((openFrames / totalFrames) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.totalPins - a.totalPins);
}

type DayPlayerAnalysis = {
  name: string;
  totalScore: number;
  games: number;
  strikes: number;
  spares: number;
  openFrames: number;
  cleanFrameRate: number;
  bestFrame: { score: number; game: number; frame: number } | null;
  avgFirstThrow: number;
  consistency: number | null;
};

function computeDayPlayerAnalysis(dayGames: GameRead[]): DayPlayerAnalysis[] {
  const sorted = dayGames.slice().sort((a, b) => a.id - b.id);
  const map = new Map<string, { totalScore: number; games: number; strikes: number; spares: number; openFrames: number; totalFrames: number; bestFrame: { score: number; game: number; frame: number } | null; firstThrows: number[]; frameScores: number[] }>();

  sorted.forEach((game, gameIndex) => {
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { totalScore: 0, games: 0, strikes: 0, spares: 0, openFrames: 0, totalFrames: 0, bestFrame: null, firstThrows: [], frameScores: [] };
      entry.totalScore += score.total_score;
      entry.games++;
      const frames = score.frames as FrameData[];
      let prevCum = 0;

      for (let f = 0; f < frames.length; f++) {
        const ft = getFrameType(frames[f]);
        if (ft === 'strike') entry.strikes++;
        else if (ft === 'spare') entry.spares++;
        else entry.openFrames++;
        entry.totalFrames++;

        const t1 = String(frames[f].throw1 ?? '').trim().toLowerCase();
        if (t1 === 'x') entry.firstThrows.push(10);
        else { const n = parseInt(t1, 10); if (!Number.isNaN(n)) entry.firstThrows.push(n); }

        const cum = parseCumulative(frames[f]);
        if (cum !== null) {
          const contribution = cum - prevCum;
          entry.frameScores.push(contribution);
          if (!entry.bestFrame || contribution > entry.bestFrame.score) {
            entry.bestFrame = { score: contribution, game: gameIndex + 1, frame: f + 1 };
          }
          prevCum = cum;
        }
      }

      map.set(score.player_name, entry);
    }
  });

  return [...map.entries()].map(([name, d]) => {
    const avg = d.frameScores.length > 0 ? d.frameScores.reduce((a, b) => a + b, 0) / d.frameScores.length : 0;
    const variance = d.frameScores.length > 1 ? d.frameScores.reduce((sum, v) => sum + (v - avg) ** 2, 0) / d.frameScores.length : null;
    return {
      name,
      totalScore: d.totalScore,
      games: d.games,
      strikes: d.strikes,
      spares: d.spares,
      openFrames: d.openFrames,
      cleanFrameRate: d.totalFrames > 0 ? Math.round(((d.totalFrames - d.openFrames) / d.totalFrames) * 1000) / 10 : 0,
      bestFrame: d.bestFrame,
      avgFirstThrow: d.firstThrows.length > 0 ? Math.round((d.firstThrows.reduce((a, b) => a + b, 0) / d.firstThrows.length) * 10) / 10 : 0,
      consistency: variance !== null ? Math.round(Math.sqrt(variance) * 10) / 10 : null,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

function buildGlobalAverageMap(games: GameRead[]) {
  const map = new Map<string, { sum: number; count: number }>();
  for (const game of games) {
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { sum: 0, count: 0 };
      entry.sum += score.total_score;
      entry.count += 1;
      map.set(score.player_name, entry);
    }
  }

  const avgMap = new Map<string, number>();
  for (const [name, { sum, count }] of map.entries()) {
    avgMap.set(name, count > 0 ? sum / count : 0);
  }
  return avgMap;
}

function computeDayUnderdog(dayPlayers: DayPlayerStats[], globalAverages: Map<string, number>): DayUnderdog | null {
  if (dayPlayers.length === 0) return null;

  let best: DayUnderdog | null = null;
  for (const player of dayPlayers) {
    const globalAverage = globalAverages.get(player.name) ?? 0;
    if (globalAverage <= 0) continue;

    const upliftPercent = ((player.avgScore - globalAverage) / globalAverage) * 100;
    if (!best || upliftPercent > best.upliftPercent) {
      best = {
        name: player.name,
        dayAverage: player.avgScore,
        globalAverage: Math.round(globalAverage * 10) / 10,
        upliftPercent: Math.round(upliftPercent * 10) / 10,
      };
    }
  }

  return best;
}

function signedPercent(value: number) {
  if (value === 0) return '±0%';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function computeWinningPointStats(games: GameRead[], playerName?: string): WinningPointStats {
  const winningEntries: WinningPointEntry[] = [];
  const losingEntries: WinningPointEntry[] = [];

  for (const [gameIndex, game] of games.entries()) {
    if (game.scores.length === 0) continue;
    const highScore = Math.max(...game.scores.map((score) => score.total_score));

    for (const score of game.scores) {
      if (playerName && score.player_name !== playerName) continue;
      const entry = {
        points: score.total_score,
        playerName: score.player_name,
        gameId: game.id,
        gameLabel: `Spiel ${gameIndex + 1}`,
      };
      if (score.total_score === highScore) winningEntries.push(entry);
      else losingEntries.push(entry);
    }
  }

  const winningScores = winningEntries.map((entry) => entry.points);
  const bestWinning = winningEntries.reduce<WinningPointEntry | null>((best, entry) => (!best || entry.points > best.points ? entry : best), null);
  const lowestWinning = winningEntries.reduce<WinningPointEntry | null>((lowest, entry) => (!lowest || entry.points < lowest.points ? entry : lowest), null);
  const highestLosing = losingEntries.reduce<WinningPointEntry | null>((highest, entry) => (!highest || entry.points > highest.points ? entry : highest), null);

  return {
    bestWinning,
    lowestWinning,
    averageWinningPoints: winningScores.length > 0 ? Math.round((winningScores.reduce((sum, score) => sum + score, 0) / winningScores.length) * 10) / 10 : null,
    highestLosing,
  };
}

function toChartKey(name: string) {
  return `player_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildCumulativeDayChart(games: GameRead[], mode: CumulativeChartMode) {
  const sortedGames = games.slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id);
  const playerColorIndex = new Map<string, number>();
  const playerKeys = new Map<string, string>();
  const runningTotals = new Map<string, number>();
  const data: Record<string, string | number>[] = [];

  sortedGames.forEach((game) => {
    game.scores.forEach((score) => {
      if (!playerColorIndex.has(score.player_name)) playerColorIndex.set(score.player_name, playerColorIndex.size);
      if (!playerKeys.has(score.player_name)) playerKeys.set(score.player_name, toChartKey(score.player_name));
    });
  });

  sortedGames.forEach((game, gameIndex) => {
    const scoreMap = new Map(game.scores.map((score) => [score.player_name, score]));

    if (mode === 'frames') {
      const frameCount = Math.max(...game.scores.map((score) => score.frames.length), 0);
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const point: Record<string, string | number> = {
          label: `S${gameIndex + 1} F${frameIndex + 1}`,
          step: data.length + 1,
          game: `Spiel ${gameIndex + 1}`,
          frame: frameIndex + 1,
          location: game.location,
        };

        for (const [playerName, key] of playerKeys.entries()) {
          const base = runningTotals.get(playerName);
          const score = scoreMap.get(playerName);
          if (score) {
            const cumulative = score.frames[frameIndex] ? parseCumulative(score.frames[frameIndex] as FrameData) : null;
            point[key] = (base ?? 0) + (cumulative ?? 0);
          } else if (base !== undefined) {
            point[key] = base;
          }
        }

        data.push(point);
      }
    }

    for (const score of game.scores) {
      runningTotals.set(score.player_name, (runningTotals.get(score.player_name) ?? 0) + score.total_score);
    }

    if (mode === 'rounds') {
      const point: Record<string, string | number> = {
        label: `Spiel ${gameIndex + 1}`,
        step: gameIndex + 1,
        game: `Spiel ${gameIndex + 1}`,
        location: game.location,
      };

      for (const [playerName, key] of playerKeys.entries()) {
        const total = runningTotals.get(playerName);
        if (total !== undefined) point[key] = total;
      }

      data.push(point);
    }
  });

  const lines = [...playerColorIndex.entries()].map(([name, index]) => ({
    key: playerKeys.get(name) ?? toChartKey(name),
    name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
  }));

  return { data, lines };
}

function buildScoreDifferenceDayChart(games: GameRead[], mode: CumulativeChartMode) {
  const cumulativeChart = buildCumulativeDayChart(games, mode);
  const data = cumulativeChart.data.map((point) => {
    const playerValues = cumulativeChart.lines
      .map((line) => ({ key: line.key, value: typeof point[line.key] === 'number' ? point[line.key] as number : null }))
      .filter((item): item is { key: string; value: number } => item.value !== null);

    if (playerValues.length === 0) return { ...point };

    const leadingScore = Math.max(...playerValues.map((item) => item.value));
    const differencePoint: Record<string, string | number> = { ...point };
    for (const { key, value } of playerValues) {
      differencePoint[key] = value - leadingScore;
    }
    return differencePoint;
  });

  return { data, lines: cumulativeChart.lines };
}

function buildDayGameHistoryChart(games: GameRead[]) {
  const sortedGames = games.slice().sort((a, b) => a.id - b.id);
  const playerColorIndex = new Map<string, number>();
  const lines: { key: string; name: string; color: string; playerName: string }[] = [];
  const data: Record<string, string | number>[] = Array.from({ length: 10 }, (_, frameIndex) => ({ frame: `${frameIndex + 1}`, roundNumber: (frameIndex + 1) * 10 }));
  const rangeValues = new Map<string, { min: number[]; max: number[] }>();

  sortedGames.forEach((game, gameIndex) => {
    game.scores.forEach((score) => {
      if (!playerColorIndex.has(score.player_name)) playerColorIndex.set(score.player_name, playerColorIndex.size);
      const colorIndex = playerColorIndex.get(score.player_name) ?? 0;
      const key = `game_${game.id}_${score.player_name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push({ key, name: `Spiel ${gameIndex + 1} · ${score.player_name}`, color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length], playerName: score.player_name });
      const range = rangeValues.get(score.player_name) ?? { min: Array(10).fill(Number.POSITIVE_INFINITY), max: Array(10).fill(Number.NEGATIVE_INFINITY) };

      score.frames.forEach((frame, frameIndex) => {
        const cumulative = parseInt(String((frame as FrameData).cumulative ?? ''), 10);
        if (!Number.isNaN(cumulative) && data[frameIndex]) {
          data[frameIndex][key] = cumulative;
          range.min[frameIndex] = Math.min(range.min[frameIndex], cumulative);
          range.max[frameIndex] = Math.max(range.max[frameIndex], cumulative);
        }
      });
      rangeValues.set(score.player_name, range);
    });
  });

  const legend = [...playerColorIndex.entries()].map(([name, index]) => ({ name, color: PLAYER_COLORS[index % PLAYER_COLORS.length] }));
  const ranges = legend.map((item) => {
    const lowKey = `range_${item.name}_low`.replace(/[^a-zA-Z0-9_]/g, '_');
    const diffKey = `range_${item.name}_diff`.replace(/[^a-zA-Z0-9_]/g, '_');
    const range = rangeValues.get(item.name);
    if (range) {
      range.min.forEach((min, frameIndex) => {
        const max = range.max[frameIndex];
        if (Number.isFinite(min) && Number.isFinite(max)) {
          data[frameIndex][lowKey] = min;
          data[frameIndex][diffKey] = max - min;
        }
      });
    }
    return { playerName: item.name, color: item.color, lowKey, diffKey };
  });
  return { data, lines, legend, ranges };
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
  const [cumulativeChartMode, setCumulativeChartMode] = useState<CumulativeChartMode>('frames');
  const [differenceChartMode, setDifferenceChartMode] = useState<CumulativeChartMode>('frames');
  const [openChartSection, setOpenChartSection] = useState<OpenChartSection>('cumulative');
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);

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
          <BackButton fallbackHref="/stats/games" className="flex items-center gap-1.5 self-start back-button" />
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-center">
            <p className="text-sm text-lane-600">Keine Spiele für diesen Tag gefunden.</p>
          </div>
        </main>
      </>
    );
  }

  const dayPlayers = computeDayPlayerStats(dayGames);
  const totalPins = dayPlayers.reduce((sum, p) => sum + p.totalPins, 0);
  const avgPinsPerGame = Math.round((totalPins / dayGames.length) * 10) / 10;
  const dayGameHistoryChart = buildDayGameHistoryChart(dayGames);
  const cumulativeDayChart = buildCumulativeDayChart(dayGames, cumulativeChartMode);
  const scoreDifferenceDayChart = buildScoreDifferenceDayChart(dayGames, differenceChartMode);
  const globalAverages = buildGlobalAverageMap(games);
  const underdog = computeDayUnderdog(dayPlayers, globalAverages);
  const dayPlayerAnalysis = computeDayPlayerAnalysis(dayGames);
  const dayWinningPointStats = computeWinningPointStats(dayGames);
  const bestWinningPoints = dayWinningPointStats.bestWinning?.points ?? null;
  const lowestWinningPoints = dayWinningPointStats.lowestWinning?.points ?? null;
  const highestLosingPoints = dayWinningPointStats.highestLosing?.points ?? null;
  const showCumulativeChart = cumulativeDayChart.lines.length > 0 && dayGames.length > 1;
  const showDifferenceChart = scoreDifferenceDayChart.lines.length > 1 && dayGames.length > 1;
  const showHistoryChart = dayGameHistoryChart.lines.length > 1;
  const visibleChartCount = Number(showCumulativeChart) + Number(showDifferenceChart) + Number(showHistoryChart);
  const effectiveOpenChartSection = visibleChartCount === 1
    ? showCumulativeChart ? 'cumulative' : showDifferenceChart ? 'difference' : 'history'
    : openChartSection;

  const toggleChartSection = (section: OpenChartSection) => {
    if (visibleChartCount <= 1) {
      setOpenChartSection(section);
      return;
    }
    setOpenChartSection(openChartSection === section ? null : section);
  };

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
        <BackButton fallbackHref="/stats/games" className="flex items-center gap-1.5 self-start back-button" />

        <div className="section-card p-5">
          <h1 className="text-2xl font-bold text-lane-900">{date}</h1>
          <p className="text-sm text-lane-600 mt-2">{dayGames.length} Spiel{dayGames.length !== 1 ? 'e' : ''} · Ort: {dayGames[0].location}</p>
          
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Gesamtpunkte" value={totalPins} info="Alle Pins des Tages zusammen. Viel Zahl heißt nicht automatisch Kunst, aber immerhin viel Lärm auf der Bahn." benchmark={totalPinsBenchmark(totalPins, dayPlayers.length, dayGames.length)} />
            <StatCard label="Spiele" value={dayGames.length} info="Anzahl Spiele an diesem Tag. Je mehr Spiele, desto weniger kann man alles auf 'war nur Warmwerfen' schieben." benchmark={gamesBenchmark(dayGames.length)} />
            <StatCard label="Ø pro Spiel" value={avgPinsPerGame} info="Gesamtpins pro Spiel über alle Spieler. Pro Kopf betrachtet zeigt es, ob der Abend sportlich war oder nur betreutes Kugelrollen." benchmark={averagePerGameBenchmark(avgPinsPerGame, dayPlayers.length)} />
            <StatCard label="Underdog des Abends" value={underdog?.name ?? 'Nicht genug Daten'} sub={underdog ? `${signedPercent(underdog.upliftPercent)} vs Ø (${underdog.dayAverage} / ${underdog.globalAverage})` : undefined} info="Wer heute am stärksten über dem eigenen Schnitt gespielt hat. Also: wer plötzlich so tat, als wäre das normal." benchmark={underdogBenchmark(underdog)} />
          </div>
        </div>

        <div className="section-card p-5">
          <h2 className="text-lg font-semibold text-lane-800 mb-4">Spieler ({dayPlayers.length})</h2>
          <div className="space-y-3">
            {dayPlayers.map((player, i) => (
              <Link key={player.name} href={`/stats/players/${encodeURIComponent(player.name)}`} className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${i === 0 ? 'winner-card' : 'border-lane-200 bg-lane-50 hover:bg-white'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-lane-900">{i + 1}.</span>
                    <span className="text-base font-semibold text-lane-900">{player.name}</span>
                    {i === 0 && <span className="text-sm">👑</span>}
                  </div>
                  <p className="text-xs text-lane-600 mt-1">{player.gamesCount} Spiel{player.gamesCount !== 1 ? 'e' : ''} · Median {player.medianScore} · {player.openFrameRate}% offen</p>
                  <p className="mt-1 text-xs font-semibold text-lane-500">{playerDayContext(player, dayPlayers, i, globalAverages.get(player.name))}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-lane-900">{player.totalPins} Pins</p>
                  <p className="text-xs text-lane-600">{player.wins} Sieg{player.wins !== 1 ? 'e' : ''} · ⌀ {player.avgScore}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {dayPlayerAnalysis.length > 0 && (
          <div className="section-card p-5">
            <h2 className="text-lg font-semibold text-lane-800 mb-4">Spieler-Analyse</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-lane-500">
                    <th className="px-2 py-1.5">Spieler</th>
                    <th className="px-2 py-1.5 text-center">Spiele</th>
                    <th className="px-2 py-1.5 text-center">X</th>
                    <th className="px-2 py-1.5 text-center">/</th>
                    <th className="px-2 py-1.5 text-center">Offen</th>
                    <th className="px-2 py-1.5 text-center">Clean %</th>
                    <th className="px-2 py-1.5 text-center">1. Wurf Ø</th>
                    <th className="px-2 py-1.5 text-center">Bestes Frame</th>
                    <th className="px-2 py-1.5 text-center">Std.Abw.</th>
                  </tr>
                </thead>
                <tbody>
                  {dayPlayerAnalysis.map((player, index) => (
                    <tr key={player.name} className={`border-t border-lane-100 text-lane-800 ${index === 0 ? 'font-semibold' : ''}`}>
                      <td className="px-2 py-2 font-semibold whitespace-nowrap">{index === 0 ? '👑 ' : ''}{player.name}</td>
                      <td className="px-2 py-2 text-center">{player.games}</td>
                      <td className="px-2 py-2 text-center">{player.strikes}</td>
                      <td className="px-2 py-2 text-center">{player.spares}</td>
                      <td className="px-2 py-2 text-center">{player.openFrames}</td>
                      <td className="px-2 py-2 text-center">{player.cleanFrameRate}%</td>
                      <td className="px-2 py-2 text-center">{player.avgFirstThrow}</td>
                      <td className="px-2 py-2 text-center">{player.bestFrame ? `${player.bestFrame.score} · S${player.bestFrame.game} F${player.bestFrame.frame}` : '–'}</td>
                      <td className="px-2 py-2 text-center">{player.consistency ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="section-card p-5">
          <h2 className="text-lg font-semibold text-lane-800">Sieg- und Verlierer-Punkte des Spieltags</h2>
          <p className="mt-1 text-xs text-lane-600">Interessant für den Abend: zeigt, welche Punktzahl heute für Siege reichte und wie hoch die stärkste Niederlage war.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Bester Sieg"
              value={formatNullableScore(bestWinningPoints)}
              sub={dayWinningPointStats.bestWinning ? `${dayWinningPointStats.bestWinning.playerName} · ${dayWinningPointStats.bestWinning.gameLabel}` : undefined}
              info="Höchster Score, der heute ein Spiel gewonnen hat. Das ist der Abend-Peak — die Stelle, an der jemand kurz unangenehm gut war."
              benchmark={dayScoreBenchmark(bestWinningPoints)}
              href={dayWinningPointStats.bestWinning ? `/stats/games/${dayWinningPointStats.bestWinning.gameId}` : undefined}
            />
            <StatCard
              label="Niedrigster Sieg"
              value={formatNullableScore(lowestWinningPoints)}
              sub={dayWinningPointStats.lowestWinning ? `${dayWinningPointStats.lowestWinning.playerName} · ${dayWinningPointStats.lowestWinning.gameLabel}` : undefined}
              info={lowestWinInfo(lowestWinningPoints, highestLosingPoints)}
              benchmark={dayScoreBenchmark(lowestWinningPoints)}
              href={dayWinningPointStats.lowestWinning ? `/stats/games/${dayWinningPointStats.lowestWinning.gameId}` : undefined}
            />
            <StatCard label="Ø Siegpunkte" value={formatNullableScore(dayWinningPointStats.averageWinningPoints)} info="Durchschnitt aller Sieg-Scores heute. Das ist die Tages-Schwelle zwischen 'gewonnen' und 'nett versucht'." benchmark={dayScoreBenchmark(dayWinningPointStats.averageWinningPoints)} />
            <StatCard
              label="Höchste Niederlage"
              value={formatNullableScore(highestLosingPoints)}
              sub={dayWinningPointStats.highestLosing ? `${dayWinningPointStats.highestLosing.playerName} · ${dayWinningPointStats.highestLosing.gameLabel}` : undefined}
              info={highestLossInfo(highestLosingPoints, dayWinningPointStats.averageWinningPoints)}
              benchmark={dayLossScoreBenchmark(highestLosingPoints)}
              href={dayWinningPointStats.highestLosing ? `/stats/games/${dayWinningPointStats.highestLosing.gameId}` : undefined}
            />
          </div>
        </div>

        {showCumulativeChart && (
          <section className="group section-card">
            <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-4 p-5 text-left" onClick={() => toggleChartSection('cumulative')}>
              <div>
                <h2 className="text-lg font-semibold text-lane-800">Kumulative Punkte über den Spielabend</h2>
              </div>
              <span className={`mt-1 text-sm font-bold text-lane-500 transition ${effectiveOpenChartSection === 'cumulative' ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {effectiveOpenChartSection === 'cumulative' && <div className="px-5 pb-5">
              <div className="mb-4 flex flex-wrap justify-end gap-2">
                <ChartToggle active={cumulativeChartMode === 'frames'} label="Jedes Frame" onClick={() => setCumulativeChartMode('frames')} />
                <ChartToggle active={cumulativeChartMode === 'rounds'} label="Nur Endpunkte" onClick={() => setCumulativeChartMode('rounds')} />
              </div>
              <div className="mb-3 flex flex-wrap gap-2 text-xs text-lane-600">
                {cumulativeDayChart.lines.map((line) => (
                  <span key={line.key} className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
                    {line.name}
                  </span>
                ))}
              </div>
              <div style={{ touchAction: 'none' }}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cumulativeDayChart.data} margin={{ top: 12, right: 24, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} label={{ value: cumulativeChartMode === 'frames' ? 'Spiel / Frame' : 'Spiel im Tagesverlauf', position: 'insideBottomRight', offset: -5 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    <Tooltip
                      labelFormatter={(_, payload) => {
                        const item = payload?.[0]?.payload as Record<string, string | number> | undefined;
                        if (!item) return '';
                        return cumulativeChartMode === 'frames' ? `${item.game} · Frame ${item.frame} · ${item.location}` : `${item.game} · ${item.location}`;
                      }}
                      formatter={(value: number, name: string) => [value, cumulativeDayChart.lines.find((line) => line.key === name)?.name ?? name]}
                    />
                    {cumulativeDayChart.lines.map((line) => (
                      <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2.4} dot={cumulativeChartMode === 'rounds' ? { r: 4 } : false} activeDot={{ r: 6 }} name={line.name} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>}
          </section>
        )}

        {showDifferenceChart && (
          <section className="group section-card">
            <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-4 p-5 text-left" onClick={() => toggleChartSection('difference')}>
              <div>
                <h2 className="text-lg font-semibold text-lane-800">Punkteabstand über den Spielabend</h2>
                <p className="mt-1 text-xs text-lane-600">Zeigt den Abstand zur jeweils führenden Person. Die Führung liegt bei 0, Rückstände sind negativ.</p>
              </div>
              <span className={`mt-1 text-sm font-bold text-lane-500 transition ${effectiveOpenChartSection === 'difference' ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {effectiveOpenChartSection === 'difference' && <div className="px-5 pb-5">
              <div className="mb-4 flex flex-wrap justify-end gap-2">
                <ChartToggle active={differenceChartMode === 'frames'} label="Jedes Frame" onClick={() => setDifferenceChartMode('frames')} />
                <ChartToggle active={differenceChartMode === 'rounds'} label="Nur Endpunkte" onClick={() => setDifferenceChartMode('rounds')} />
              </div>
              <div className="mb-3 flex flex-wrap gap-2 text-xs text-lane-600">
                {scoreDifferenceDayChart.lines.map((line) => (
                  <span key={line.key} className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-lane-50 px-3 py-1.5 font-semibold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
                    {line.name}
                  </span>
                ))}
              </div>
              <div style={{ touchAction: 'none' }}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={scoreDifferenceDayChart.data} margin={{ top: 12, right: 24, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} label={{ value: differenceChartMode === 'frames' ? 'Spiel / Frame' : 'Spiel im Tagesverlauf', position: 'insideBottomRight', offset: -5 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={['dataMin - 10', 0]} />
                    <Tooltip
                      labelFormatter={(_, payload) => {
                        const item = payload?.[0]?.payload as Record<string, string | number> | undefined;
                        if (!item) return '';
                        return differenceChartMode === 'frames' ? `${item.game} · Frame ${item.frame} · ${item.location}` : `${item.game} · ${item.location}`;
                      }}
                      formatter={(value: number, name: string) => [value === 0 ? 'Führung' : `${value}`, scoreDifferenceDayChart.lines.find((line) => line.key === name)?.name ?? name]}
                    />
                    {scoreDifferenceDayChart.lines.map((line) => (
                      <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2.4} dot={differenceChartMode === 'rounds' ? { r: 4 } : false} activeDot={{ r: 6 }} name={line.name} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>}
          </section>
        )}

        {showHistoryChart && (
          <section className="group section-card">
            <button type="button" className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left" onClick={() => toggleChartSection('history')}>
              <h2 className="text-lg font-semibold text-lane-800">Alle Spielverläufe des Tages</h2>
              <span className={`text-sm font-bold text-lane-500 transition ${effectiveOpenChartSection === 'history' ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {effectiveOpenChartSection === 'history' && <div className="px-5 pb-5">
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
                  <ComposedChart data={dayGameHistoryChart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    {dayGameHistoryChart.ranges.flatMap((range) => [
                      <Area key={range.lowKey} type="monotone" dataKey={range.lowKey} stackId={`range-${range.playerName}`} stroke="none" fill="transparent" hide={hiddenDayPlayers.has(range.playerName)} name={`${range.playerName} Untergrenze`} />,
                      <Area key={range.diffKey} type="monotone" dataKey={range.diffKey} stackId={`range-${range.playerName}`} stroke="none" fill={range.color} fillOpacity={0.12} hide={hiddenDayPlayers.has(range.playerName)} name={`${range.playerName} Spielbereich`} />,
                    ])}
                    <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" tooltipType="none" />
                    {dayGameHistoryChart.lines.map((line) => (
                      <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={1.8} dot={false} activeDot={false} name={line.name} opacity={0.48} hide={hiddenDayPlayers.has(line.playerName)} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>}
          </section>
        )}

        <div className="section-card p-5">
          <h2 className="text-lg font-semibold text-lane-800 mb-4">Spiele ({dayGames.length})</h2>
          <div className="space-y-2">
            {dayGames.map((game, index) => (
              <GamePreviewCard
                key={game.id}
                game={game}
                allGames={games}
                label={`Spiel ${index + 1}`}
                showDate={false}
                expanded={expandedGameId === game.id}
                onExpandedChange={(nextExpanded) => setExpandedGameId(nextExpanded ? game.id : null)}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
