import type { FrameData, GameRead } from '@/types';
import { isOpenFrame, median, getPlayerGames } from '@/lib/frame-utils';

export type PinMode = 'first' | 'second' | 'total';

export type PinFrequencies = {
  /** Frames that carried per-pin data (denominator for first-ball & total rates). */
  framesWithData: number;
  /** Frames that had a recorded second ball. */
  secondThrowFrames: number;
  /** Per pin (index 0 = pin 1), 0..1: knocked down by the FIRST ball. */
  firstThrowRate: number[];
  /** Per pin, 0..1: conversion on the SECOND ball — knocked / times it was standing after ball 1.
   *  null when that pin was never left standing (so there's nothing to convert). */
  secondThrowRate: (number | null)[];
  /** Per pin, 0..1: knocked down by the END of the frame (any ball). */
  totalRate: number[];
};

/**
 * Aggregate per-pin outcomes for a player across their games, for three views:
 *  - first:  knock-down rate on ball 1 (the carry)
 *  - second: spare conversion — of the frames where a pin stood after ball 1, how often ball 2 got it
 *  - total:  knocked down by the end of the frame (any ball)
 * Only frames with recorded pin data count, so OCR games (no pin data) are simply ignored.
 */
export function derivePinFrequencies(games: GameRead[], playerName: string): PinFrequencies {
  const firstKnocked = new Array(10).fill(0);
  const totalKnocked = new Array(10).fill(0);
  const secondConverted = new Array(10).fill(0);
  const standingAfterFirst = new Array(10).fill(0);
  let framesWithData = 0;
  let secondThrowFrames = 0;

  for (const game of getPlayerGames(games, playerName)) {
    const score = game.scores.find((s) => s.player_name === playerName);
    if (!score) continue;
    for (const frame of score.frames as FrameData[]) {
      const balls = frame?.fallenPins;
      if (!balls || !balls[0]) continue; // no pin data for this frame
      framesWithData++;
      const ball1 = new Set(balls[0]);
      const secondBall = balls[1];
      if (Array.isArray(secondBall)) secondThrowFrames++;
      const ball2 = new Set(secondBall ?? []);
      const union = new Set<number>();
      balls.forEach((ball) => ball?.forEach((p) => union.add(p)));

      for (let pin = 1; pin <= 10; pin++) {
        if (ball1.has(pin)) firstKnocked[pin - 1]++;
        if (union.has(pin)) totalKnocked[pin - 1]++;
        if (!ball1.has(pin)) {
          standingAfterFirst[pin - 1]++;
          if (ball2.has(pin)) secondConverted[pin - 1]++;
        }
      }
    }
  }

  const rate = (knocked: number[]) => knocked.map((n) => (framesWithData > 0 ? n / framesWithData : 0));
  return {
    framesWithData,
    secondThrowFrames,
    firstThrowRate: rate(firstKnocked),
    totalRate: rate(totalKnocked),
    secondThrowRate: secondConverted.map((n, i) => (standingAfterFirst[i] > 0 ? n / standingAfterFirst[i] : null)),
  };
}

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
