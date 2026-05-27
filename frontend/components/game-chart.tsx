'use client';

import { useState } from 'react';
import type { FrameData, GameRead } from '@/types';
import {
  Line,
  LineChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type FrameType = 'strike' | 'spare' | 'normal';

function getFrameType(frame: FrameData): FrameType {
  if (String(frame.throw1).trim().toLowerCase() === 'x' || String(frame.throw2).trim().toLowerCase() === 'x') return 'strike';
  if (String(frame.throw2).trim() === '/') return 'spare';
  return 'normal';
}

function isOpenFrame(frame: FrameData) {
  return getFrameType(frame) === 'normal';
}

function PinDot({ cx, cy, payload, dataKey, stroke }: {
  cx?: number; cy?: number; payload?: Record<string, string | number>; dataKey?: string; stroke?: string;
}) {
  if (cx == null || cy == null || !payload || !dataKey) return null;
  const frameType = payload[`${dataKey}_type`] as FrameType | undefined;

  if (frameType === 'strike') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <ellipse cx={0} cy={2} rx={4} ry={3} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <ellipse cx={0} cy={-3} rx={2.8} ry={2.8} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <rect x={-1.2} y={-1} width={2.4} height={3} fill="#FFD700" rx={0.5} />
      </g>
    );
  }

  if (frameType === 'spare') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <ellipse cx={0} cy={2} rx={3.5} ry={2.5} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <ellipse cx={0} cy={-2.5} rx={2.4} ry={2.4} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <rect x={-1} y={-0.5} width={2} height={2.5} fill="#C0C0C0" rx={0.5} />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={4} fill={stroke} />;
}

const PIN_LEGEND = (
  <div className="flex items-center gap-4 text-xs text-lane-600">
    <span className="flex items-center gap-1.5">
      <svg width="14" height="16" viewBox="-6 -7 12 14">
        <ellipse cx={0} cy={2} rx={4} ry={3} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <ellipse cx={0} cy={-3} rx={2.8} ry={2.8} fill="#FFD700" stroke="#B8860B" strokeWidth={0.8} />
        <rect x={-1.2} y={-1} width={2.4} height={3} fill="#FFD700" rx={0.5} />
      </svg>
      Strike
    </span>
    <span className="flex items-center gap-1.5">
      <svg width="14" height="16" viewBox="-6 -7 12 14">
        <ellipse cx={0} cy={2} rx={3.5} ry={2.5} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <ellipse cx={0} cy={-2.5} rx={2.4} ry={2.4} fill="#C0C0C0" stroke="#808080" strokeWidth={0.8} />
        <rect x={-1} y={-0.5} width={2} height={2.5} fill="#C0C0C0" rx={0.5} />
      </svg>
      Spare
    </span>
  </div>
);

function ScoreTable({ game }: { game: GameRead }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-left font-semibold text-lane-800">Name</th>
            {Array.from({ length: 10 }, (_, i) => (
              <th key={i} className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">{i + 1}</th>
            ))}
            <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">Ges.</th>
          </tr>
        </thead>
        <tbody>
          {game.scores.map((score) => {
            const frames = score.frames as FrameData[];
            return (
              <tr key={score.player_name}>
                <td className="whitespace-nowrap border border-lane-200 px-2 py-1 font-medium text-lane-900">{score.player_name}</td>
                {Array.from({ length: 10 }, (_, fIdx) => {
                  const frame = frames[fIdx];
                  if (!frame) return <td key={fIdx} className="border border-lane-200" />;
                  const ft = getFrameType(frame);
                  const bgClass = ft === 'strike' ? 'bg-amber-200/60' : ft === 'spare' ? 'bg-slate-200/60' : '';
                  return (
                    <td key={fIdx} className={`border border-lane-200 px-0 py-0 ${bgClass}`}>
                      <div className="flex border-b border-lane-100">
                        <span className="w-1/2 border-r border-lane-100 px-1 py-0.5 text-center">{frame.throw1}</span>
                        <span className="w-1/2 px-1 py-0.5 text-center">{frame.throw2}</span>
                        {fIdx === 9 && <span className="w-1/2 border-l border-lane-100 px-1 py-0.5 text-center">{frame.throw3}</span>}
                      </div>
                      <div className="px-1 py-0.5 text-center text-lane-600">{frame.cumulative}</div>
                    </td>
                  );
                })}
                <td className="border border-lane-200 px-2 py-1 text-center font-semibold text-lane-900">{score.total_score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildGameChartData(game: GameRead): Record<string, string | number>[] {
  const frameCount = Math.max(...game.scores.map((s) => s.frames.length), 0);
  const data: Record<string, string | number>[] = [];
  let cumulativeOpenFrames = 0;
  let cumulativeTotalFrames = 0;
  for (let f = 0; f < frameCount; f++) {
    const point: Record<string, string | number> = { frame: `${f + 1}`, roundNumber: (f + 1) * 10 };
    for (const score of game.scores) {
      if (f < score.frames.length) {
        const frame = score.frames[f] as FrameData;
        const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
        if (!Number.isNaN(cumulative)) point[score.player_name] = cumulative;
        point[`${score.player_name}_type`] = getFrameType(frame);
        cumulativeTotalFrames++;
        if (isOpenFrame(frame)) cumulativeOpenFrames++;
      }
    }
    point.openFrameRate = cumulativeTotalFrames > 0 ? Math.round((cumulativeOpenFrames / cumulativeTotalFrames) * 1000) / 10 : 0;
    data.push(point);
  }
  return data;
}

function getPersonalBestGame(games: GameRead[], playerName: string): GameRead | null {
  let best: { game: GameRead; score: number } | null = null;
  for (const game of games) {
    const score = game.scores.find((entry) => entry.player_name === playerName);
    if (!score) continue;
    if (!best || score.total_score > best.score) best = { game, score: score.total_score };
  }
  return best?.game ?? null;
}

function addPersonalBestData(data: Record<string, string | number>[], game: GameRead, allGames: GameRead[]) {
  for (const score of game.scores) {
    const personalBestGame = getPersonalBestGame(allGames, score.player_name);
    const personalBestScore = personalBestGame?.scores.find((entry) => entry.player_name === score.player_name);
    if (!personalBestScore) continue;

    for (let f = 0; f < data.length; f++) {
      const frame = personalBestScore.frames[f] as FrameData | undefined;
      if (!frame) continue;
      const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
      if (!Number.isNaN(cumulative)) data[f][`${score.player_name} PB`] = cumulative;
    }
  }
}

function ChartToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`chart-toggle rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'border-lane-700 bg-lane-800 text-white shadow-sm'
          : 'border-lane-300 bg-white/70 text-lane-700 hover:bg-lane-50'
      }`}
    >
      {label}
    </button>
  );
}

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777'];

export default function GameChart({ game, allGames, highlightPlayer }: { game: GameRead; allGames?: GameRead[]; highlightPlayer?: string }) {
  const [showRoundNumber, setShowRoundNumber] = useState(true);
  const [showOpenFrames, setShowOpenFrames] = useState(false);
  const [showPersonalBestGame, setShowPersonalBestGame] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(() => new Set());
  const chartData = buildGameChartData(game);
  if (allGames) addPersonalBestData(chartData, game, allGames);

  const toggleLegendLine = (dataKey: unknown) => {
    if (typeof dataKey !== 'string' && typeof dataKey !== 'number') return;
    const key = String(dataKey);
    setHiddenLines((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {PIN_LEGEND}
          <div className="flex flex-wrap gap-2">
            <ChartToggle active={showRoundNumber} label="Rundenzahl" onClick={() => setShowRoundNumber((value) => !value)} />
            <ChartToggle active={showOpenFrames} label="Offene Frames" onClick={() => setShowOpenFrames((value) => !value)} />
            {allGames && <ChartToggle active={showPersonalBestGame} label="PB Game" onClick={() => setShowPersonalBestGame((value) => !value)} />}
          </div>
        </div>
        <div style={{ touchAction: 'none' }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
              <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
              <Tooltip labelFormatter={() => ''} />
              <Legend onClick={(entry) => toggleLegendLine(entry.dataKey)} wrapperStyle={{ cursor: 'pointer' }} />
              {showRoundNumber && <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Rundenzahl" tooltipType="none" hide={hiddenLines.has('roundNumber')} />}
              {showOpenFrames && <Line type="stepAfter" dataKey="openFrameRate" stroke="#f97316" strokeWidth={2} strokeDasharray="3 4" dot={false} name="Offene Frames %" hide={hiddenLines.has('openFrameRate')} />}
              {game.scores.map((score, i) => {
                const highlighted = !highlightPlayer || score.player_name === highlightPlayer;
                return (
                  <Line
                    key={score.player_name}
                    type="monotone"
                    dataKey={score.player_name}
                    stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                    strokeWidth={highlighted ? 2.8 : 1.6}
                    dot={<PinDot />}
                    activeDot={{ r: 6 }}
                    opacity={highlighted ? 1 : 0.4}
                    hide={hiddenLines.has(score.player_name)}
                  />
                );
              })}
              {allGames && showPersonalBestGame && game.scores.map((score, i) => (
                <Line
                  key={`${score.player_name}-pb`}
                  type="monotone"
                  dataKey={`${score.player_name} PB`}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                  name={`${score.player_name} PB Game`}
                  opacity={0.55}
                  hide={hiddenLines.has(`${score.player_name} PB`)}
                />
              ))}
              {game.scores.map((score, i) => (
                <ReferenceLine
                  key={`${score.player_name}-final`}
                  y={score.total_score}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeDasharray="3 3"
                  strokeOpacity={0.35}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ScoreTable game={game} />
    </div>
  );
}
