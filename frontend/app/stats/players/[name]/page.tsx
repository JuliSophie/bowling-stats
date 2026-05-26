'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { fetchGames, renamePlayer } from '@/lib/api';
import {
  benchmarkToneClass,
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
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type PlayerSummary = {
  name: string;
  gamesPlayed: number;
  wins: number;
  avgScore: number;
  medianScore: number;
  maxScore: number;
  lastPlayed: string;
  openFrameRate: number;
};

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

function signedDelta(value: number) {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : String(value);
}

function parseThrowPins(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === '-' || text === 'f') return 0;
  if (text === 'x') return 10;
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isStrikeFrame(frame: FrameData) {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 === 'x' || throw2 === 'x';
}

function isSpareFrame(frame: FrameData) {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 !== 'x' && throw2 !== 'x' && throw2 === '/';
}

function getFirstThrowPins(frame: FrameData) {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  if (!throw1 && throw2 === 'x') return 10;
  return parseThrowPins(frame.throw1);
}

function getFramePoints(frame: FrameData, previousCumulative: number) {
  const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
  if (Number.isNaN(cumulative)) return null;
  return cumulative - previousCumulative;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(average(values) * 10) / 10;
}

function formatNullableScore(value: number | null) {
  if (value === null) return '–';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  let secondThrowAttempts = 0;
  let secondThrowZeroes = 0;

  for (const game of playerGames) {
    const playerScore = game.scores.find((score) => score.player_name === playerName);
    if (!playerScore) continue;

    const highScore = Math.max(...game.scores.map((score) => score.total_score));
    if (playerScore.total_score === highScore) {
      wins++;
      winningScores.push(playerScore.total_score);
    } else {
      losses++;
      losingScores.push(playerScore.total_score);
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
        if (runningStrikeStreak > bestStrikeStreak) bestStrikeStreak = runningStrikeStreak;
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
    lowestWinningPoints: winningScores.length > 0 ? Math.min(...winningScores) : null,
    averageWinningPoints: averageOrNull(winningScores),
    highestLosingPoints: losingScores.length > 0 ? Math.max(...losingScores) : null,
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

function derivePlayerSummaries(games: GameRead[]): PlayerSummary[] {
  const map = new Map<string, { scores: number[]; wins: number; lastPlayed: string; openFrames: number; totalFrames: number }>();
  for (const game of games) {
    const highScore = Math.max(...game.scores.map((score) => score.total_score));
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { scores: [], wins: 0, lastPlayed: game.played_at, openFrames: 0, totalFrames: 0 };
      entry.scores.push(score.total_score);
      if (score.total_score === highScore) entry.wins++;
      entry.openFrames += score.frames.filter(isOpenFrame).length;
      entry.totalFrames += score.frames.length;
      if (game.played_at > entry.lastPlayed) entry.lastPlayed = game.played_at;
      map.set(score.player_name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, { scores, wins, lastPlayed, openFrames, totalFrames }]) => ({
      name,
      gamesPlayed: scores.length,
      wins,
      avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      medianScore: Math.round(median(scores) * 10) / 10,
      maxScore: Math.max(...scores),
      lastPlayed,
      openFrameRate: totalFrames > 0 ? Math.round((openFrames / totalFrames) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

function getPlayerGames(games: GameRead[], playerName: string): GameRead[] {
  return games.filter((g) => g.scores.some((s) => s.player_name === playerName));
}

function buildPlayerTrendData(games: GameRead[], playerName: string): Record<string, string | number>[] {
  return getPlayerGames(games, playerName)
    .slice()
    .sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id)
    .map((game, i) => ({
      label: `${game.played_at}\n${game.location}`,
      index: i + 1,
      score: game.scores.find((s) => s.player_name === playerName)?.total_score ?? 0,
    }));
}

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#be123c'];

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

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);

  const positionPanel = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const margin = 16;
    const width = Math.min(256, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
    if (rect.bottom + 190 > window.innerHeight && rect.top > window.innerHeight / 2) {
      setPanelPosition({ left, bottom: window.innerHeight - rect.top + 8, width });
    } else {
      setPanelPosition({ left, top: rect.bottom + 8, width });
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="info-tip-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) positionPanel(event.currentTarget);
          setOpen((value) => !value);
        }}
        onBlur={() => {
          setOpen(false);
          setPanelPosition(null);
        }}
        aria-label="Info"
      >
        i
      </button>
      {open && panelPosition && createPortal(
        <span className="info-tip-panel" style={{ left: panelPosition.left, top: panelPosition.top, bottom: panelPosition.bottom, width: panelPosition.width }}>
          {text}
        </span>,
        document.body,
      )}
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

function StatCard({ label, value, sub, info, benchmark }: { label: string; value: string | number; sub?: string; info?: string; benchmark?: StatBenchmark }) {
  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-lane-600">{label}</p>
        {info && <InfoTip text={info} />}
      </div>
      <p className="mt-1 text-lg font-bold text-lane-900">{value}</p>
      {sub && <p className="text-xs text-lane-400">{sub}</p>}
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </div>
  );
}

function InsightCard({ title, value, description, info, benchmark }: { title: string; value: string; description: string; info: string; benchmark?: StatBenchmark }) {
  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-xs font-semibold text-lane-600">{title}</p>
        <InfoTip text={info} />
      </div>
      <p className="mt-1 text-2xl font-black text-lane-900">{value}</p>
      <p className="mt-1 text-xs text-lane-500">{description}</p>
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </div>
  );
}

export default function PlayerDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showScoreTrend, setShowScoreTrend] = useState(true);

  useEffect(() => {
    params.then(({ name }) => {
      const decodedName = decodeURIComponent(name);
      setPlayerName(decodedName);
      setEditingName(decodedName);
      fetchGames().then(setGames).finally(() => setLoading(false));
    });
  }, [params]);

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
      setGames(refreshedGames);
      setPlayerName(result.player_name);
      setEditingName(result.player_name);
      setIsEditing(false);
      setNotice(result.merged ? 'Spieler wurden zusammengefuehrt.' : 'Spielername aktualisiert.');
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
  const gameHistoryChart = buildPlayerGameHistoryChart(games, playerName);
  const gamesPlayed = summary?.gamesPlayed ?? playerGames.length;

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <Link href="/" className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70">
          ← Home
        </Link>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
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
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
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
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
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
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Spiele" value={summary.gamesPlayed} info="Anzahl gespeicherter Spiele. Je mehr Spiele, desto aussagekräftiger werden Durchschnitt und Prozentwerte." benchmark={{ percent: clampPercent((summary.gamesPlayed / 30) * 100), label: summary.gamesPlayed >= 20 ? 'Sehr belastbar' : summary.gamesPlayed >= 10 ? 'Gute Datenbasis' : 'Noch kleine Stichprobe', detail: 'Skala bis 30 Spiele', tone: summary.gamesPlayed >= 10 ? 'okay' : 'neutral' }} />
              <StatCard label="Siege" value={summary.wins} sub="gewonnene Spiele" info="Zählt Spiele, in denen du den höchsten Score hattest. Bei Gleichstand zählt es ebenfalls als Sieg." benchmark={rateBenchmark(summary.gamesPlayed > 0 ? (summary.wins / summary.gamesPlayed) * 100 : 0, 'win')} />
              <StatCard label="Durchschnitt" value={summary.avgScore} info={playerScoreInfo(summary.avgScore, summary.avgScore, 'average')} benchmark={playerScoreBenchmark(summary.avgScore, summary.avgScore, 'average')} />
              <StatCard label="Median" value={summary.medianScore} sub={`${signedDelta(Math.round((summary.medianScore - summary.avgScore) * 10) / 10)} zu Ø`} info={medianAverageInfo(summary.avgScore, summary.medianScore)} benchmark={medianConsistencyBenchmark(summary.avgScore, summary.medianScore)} />
              <StatCard label="Bestleistung" value={summary.maxScore} info={playerScoreInfo(summary.maxScore, summary.avgScore, 'peak')} benchmark={playerScoreBenchmark(summary.maxScore, summary.avgScore, 'peak')} />
              <StatCard label="Offene Frames" value={`${summary.openFrameRate}%`} info="Anteil Frames ohne Strike oder Spare. Niedriger ist besser; offene Frames sind die freundliche Punkte-Spende an alle anderen." benchmark={openFrameBenchmark(summary.openFrameRate)} />
            </div>
          )}
        </div>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <h2 className="text-lg font-semibold text-lane-800">Konstanz & Muster</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InsightCard
              title="Bester Punkt-Sieg"
              value={formatNullableScore(advanced.bestWinningPoints)}
              description="Höchste Punktzahl bei einem Sieg"
              info={advanced.bestWinningPoints === null || !summary ? 'Dein höchster Score in einem Spiel, das du gewonnen hast. Zeigt, wie hoch dein Sieger-Peak war.' : playerScoreInfo(advanced.bestWinningPoints, summary.avgScore, 'winningPeak')}
              benchmark={advanced.bestWinningPoints === null || !summary ? undefined : playerScoreBenchmark(advanced.bestWinningPoints, summary.avgScore, 'winningPeak')}
            />
            <InsightCard
              title="Niedrigster Punkt-Sieg"
              value={formatNullableScore(advanced.lowestWinningPoints)}
              description="Niedrigste Punktzahl, die noch gewonnen hat"
              info={advanced.lowestWinningPoints === null || !summary ? 'Der niedrigste Score, der in deinem Feld noch gereicht hat. Das sagt mehr über den Spielkontext als über Peak-Leistung.' : playerScoreInfo(advanced.lowestWinningPoints, summary.avgScore, 'cheapWin')}
              benchmark={advanced.lowestWinningPoints === null || !summary ? undefined : playerScoreBenchmark(advanced.lowestWinningPoints, summary.avgScore, 'cheapWin')}
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
            />
          </div>
        </div>

        {trendData.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
            <h2 className="mb-3 text-lg font-semibold text-lane-800">Punkte pro Spiel</h2>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} label={{ value: 'Spiel #', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    labelFormatter={() => ''}
                    formatter={(value: number) => [value, 'Punkte']}
                  />
                  <Legend onClick={() => setShowScoreTrend((value) => !value)} wrapperStyle={{ cursor: 'pointer' }} />
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name={playerName} hide={!showScoreTrend} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {gameHistoryChart.lines.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-lane-800">Alle Spiele</h2>
            </div>
            <div style={{ touchAction: 'none' }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={gameHistoryChart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                  <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                  <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" tooltipType="none" />
                  {gameHistoryChart.lines.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={1.7} dot={false} activeDot={false} name={line.name} opacity={0.35} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
          <h2 className="mb-3 text-lg font-semibold text-lane-800">Spiele ({playerGames.length})</h2>
          <div className="space-y-2">
            {playerGames.map((game) => {
              const playerScore = game.scores.find((s) => s.player_name === playerName);
              const maxScore = Math.max(...game.scores.map((s) => s.total_score));
              const isWinner = playerScore?.total_score === maxScore;
              
              return (
                <Link key={game.id} href={`/stats/games/${game.id}`}
                  className="block rounded-lg border border-lane-200 p-3 transition hover:bg-lane-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-lane-900">{game.location}</p>
                      <p className="text-xs text-lane-600 mt-1">{game.played_at}</p>
                    </div>
                    <div className={`text-right ${isWinner ? 'text-lane-900 font-bold' : 'text-lane-700'}`}>
                      <p className="text-sm">{playerScore?.total_score} Punkte</p>
                      {isWinner && <p className="text-xs text-amber-600">🏆 Gewinner</p>}
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
