import type { GameRead } from '@/types';
import { isOpenFrame, median, getPlayerGames } from '@/lib/frame-utils';

export type PlayerSummary = {
  name: string;
  gamesPlayed: number;
  wins: number;
  avgScore: number;
  medianScore: number;
  maxScore: number;
  lastPlayed: string;
  totalPins: number;
  openFrameRate: number;
};

export function derivePlayerSummaries(games: GameRead[]): PlayerSummary[] {
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
      totalPins: scores.reduce((a, b) => a + b, 0),
      openFrameRate: totalFrames > 0 ? Math.round((openFrames / totalFrames) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

export function buildPlayerTrendData(games: GameRead[], playerName: string): Record<string, string | number>[] {
  return getPlayerGames(games, playerName)
    .slice()
    .sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id - b.id)
    .map((game, i) => ({
      label: `${game.played_at}\n${game.location}`,
      index: i + 1,
      roundNumber: (i + 1) * 10,
      score: game.scores.find((s) => s.player_name === playerName)?.total_score ?? 0,
    }));
}
