import type { FrameData, GameRead } from '@/types';

export type FrameType = 'strike' | 'spare' | 'normal';

export function getFrameType(frame: FrameData): FrameType {
  if (String(frame.throw1).trim().toLowerCase() === 'x' || String(frame.throw2).trim().toLowerCase() === 'x') return 'strike';
  if (String(frame.throw2).trim() === '/') return 'spare';
  return 'normal';
}

export function isOpenFrame(frame: FrameData): boolean {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 !== 'x' && throw2 !== 'x' && throw2 !== '/';
}

export function isStrikeFrame(frame: FrameData): boolean {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 === 'x' || throw2 === 'x';
}

export function isSpareFrame(frame: FrameData): boolean {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  return throw1 !== 'x' && throw2 !== 'x' && throw2 === '/';
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function parseCumulative(frame: FrameData): number | null {
  const value = parseInt(String(frame.cumulative ?? ''), 10);
  return Number.isNaN(value) ? null : value;
}

export function formatNullableScore(value: number | null): string {
  if (value === null) return '–';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function parseThrowPins(value: unknown): number {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === '-' || text === 'f') return 0;
  if (text === 'x') return 10;
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getFirstThrowPins(frame: FrameData): number {
  const throw1 = String(frame.throw1 ?? '').trim().toLowerCase();
  const throw2 = String(frame.throw2 ?? '').trim().toLowerCase();
  if (!throw1 && throw2 === 'x') return 10;
  return parseThrowPins(frame.throw1);
}

export function getFramePoints(frame: FrameData, previousCumulative: number): number | null {
  const cumulative = parseInt(String(frame.cumulative ?? ''), 10);
  if (Number.isNaN(cumulative)) return null;
  return cumulative - previousCumulative;
}

export function getPlayerGames(games: GameRead[], playerName: string): GameRead[] {
  return games.filter((g) => g.scores.some((s) => s.player_name === playerName));
}
