import type { FrameData, GameRead } from '@/types';
import { calculateGameExcitement } from '@/lib/excitement';

type FrameType = 'strike' | 'spare' | 'open';

export type GamePlayerReport = {
  playerName: string;
  totalScore: number;
  strikes: number;
  spares: number;
  openFrames: number;
  cleanFrameRate: number;
  frame10Score: number | null;
  bestFrame: { frame: number; score: number } | null;
  worstFrame: { frame: number; score: number } | null;
  consistency: number | null;
};

export type GameReport = {
  story: string;
  winner: string | null;
  leaderAfterFrame9: string | null;
  biggestLead: { playerName: string; margin: number; frame: number } | null;
  closestMoment: { margin: number; frame: number } | null;
  comeback: { playerName: string; pins: number } | null;
  decidingFrame: number | null;
  frame10Clutch: { playerName: string; score: number | null; totalScore: number }[];
  players: GamePlayerReport[];
};

function parseCumulative(frame: FrameData | undefined): number | null {
  if (!frame) return null;
  const value = parseInt(String(frame.cumulative ?? ''), 10);
  return Number.isNaN(value) ? null : value;
}

function getFrameType(frame: FrameData): FrameType {
  if (String(frame.throw1).trim().toLowerCase() === 'x' || String(frame.throw2).trim().toLowerCase() === 'x') return 'strike';
  if (String(frame.throw2).trim() === '/') return 'spare';
  return 'open';
}

function getFrameContribution(frames: FrameData[], frameIndex: number): number | null {
  const current = parseCumulative(frames[frameIndex]);
  if (current === null) return null;
  const previous = frameIndex > 0 ? parseCumulative(frames[frameIndex - 1]) : 0;
  if (previous === null) return null;
  return current - previous;
}

function getFrameScores(game: GameRead, frameIndex: number): { playerName: string; score: number }[] {
  return game.scores.flatMap((score) => {
    const cumulative = parseCumulative((score.frames as FrameData[])[frameIndex]);
    return cumulative === null ? [] : [{ playerName: score.player_name, score: cumulative }];
  });
}

function getUniqueLeader(scores: { playerName: string; score: number }[]): { playerName: string; score: number } | null {
  if (scores.length === 0) return null;
  const sorted = scores.slice().sort((a, b) => b.score - a.score);
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) return null;
  return sorted[0];
}

function getLeadMargin(scores: { playerName: string; score: number }[]): { playerName: string; margin: number } | null {
  if (scores.length < 2) return null;
  const sorted = scores.slice().sort((a, b) => b.score - a.score);
  return { playerName: sorted[0].playerName, margin: sorted[0].score - sorted[1].score };
}

function getStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

function getDecidingFrame(game: GameRead, winner: string | null): number | null {
  if (!winner) return null;
  const leaders = Array.from({ length: 10 }, (_, frameIndex) => getUniqueLeader(getFrameScores(game, frameIndex))?.playerName ?? null);

  for (let frameIndex = 0; frameIndex < leaders.length; frameIndex++) {
    if (leaders[frameIndex] !== winner) continue;
    const lostLeadLater = leaders.slice(frameIndex + 1).some((leader) => leader !== null && leader !== winner);
    if (!lostLeadLater) return frameIndex + 1;
  }

  return null;
}

function buildStory(report: Omit<GameReport, 'story'>): string {
  if (!report.winner) return 'Das Spiel endet ohne eindeutigen Sieger.';

  const parts: string[] = [`${report.winner} gewinnt das Spiel.`];

  if (report.leaderAfterFrame9 && report.leaderAfterFrame9 !== report.winner) {
    parts.push(`${report.leaderAfterFrame9} führte noch nach Frame 9, wurde aber im Finale abgefangen.`);
  } else if (report.decidingFrame) {
    parts.push(`Die entscheidende Führung kam ab Frame ${report.decidingFrame}.`);
  }

  if (report.comeback && report.comeback.pins > 0) {
    parts.push(`${report.comeback.playerName} holte zwischenzeitlich ${report.comeback.pins} Pins Rückstand auf.`);
  }

  if (report.closestMoment) {
    parts.push(`Am knappsten war es nach Frame ${report.closestMoment.frame} mit nur ${report.closestMoment.margin} Pins Abstand.`);
  }

  return parts.join(' ');
}

export function buildGameReport(game: GameRead): GameReport | null {
  if (game.scores.length === 0) return null;

  const excitement = calculateGameExcitement(game);
  const finalScores = game.scores.map((score) => ({ playerName: score.player_name, score: score.total_score }));
  const winner = getUniqueLeader(finalScores)?.playerName ?? null;
  const leaderAfterFrame9 = getUniqueLeader(getFrameScores(game, 8))?.playerName ?? null;

  let biggestLead: GameReport['biggestLead'] = null;
  let closestMoment: GameReport['closestMoment'] = null;
  const worstDeficitByPlayer = new Map<string, number>();

  for (let frameIndex = 0; frameIndex < 10; frameIndex++) {
    const frameScores = getFrameScores(game, frameIndex);
    const lead = getLeadMargin(frameScores);

    if (lead && (!biggestLead || lead.margin > biggestLead.margin)) {
      biggestLead = { playerName: lead.playerName, margin: lead.margin, frame: frameIndex + 1 };
    }

    if (lead && lead.margin > 0 && (!closestMoment || lead.margin < closestMoment.margin)) {
      closestMoment = { margin: lead.margin, frame: frameIndex + 1 };
    }

    const leaderScore = Math.max(...frameScores.map((score) => score.score), 0);
    for (const score of frameScores) {
      const deficit = Math.max(0, leaderScore - score.score);
      worstDeficitByPlayer.set(score.playerName, Math.max(worstDeficitByPlayer.get(score.playerName) ?? 0, deficit));
    }
  }

  const comeback = winner
    ? { playerName: winner, pins: worstDeficitByPlayer.get(winner) ?? 0 }
    : null;
  const decidingFrame = getDecidingFrame(game, winner);

  const players = game.scores.map((score) => {
    const frames = score.frames as FrameData[];
    const frameScores = frames.slice(0, 10).map((_, frameIndex) => getFrameContribution(frames, frameIndex)).filter((value): value is number => value !== null);
    const bestFrameScore = frameScores.length ? Math.max(...frameScores) : null;
    const worstFrameScore = frameScores.length ? Math.min(...frameScores) : null;
    const types = frames.slice(0, 10).map(getFrameType);

    return {
      playerName: score.player_name,
      totalScore: score.total_score,
      strikes: types.filter((type) => type === 'strike').length,
      spares: types.filter((type) => type === 'spare').length,
      openFrames: types.filter((type) => type === 'open').length,
      cleanFrameRate: Math.round(((types.length - types.filter((type) => type === 'open').length) / Math.max(types.length, 1)) * 1000) / 10,
      frame10Score: getFrameContribution(frames, 9),
      bestFrame: bestFrameScore === null ? null : { frame: frameScores.indexOf(bestFrameScore) + 1, score: bestFrameScore },
      worstFrame: worstFrameScore === null ? null : { frame: frameScores.indexOf(worstFrameScore) + 1, score: worstFrameScore },
      consistency: getStandardDeviation(frameScores),
    } satisfies GamePlayerReport;
  });

  const reportWithoutStory = {
    winner,
    leaderAfterFrame9,
    biggestLead,
    closestMoment,
    comeback,
    decidingFrame,
    frame10Clutch: players
      .map((player) => ({ playerName: player.playerName, score: player.frame10Score, totalScore: player.totalScore }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    players: players.sort((a, b) => b.totalScore - a.totalScore),
  } satisfies Omit<GameReport, 'story'>;

  return {
    ...reportWithoutStory,
    story: buildStory(reportWithoutStory),
  };
}
