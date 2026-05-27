import type { FrameData, GameRead, StoredScore } from '@/types';

export type GameExcitement = {
  leadChanges: number;
  gapAfterFrame9: number;
  finalGap: number;
  dynamics: number;
  bonus: number;
  dramaFactor: number;
  tensionIndex: number;
  leaderAfterFrame9: string | null;
  winner: string | null;
};

function parseCumulative(frame: FrameData | undefined): number | null {
  if (!frame) return null;
  const value = parseInt(String(frame.cumulative ?? ''), 10);
  return Number.isNaN(value) ? null : value;
}

function getUniqueLeader(scores: { playerName: string; score: number }[]): string | null {
  if (scores.length === 0) return null;
  const sorted = scores.slice().sort((a, b) => b.score - a.score);
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) return null;
  return sorted[0].playerName;
}

function getTopTwoGap(scores: { playerName: string; score: number }[]): number | null {
  if (scores.length < 2) return null;
  const sorted = scores.slice().sort((a, b) => b.score - a.score);
  return Math.abs(sorted[0].score - sorted[1].score);
}

function getFrameScores(game: GameRead, frameIndex: number): { playerName: string; score: number }[] {
  return game.scores.flatMap((score) => {
    const cumulative = parseCumulative((score.frames as FrameData[])[frameIndex]);
    return cumulative === null ? [] : [{ playerName: score.player_name, score: cumulative }];
  });
}

function getFinalScores(scores: StoredScore[]): { playerName: string; score: number }[] {
  return scores.map((score) => ({ playerName: score.player_name, score: score.total_score }));
}

export function calculateGameExcitement(game: GameRead): GameExcitement | null {
  if (game.scores.length < 2) return null;

  let leadChanges = 0;
  let previousLeader: string | null = null;

  for (let frameIndex = 0; frameIndex < 10; frameIndex++) {
    const leader = getUniqueLeader(getFrameScores(game, frameIndex));
    if (!leader) continue;
    if (previousLeader && previousLeader !== leader) leadChanges++;
    previousLeader = leader;
  }

  const frame9Scores = getFrameScores(game, 8);
  const finalScores = getFinalScores(game.scores);
  const gapAfterFrame9 = getTopTwoGap(frame9Scores);
  const finalGap = getTopTwoGap(finalScores);
  const leaderAfterFrame9 = getUniqueLeader(frame9Scores);
  const winner = getUniqueLeader(finalScores);

  if (gapAfterFrame9 === null || finalGap === null) return null;

  const dynamics = gapAfterFrame9 > finalGap ? (gapAfterFrame9 - finalGap) / 10 : 0;
  const bonus = leaderAfterFrame9 && winner && leaderAfterFrame9 !== winner ? 2.0 : 0.0;
  const dramaFactor = dynamics + bonus;
  const tensionIndex = ((leadChanges + 1) / (finalGap + 1)) * (1 + dramaFactor);

  return {
    leadChanges,
    gapAfterFrame9,
    finalGap,
    dynamics: Math.round(dynamics * 100) / 100,
    bonus,
    dramaFactor: Math.round(dramaFactor * 100) / 100,
    tensionIndex: Math.round(tensionIndex * 100) / 100,
    leaderAfterFrame9,
    winner,
  };
}

export function formatTensionIndex(value: number): string {
  return value.toFixed(2);
}
