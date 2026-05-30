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
} from 'recharts';
import { PLAYER_COLORS } from '@/lib/constants';
import { type FrameType, getFrameType, isOpenFrame } from '@/lib/frame-utils';
import { PinDot, PIN_LEGEND } from '@/components/pin-dot';
import ScoreTable from '@/components/score-table';
import ChartToggle from '@/components/ui/chart-toggle';
import ChartFrame from '@/components/ui/chart-frame';

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
        <ChartFrame height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
              <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
              <Tooltip labelFormatter={() => ''} itemSorter={(item) => -Number(item.value ?? 0)} />
              <Legend onClick={(entry) => toggleLegendLine(entry.dataKey)} wrapperStyle={{ cursor: 'pointer' }} />
              {showRoundNumber && <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" tooltipType="none" legendType="none" hide={hiddenLines.has('roundNumber')} />}
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
        </ChartFrame>
      </div>
      <ScoreTable game={game} />
    </div>
  );
}
