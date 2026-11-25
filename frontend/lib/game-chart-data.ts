import type { FrameData, GameRead } from '../types';
import { getFrameType, isOpenFrame } from './frame-utils';

export type GameChartPoint = Record<string, string | number>;

export function buildGameChartData(game: GameRead): GameChartPoint[] {
  const frameCount = Math.max(...game.scores.map((s) => s.frames.length), 0);
  const data: GameChartPoint[] = [];
  let cumulativeOpenFrames = 0;
  let cumulativeTotalFrames = 0;

  for (let f = 0; f < frameCount; f++) {
    const point: GameChartPoint = { frame: `${f + 1}`, roundNumber: (f + 1) * 10 };
    for (const score of game.scores) {
      if (f >= score.frames.length) continue;
      const frame = score.frames[f] as FrameData | undefined;
      if (!frame) continue;
      const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
      if (!Number.isNaN(cumulative)) point[score.player_name] = cumulative;
      point[`${score.player_name}_type`] = getFrameType(frame);
      cumulativeTotalFrames++;
      if (isOpenFrame(frame)) cumulativeOpenFrames++;
    }
    point.openFrameRate = cumulativeTotalFrames > 0
      ? Math.round((cumulativeOpenFrames / cumulativeTotalFrames) * 1000) / 10
      : 0;
    data.push(point);
  }
  return data;
}

export function getPersonalBestGame(games: GameRead[], playerName: string): GameRead | null {
  let best: { game: GameRead; score: number } | null = null;
  for (const game of games) {
    const score = game.scores.find((entry) => entry.player_name === playerName);
    if (!score) continue;
    if (!best || score.total_score > best.score) best = { game, score: score.total_score };
  }
  return best?.game ?? null;
}

export function addPersonalBestData(data: GameChartPoint[], game: GameRead, allGames: GameRead[]) {
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
