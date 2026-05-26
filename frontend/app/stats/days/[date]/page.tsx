'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { fetchGames } from '@/lib/api';
import {
  averagePerGameBenchmark,
  benchmarkToneClass,
  dayScoreBenchmark,
  gamesBenchmark,
  highestLossInfo,
  lowestWinInfo,
  playerDayContext,
  totalPinsBenchmark,
  underdogBenchmark,
  type StatBenchmark,
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

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#be123c'];

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
type OpenChartSection = 'cumulative' | 'history' | null;

type WinningPointStats = {
  bestWinningPoints: number | null;
  lowestWinningPoints: number | null;
  averageWinningPoints: number | null;
  highestLosingPoints: number | null;
};

function isOpenFrame(frame: FrameData) {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 !== 'x' && throw2 !== 'x' && throw2 !== '/';
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

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

function formatNullableScore(value: number | null) {
  if (value === null) return '–';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="info-tip-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onBlur={() => setOpen(false)}
        aria-label="Info"
      >
        i
      </button>
      {open && <span className="info-tip-panel">{text}</span>}
    </span>
  );
}

function BenchmarkBar({ benchmark }: { benchmark: StatBenchmark }) {
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-lane-200">
        <div className={`h-full rounded-full ${benchmarkToneClass(benchmark.tone)}`} style={{ width: `${benchmark.percent}%` }} />
      </div>
      <p className="mt-1 text-[0.68rem] font-semibold text-lane-500">
        {benchmark.label}{benchmark.detail ? ` · ${benchmark.detail}` : ''}
      </p>
    </div>
  );
}

function StatCard({ label, value, sub, info, benchmark }: { label: string; value: string | number; sub?: string; info: string; benchmark?: StatBenchmark }) {
  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-lane-600">{label}</p>
        <InfoTip text={info} />
      </div>
      <p className="mt-1 text-lg font-bold text-lane-900">{value}</p>
      {sub && <p className="text-xs text-lane-600">{sub}</p>}
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </div>
  );
}

function computeWinningPointStats(games: GameRead[], playerName?: string): WinningPointStats {
  const winningScores: number[] = [];
  const losingScores: number[] = [];

  for (const game of games) {
    if (game.scores.length === 0) continue;
    const highScore = Math.max(...game.scores.map((score) => score.total_score));

    for (const score of game.scores) {
      if (playerName && score.player_name !== playerName) continue;
      if (score.total_score === highScore) winningScores.push(score.total_score);
      else losingScores.push(score.total_score);
    }
  }

  return {
    bestWinningPoints: winningScores.length > 0 ? Math.max(...winningScores) : null,
    lowestWinningPoints: winningScores.length > 0 ? Math.min(...winningScores) : null,
    averageWinningPoints: winningScores.length > 0 ? Math.round((winningScores.reduce((sum, score) => sum + score, 0) / winningScores.length) * 10) / 10 : null,
    highestLosingPoints: losingScores.length > 0 ? Math.max(...losingScores) : null,
  };
}

function toChartKey(name: string) {
  return `player_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function parseCumulative(frame: FrameData) {
  const value = parseInt(String(frame.cumulative ?? ''), 10);
  return Number.isNaN(value) ? null : value;
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

function ChartModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`chart-toggle rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-lane-700 bg-lane-800 text-white shadow-sm' : 'border-lane-300 bg-white/70 text-lane-700 hover:bg-lane-50'}`}
    >
      {label}
    </button>
  );
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
  const [openChartSection, setOpenChartSection] = useState<OpenChartSection>('cumulative');

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
          <Link href="/stats/games" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
            ← Spiele
          </Link>
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
  const globalAverages = buildGlobalAverageMap(games);
  const underdog = computeDayUnderdog(dayPlayers, globalAverages);
  const dayWinningPointStats = computeWinningPointStats(dayGames);
  const showCumulativeChart = cumulativeDayChart.lines.length > 0 && dayGames.length > 1;
  const showHistoryChart = dayGameHistoryChart.lines.length > 1;
  const visibleChartCount = Number(showCumulativeChart) + Number(showHistoryChart);
  const effectiveOpenChartSection = visibleChartCount === 1
    ? showCumulativeChart ? 'cumulative' : 'history'
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
        <Link href="/stats/games" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
          ← Spiele
        </Link>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h1 className="text-2xl font-bold text-lane-900">{date}</h1>
          <p className="text-sm text-lane-600 mt-2">{dayGames.length} Spiel{dayGames.length !== 1 ? 'e' : ''} · Ort: {dayGames[0].location}</p>
          
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Gesamtpunkte" value={totalPins} info="Alle Pins des Tages zusammen. Viel Zahl heißt nicht automatisch Kunst, aber immerhin viel Lärm auf der Bahn." benchmark={totalPinsBenchmark(totalPins, dayPlayers.length, dayGames.length)} />
            <StatCard label="Spiele" value={dayGames.length} info="Anzahl Spiele an diesem Tag. Je mehr Spiele, desto weniger kann man alles auf 'war nur Warmwerfen' schieben." benchmark={gamesBenchmark(dayGames.length)} />
            <StatCard label="Ø pro Spiel" value={avgPinsPerGame} info="Gesamtpins pro Spiel über alle Spieler. Pro Kopf betrachtet zeigt es, ob der Abend sportlich war oder nur betreutes Kugelrollen." benchmark={averagePerGameBenchmark(avgPinsPerGame, dayPlayers.length)} />
            <StatCard label="Underdog des Abends" value={underdog?.name ?? 'Nicht genug Daten'} sub={underdog ? `${signedPercent(underdog.upliftPercent)} vs Ø (${underdog.dayAverage} / ${underdog.globalAverage})` : undefined} info="Wer heute am stärksten über dem eigenen Schnitt gespielt hat. Also: wer plötzlich so tat, als wäre das normal." benchmark={underdogBenchmark(underdog)} />
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

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h2 className="text-lg font-semibold text-lane-800">Sieg- und Verlierer-Punkte des Spieltags</h2>
          <p className="mt-1 text-xs text-lane-600">Interessant für den Abend: zeigt, welche Punktzahl heute für Siege reichte und wie hoch die stärkste Niederlage war.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Bester Sieg" value={formatNullableScore(dayWinningPointStats.bestWinningPoints)} info="Höchster Score, der heute ein Spiel gewonnen hat. Das ist der Abend-Peak — die Stelle, an der jemand kurz unangenehm gut war." benchmark={dayScoreBenchmark(dayWinningPointStats.bestWinningPoints)} />
            <StatCard label="Niedrigster Sieg" value={formatNullableScore(dayWinningPointStats.lowestWinningPoints)} info={lowestWinInfo(dayWinningPointStats.lowestWinningPoints, dayWinningPointStats.highestLosingPoints)} benchmark={dayScoreBenchmark(dayWinningPointStats.lowestWinningPoints)} />
            <StatCard label="Ø Siegpunkte" value={formatNullableScore(dayWinningPointStats.averageWinningPoints)} info="Durchschnitt aller Sieg-Scores heute. Das ist die Tages-Schwelle zwischen 'gewonnen' und 'nett versucht'." benchmark={dayScoreBenchmark(dayWinningPointStats.averageWinningPoints)} />
            <StatCard label="Höchste Niederlage" value={formatNullableScore(dayWinningPointStats.highestLosingPoints)} info={highestLossInfo(dayWinningPointStats.highestLosingPoints, dayWinningPointStats.averageWinningPoints)} benchmark={dayScoreBenchmark(dayWinningPointStats.highestLosingPoints)} />
          </div>
        </div>

        {showCumulativeChart && (
          <section className="group rounded-[1.3rem] border border-lane-200 bg-white/90">
            <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-4 p-5 text-left" onClick={() => toggleChartSection('cumulative')}>
              <div>
                <h2 className="text-lg font-semibold text-lane-800">Kumulative Punkte über den Spielabend</h2>
              </div>
              <span className={`mt-1 text-sm font-bold text-lane-500 transition ${effectiveOpenChartSection === 'cumulative' ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {effectiveOpenChartSection === 'cumulative' && <div className="px-5 pb-5">
              <div className="mb-4 flex flex-wrap justify-end gap-2">
                <ChartModeButton active={cumulativeChartMode === 'frames'} label="Jedes Frame" onClick={() => setCumulativeChartMode('frames')} />
                <ChartModeButton active={cumulativeChartMode === 'rounds'} label="Nur Endpunkte" onClick={() => setCumulativeChartMode('rounds')} />
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

        {showHistoryChart && (
          <section className="group rounded-[1.3rem] border border-lane-200 bg-white/90">
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
