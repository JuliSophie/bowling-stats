'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchGames, renamePlayer } from '@/lib/api';
import type { FrameData, GameRead } from '@/types';

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777'];

type FrameType = 'strike' | 'spare' | 'normal';

function getFrameType(frame: FrameData): FrameType {
  if (String(frame.throw1).trim().toLowerCase() === 'x' || String(frame.throw2).trim().toLowerCase() === 'x') return 'strike';
  if (String(frame.throw2).trim() === '/') return 'spare';
  return 'normal';
}

function parseThrow1(value: string): number | null {
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  if (v === '-') return 0;
  if (v === 'x') return 10;
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 || n > 10 ? null : n;
}

function parseCumulative(frame: FrameData): number | null {
  const n = parseInt(String(frame.cumulative ?? ''), 10);
  return isNaN(n) ? null : n;
}

// ── Pin dot & legend ──

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

// ── Data helpers ──

type PlayerSummary = {
  name: string;
  gamesPlayed: number;
  avgScore: number;
  maxScore: number;
  lastPlayed: string;
};

function derivePlayerSummaries(games: GameRead[]): PlayerSummary[] {
  const map = new Map<string, { scores: number[]; lastPlayed: string }>();
  for (const game of games) {
    for (const score of game.scores) {
      const entry = map.get(score.player_name) ?? { scores: [], lastPlayed: game.played_at };
      entry.scores.push(score.total_score);
      if (game.played_at > entry.lastPlayed) entry.lastPlayed = game.played_at;
      map.set(score.player_name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, { scores, lastPlayed }]) => ({
      name,
      gamesPlayed: scores.length,
      avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      maxScore: Math.max(...scores),
      lastPlayed,
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
      roundNumber: (i + 1) * 10,
      score: game.scores.find((s) => s.player_name === playerName)?.total_score ?? 0,
    }));
}

function ChartToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'border-lane-700 bg-lane-800 text-white shadow-sm'
          : 'border-lane-300 bg-white/70 text-lane-700 hover:bg-lane-50'
      }`}
    >
      {label}
    </button>
  );
}

function buildGameChartData(game: GameRead): Record<string, string | number>[] {
  const frameCount = Math.max(...game.scores.map((s) => s.frames.length), 0);
  const data: Record<string, string | number>[] = [];
  for (let f = 0; f < frameCount; f++) {
    const point: Record<string, string | number> = { frame: `${f + 1}` };
    for (const score of game.scores) {
      if (f < score.frames.length) {
        const frame = score.frames[f] as FrameData;
        const cum = parseCumulative(frame);
        if (cum !== null) {
          point[score.player_name] = cum;
          point[`${score.player_name}_type`] = getFrameType(frame);
        }
      }
    }
    data.push(point);
  }
  return data;
}

// ── Per-player advanced stats ──

type PlayerAdvancedStats = {
  closerScore: number | null;
  strikeOnStrikePct: number | null;
  bounceBackPct: number | null;
  maxConsecutiveStrikes: number;
  streakLabel: string;
  firstBallAvg: number | null;
  totalStrikes: number;
  totalSpares: number;
  strikeAvgValue: number | null;
  spareAvgValue: number | null;
  cleanGames: number;
  dutch200: number;
  venueStats: { location: string; avg: number; games: number }[];
};

const STREAK_NAMES: Record<number, string> = {
  0: '–', 1: '1', 2: 'Double', 3: 'Turkey', 4: 'Hambone',
  5: 'Brat', 6: 'Wild Turkey', 7: 'Golden Turkey',
};

function computePlayerAdvanced(games: GameRead[], playerName: string): PlayerAdvancedStats {
  const pGames = getPlayerGames(games, playerName);
  const closerDeltas: number[] = [];
  let followStrikes = 0, followTotal = 0;
  let bbSuccess = 0, bbTotal = 0;
  let maxStreak = 0;
  const throw1s: number[] = [];
  let cleanGames = 0, dutch200 = 0, totalStrikes = 0, totalSpares = 0;
  const strikeFrameValues: number[] = [];
  const spareFrameValues: number[] = [];
  const venueMap = new Map<string, number[]>();

  for (const game of pGames) {
    const score = game.scores.find((s) => s.player_name === playerName);
    if (!score) continue;
    const frames = score.frames as FrameData[];
    if (frames.length < 10) continue;

    const types = frames.map(getFrameType);

    // totals + frame values
    for (let f = 0; f < types.length; f++) {
      if (types[f] === 'strike') {
        totalStrikes++;
        const cum = parseCumulative(frames[f]);
        const prevCum = f > 0 ? parseCumulative(frames[f - 1]) : 0;
        if (cum !== null && prevCum !== null) strikeFrameValues.push(cum - prevCum);
      }
      if (types[f] === 'spare') {
        totalSpares++;
        const cum = parseCumulative(frames[f]);
        const prevCum = f > 0 ? parseCumulative(frames[f - 1]) : 0;
        if (cum !== null && prevCum !== null) spareFrameValues.push(cum - prevCum);
      }
    }

    // venue
    const vs = venueMap.get(game.location) ?? [];
    vs.push(score.total_score);
    venueMap.set(game.location, vs);

    // closer score: frame 10 contribution vs avg of frames 1-9
    const cum8 = parseCumulative(frames[8]);
    const cum9 = parseCumulative(frames[9]);
    if (cum8 !== null && cum9 !== null && cum8 > 0) {
      closerDeltas.push((cum9 - cum8) - cum8 / 9);
    }

    // strike-on-strike (frames 0-8)
    for (let f = 0; f < 9; f++) {
      if (types[f] === 'strike') {
        followTotal++;
        if (types[f + 1] === 'strike') followStrikes++;
      }
    }

    // bounce back: open frame → mark next
    for (let f = 0; f < 9; f++) {
      if (types[f] === 'normal') {
        bbTotal++;
        if (types[f + 1] !== 'normal') bbSuccess++;
      }
    }

    // consecutive strikes
    let streak = 0;
    for (let f = 0; f < 10; f++) {
      if (types[f] === 'strike') { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 0;
    }

    // first ball avg
    for (const frame of frames) {
      const v = parseThrow1(String(frame.throw1));
      if (v !== null) throw1s.push(v);
    }

    // clean game
    if (types.every((t) => t !== 'normal')) cleanGames++;

    // dutch 200
    if (score.total_score === 200) {
      const first = types[0];
      if ((first === 'strike' || first === 'spare') &&
          types.every((t, i) => t === (i % 2 === 0 ? first : first === 'strike' ? 'spare' : 'strike')))
        dutch200++;
    }
  }

  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : null;

  return {
    closerScore: avg(closerDeltas),
    strikeOnStrikePct: pct(followStrikes, followTotal),
    bounceBackPct: pct(bbSuccess, bbTotal),
    maxConsecutiveStrikes: maxStreak,
    streakLabel: STREAK_NAMES[Math.min(maxStreak, 7)] ?? `${maxStreak}x Strikes`,
    firstBallAvg: avg(throw1s),
    totalStrikes, totalSpares,
    strikeAvgValue: avg(strikeFrameValues),
    spareAvgValue: avg(spareFrameValues),
    cleanGames, dutch200,
    venueStats: [...venueMap.entries()]
      .map(([location, scores]) => ({ location, avg: avg(scores)!, games: scores.length }))
      .sort((a, b) => b.avg - a.avg),
  };
}

// ── Social / group stats ──

type NemesisPair = { player1: string; player2: string; wins1: number; wins2: number; draws: number; total: number };
type UnderdogMoment = { playerName: string; score: number; avg: number; pctAbove: number; date: string; location: string };
type PaceSetterEntry = { playerName: string; leads: number; of: number };
type FatigueEntry = { playerName: string; firstAvg: number; laterAvg: number; drop: number; sessions: number };
type TripleThreat = { playerName: string; date: string; scores: number[] };

function computeSocialStats(games: GameRead[], players: PlayerSummary[]) {
  const avgMap = new Map(players.map((p) => [p.name, p.avgScore]));

  // Nemesis
  const h2h = new Map<string, NemesisPair>();
  for (const game of games) {
    if (game.scores.length < 2) continue;
    for (let i = 0; i < game.scores.length; i++) {
      for (let j = i + 1; j < game.scores.length; j++) {
        const a = game.scores[i], b = game.scores[j];
        const [p1, p2] = a.player_name < b.player_name ? [a, b] : [b, a];
        const key = `${p1.player_name}|${p2.player_name}`;
        const e = h2h.get(key) ?? { player1: p1.player_name, player2: p2.player_name, wins1: 0, wins2: 0, draws: 0, total: 0 };
        e.total++;
        if (a.total_score === b.total_score) e.draws++;
        else {
          const winner = a.total_score > b.total_score ? a.player_name : b.player_name;
          if (winner === e.player1) e.wins1++; else e.wins2++;
        }
        h2h.set(key, e);
      }
    }
  }
  const nemeses = [...h2h.values()].filter((e) => e.total >= 2)
    .sort((a, b) => Math.abs(b.wins1 - b.wins2) / b.total - Math.abs(a.wins1 - a.wins2) / a.total || b.total - a.total);

  // Underdog
  const underdogs: UnderdogMoment[] = [];
  for (const game of games) {
    for (const s of game.scores) {
      const avg = avgMap.get(s.player_name);
      if (!avg || avg <= 0) continue;
      const pctAbove = Math.round(((s.total_score - avg) / avg) * 1000) / 10;
      if (pctAbove > 5) underdogs.push({ playerName: s.player_name, score: s.total_score, avg, pctAbove, date: game.played_at, location: game.location });
    }
  }
  underdogs.sort((a, b) => b.pctAbove - a.pctAbove);

  // Pace setter: who leads after frame 5 most often
  const leads = new Map<string, number>();
  let mpGames = 0;
  for (const game of games) {
    if (game.scores.length < 2) continue;
    mpGames++;
    let best = -1, leader = '';
    for (const s of game.scores) {
      const f5 = (s.frames as FrameData[])[4];
      if (!f5) continue;
      const cum = parseCumulative(f5);
      if (cum !== null && cum > best) { best = cum; leader = s.player_name; }
    }
    if (leader) leads.set(leader, (leads.get(leader) ?? 0) + 1);
  }
  const paceSetters: PaceSetterEntry[] = [...leads.entries()]
    .map(([playerName, cnt]) => ({ playerName, leads: cnt, of: mpGames }))
    .sort((a, b) => b.leads - a.leads);

  // Fatigue factor
  const sessionScores = new Map<string, number[][]>();
  const dateGames = new Map<string, GameRead[]>();
  for (const g of games) { const l = dateGames.get(g.played_at) ?? []; l.push(g); dateGames.set(g.played_at, l); }
  for (const [, dg] of dateGames) {
    const ordered = dg.slice().sort((a, b) => a.id - b.id);
    const playerScores = new Map<string, number[]>();
    for (const g of ordered) for (const s of g.scores) {
      const l = playerScores.get(s.player_name) ?? [];
      l.push(s.total_score);
      playerScores.set(s.player_name, l);
    }
    for (const [name, scores] of playerScores) {
      if (scores.length < 2) continue;
      const l = sessionScores.get(name) ?? [];
      l.push(scores);
      sessionScores.set(name, l);
    }
  }
  const fatigueFactors: FatigueEntry[] = [];
  for (const [name, sessions] of sessionScores) {
    const firsts = sessions.map((s) => s[0]);
    const laters = sessions.flatMap((s) => s.slice(1));
    const firstAvg = Math.round((firsts.reduce((a, b) => a + b, 0) / firsts.length) * 10) / 10;
    const laterAvg = Math.round((laters.reduce((a, b) => a + b, 0) / laters.length) * 10) / 10;
    fatigueFactors.push({ playerName: name, firstAvg, laterAvg, drop: Math.round((firstAvg - laterAvg) * 10) / 10, sessions: sessions.length });
  }
  fatigueFactors.sort((a, b) => b.drop - a.drop);

  // Triple threat: 3+ games same date, all within 5 pins
  const tripleThreats: TripleThreat[] = [];
  for (const [, dg] of dateGames) {
    const playerScores = new Map<string, number[]>();
    for (const g of dg) for (const s of g.scores) {
      const l = playerScores.get(s.player_name) ?? [];
      l.push(s.total_score);
      playerScores.set(s.player_name, l);
    }
    for (const [name, scores] of playerScores) {
      if (scores.length >= 3 && Math.max(...scores) - Math.min(...scores) <= 5) {
        tripleThreats.push({ playerName: name, date: dg[0].played_at, scores });
      }
    }
  }

  return { nemeses, underdogs: underdogs.slice(0, 5), paceSetters, fatigueFactors, tripleThreats };
}

// ── Small UI components ──

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [alignLeft, setAlignLeft] = useState(false);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setAlignLeft(rect.right < 240);
    }
    setOpen((v) => !v);
  }

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-lane-300 text-[9px] font-bold leading-none text-lane-400 transition hover:border-lane-500 hover:text-lane-600"
        onClick={toggle}
        onBlur={() => setOpen(false)}
        aria-label="Info"
      >i</button>
      {open && (
        <div className={`absolute top-6 z-30 w-56 rounded-xl border border-lane-200 bg-white p-3 text-xs leading-relaxed text-lane-700 shadow-lg ${alignLeft ? 'left-0' : 'right-0'}`}>
          {text}
        </div>
      )}
    </span>
  );
}

function StatCard({ label, value, sub, accent, info }: { label: string; value: string | number; sub?: string; accent?: string; info?: string }) {
  return (
    <div className={`relative rounded-xl bg-lane-50 py-2.5 pl-4 ${info ? 'pr-8' : 'pr-4'}`}>
      {info && <span className="absolute right-2.5 top-2.5"><InfoTip text={info} /></span>}
      <p className="text-xs text-lane-500">{label}</p>
      <p className={`text-lg font-semibold ${accent ?? 'text-lane-800'}`}>{value}</p>
      {sub && <p className="text-xs text-lane-400">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-lane-800">{title}</h3>
      {info && <InfoTip text={info} />}
    </div>
  );
}

function Badge({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-lane-200 bg-white px-3 py-1 text-xs font-medium text-lane-800">
      <span className="text-sm">{emoji}</span> {label}
    </span>
  );
}

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
                <td className="border border-lane-200 px-2 py-1 font-medium text-lane-900 whitespace-nowrap">{score.player_name}</td>
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

function GameChart({ game, highlightPlayer }: { game: GameRead; highlightPlayer?: string }) {
  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-2 flex justify-end">{PIN_LEGEND}</div>
        <div style={{ touchAction: 'none' }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={buildGameChartData(game)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
            <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
            <Tooltip labelFormatter={() => ''} />
            <Legend />
            {game.scores.map((score, i) => (
              <Line
                key={score.player_name}
                type="monotone"
                dataKey={score.player_name}
                stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                strokeWidth={!highlightPlayer || score.player_name === highlightPlayer ? 2.5 : 1.5}
                strokeDasharray={highlightPlayer && score.player_name !== highlightPlayer ? '5 3' : undefined}
                dot={<PinDot />}
                activeDot={{ r: 6 }}
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

function TodaysGames({ games, onOpenGame }: { games: GameRead[]; onOpenGame: (gameId: number) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayGames = games.filter((g) => g.played_at === today);
  if (todayGames.length === 0) return null;

  return (
    <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
      <h3 className="mb-3 text-sm font-semibold text-lane-800">Heute gespielt</h3>
      <div className="grid gap-2">
        {todayGames.map((game) => {
          const avgScore = Math.round(game.scores.reduce((a, s) => a + s.total_score, 0) / game.scores.length);
          const maxScore = Math.max(...game.scores.map((s) => s.total_score));
          const winner = game.scores.find((s) => s.total_score === maxScore);
          return (
            <button key={game.id} type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-lane-100 bg-lane-50/50 px-4 py-3 text-left transition hover:bg-lane-50"
              onClick={() => onOpenGame(game.id)}
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-lane-800">{game.location}</span>
                <div className="mt-0.5 flex flex-wrap gap-2">
                  {game.scores.map((s) => (
                    <span key={s.player_name}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.total_score === maxScore ? 'bg-lane-800 text-white' : 'bg-lane-100 text-lane-700'}`}
                    >{s.player_name}: {s.total_score}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-lane-500">
                <p>⌀ {avgScore}{winner && game.scores.length > 1 ? ` · Beste/r: ${winner.player_name}` : ''}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Player advanced stats section ──

function PlayerStatsSection({ games, playerName }: { games: GameRead[]; playerName: string }) {
  const s = computePlayerAdvanced(games, playerName);

  return (
    <div className="grid gap-4">
      {/* Momentum */}
      <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
        <SectionHeader title="Momentum & Psyche" info="Diese Werte zeigen, wie du unter Druck reagierst und ob du nach guten oder schlechten Frames konstant bleibst." />
        <div className="flex flex-wrap gap-3">
          {s.closerScore !== null && (
            <StatCard
              label="Schlussstärke"
              value={`${s.closerScore > 0 ? '+' : ''}${s.closerScore}`}
              sub="10. Frame vs. Durchschnitt"
              accent={s.closerScore > 0 ? 'text-green-700' : s.closerScore < 0 ? 'text-red-600' : 'text-lane-800'}
              info="Vergleicht deine Punkte im 10. Frame mit dem Durchschnitt der Frames 1–9. Positiv = du wirst unter Druck besser, negativ = du knickst ein."
            />
          )}
          {s.strikeOnStrikePct !== null && (
            <StatCard label="Strike-Folge" value={`${s.strikeOnStrikePct}%`} sub="Folge-Strike nach Strike"
              info="Wie oft folgt auf einen Strike direkt ein weiterer? Misst deine Fähigkeit, im Flow zu bleiben." />
          )}
          {s.bounceBackPct !== null && (
            <StatCard label="Comeback-Rate" value={`${s.bounceBackPct}%`} sub="Strike/Spare nach offenem Frame"
              info="Wie oft schaffst du nach einem offenen Frame (nicht alle Pins abgeräumt) im nächsten Frame einen Strike oder Spare?" />
          )}
          <StatCard label="Beste Serie" value={s.streakLabel} sub={s.maxConsecutiveStrikes > 0 ? `${s.maxConsecutiveStrikes} Strikes am Stück` : undefined}
            info="Deine längste Serie aufeinanderfolgender Strikes. 3 = Turkey, 4 = Hambone, 5 = Brat, 6 = Wild Turkey, 7 = Golden Turkey." />
        </div>
      </div>

      {/* Technical */}
      <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
        <SectionHeader title="Technik" info="Technische Kennzahlen zu deiner Wurfpräzision und Konstanz." />
        <div className="flex flex-wrap gap-3">
          {s.firstBallAvg !== null && (
            <StatCard label="Erster Wurf ⌀" value={s.firstBallAvg} sub="⌀ Pins mit dem 1. Wurf"
              info="Durchschnittliche Anzahl Pins, die du mit dem ersten Wurf jedes Frames abräumst. Ein guter Indikator für dein Grundniveau – unabhängig vom Spare-Glück." />
          )}
          <StatCard label="Strikes gesamt" value={s.totalStrikes} sub={s.strikeAvgValue !== null ? `⌀ ${s.strikeAvgValue} Pins/Strike` : undefined} info="Gesamtzahl aller Strikes und durchschnittliche Pins pro Strike-Frame (inkl. Bonus durch Folgewürfe). Über 20 = du räumst nach einem Strike meistens alle Pins ab oder kettest Strikes. Unter 20 = nach einem Strike bleiben oft Pins stehen. Maximum: 30 (Turkey-Sequenz)." />
          <StatCard label="Spares gesamt" value={s.totalSpares} sub={s.spareAvgValue !== null ? `⌀ ${s.spareAvgValue} Pins/Spare` : undefined} info="Gesamtzahl aller Spares und durchschnittliche Pins pro Spare-Frame (inkl. Bonus durch den Folgewurf). Über 15 = du wirfst nach einem Spare meistens gut. Unter 15 = nach einem Spare geht oft wenig. Maximum: 20 (Spare gefolgt von Strike)." />
        </div>
      </div>

      {/* Venue */}
      {s.venueStats.length > 1 && (
        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
          <SectionHeader title="Bahnvergleich" info="Vergleicht deinen Durchschnitt pro Bowlingbahn. Unterschiede können an Ölmustern, Bahnzustand oder einfach an der Stimmung liegen." />
          <ResponsiveContainer width="100%" height={Math.max(120, s.venueStats.length * 44)}>
            <BarChart data={s.venueStats} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
              <XAxis type="number" tick={{ fontSize: 12 }} domain={['dataMin - 10', 'dataMax + 10']} />
              <YAxis type="category" dataKey="location" tick={{ fontSize: 11 }} width={120} />
              <Tooltip labelFormatter={() => ''} formatter={(value: number) => [`${value}`, '⌀']} />
              <Bar dataKey="avg" radius={[0, 6, 6, 0]} barSize={20}>
                {s.venueStats.map((_, i) => <Cell key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Achievements */}
      {(s.cleanGames > 0 || s.dutch200 > 0) && (
        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
          <SectionHeader title="Auszeichnungen" info="Besondere Leistungen, die du in deinen Spielen freigeschaltet hast." />
          <div className="flex flex-wrap gap-2">
            {s.cleanGames > 0 && <Badge emoji="✨" label={`Sauberes Spiel${s.cleanGames > 1 ? ` x${s.cleanGames}` : ''}`} />}
            {s.dutch200 > 0 && <Badge emoji="🇳🇱" label={`Dutch 200${s.dutch200 > 1 ? ` x${s.dutch200}` : ''}`} />}
            {s.maxConsecutiveStrikes >= 3 && <Badge emoji="🦃" label={`Turkey (${s.maxConsecutiveStrikes}x)`} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Social stats section (overview) ──

function SocialStatsSection({ games, players }: { games: GameRead[]; players: PlayerSummary[] }) {
  const { nemeses, underdogs, paceSetters, fatigueFactors, tripleThreats } = computeSocialStats(games, players);
  const hasContent = nemeses.length > 0 || underdogs.length > 0 || paceSetters.length > 0;
  if (!hasContent) return null;

  return (
    <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
      <h3 className="mb-4 text-sm font-semibold text-lane-800">Sticheleien & Vergleiche</h3>
      <div className="grid gap-5">
        {/* Nemesis */}
        {nemeses.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Erzfeind-Index</p>
              <InfoTip text="Zeigt die Head-to-Head-Bilanz zwischen Spielerpaaren. Wer dominiert wen? Mindestens 2 gemeinsame Spiele nötig." />
            </div>
            <div className="grid gap-1.5">
              {nemeses.slice(0, 5).map((n) => {
                const dominant = n.wins1 >= n.wins2 ? n.player1 : n.player2;
                const dominated = n.wins1 >= n.wins2 ? n.player2 : n.player1;
                const dWins = Math.max(n.wins1, n.wins2);
                const dLosses = Math.min(n.wins1, n.wins2);
                return (
                  <div key={`${n.player1}-${n.player2}`} className="flex items-center justify-between rounded-lg bg-lane-50 px-3 py-2 text-sm">
                    <span className="text-lane-800">
                      <span className="font-semibold">{dominant}</span>
                      <span className="text-lane-500"> vs </span>
                      <span>{dominated}</span>
                    </span>
                    <span className="font-mono text-xs font-semibold text-lane-700">
                      {dWins}W – {dLosses}L{n.draws > 0 ? ` – ${n.draws}D` : ''} ({n.total} Spiele)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Underdog */}
        {underdogs.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Überraschung des Abends</p>
              <InfoTip text="Der Spieler, der seinen persönlichen Durchschnitt in einem Spiel am stärksten übertroffen hat (in Prozent). Der Überraschungsheld des Abends!" />
            </div>
            <div className="grid gap-1.5">
              {underdogs.slice(0, 3).map((u, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-lane-50 px-3 py-2 text-sm">
                  <span className="text-lane-800">
                    <span className="font-semibold">{u.playerName}</span>
                    <span className="ml-1 text-xs text-lane-500">{u.date}, {u.location}</span>
                  </span>
                  <span className="text-xs font-semibold text-green-700">
                    {u.score} Punkte (+{u.pctAbove}% über ⌀ {u.avg})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pace setter */}
        {paceSetters.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Tempomacher</p>
              <InfoTip text="Wer hat nach Frame 5 am häufigsten die Führung? Der Spieler, der das Tempo vorgibt – auch wenn er am Ende nicht immer gewinnt." />
            </div>
            <div className="grid gap-1.5">
              {paceSetters.map((p) => (
                <div key={p.playerName} className="flex items-center justify-between rounded-lg bg-lane-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-lane-800">{p.playerName}</span>
                  <span className="text-xs text-lane-600">{p.leads} von {p.of} Spielen ({Math.round((p.leads / p.of) * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fatigue factor */}
        {fatigueFactors.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Ermüdungsfaktor</p>
              <InfoTip text="Vergleicht deinen Durchschnitt im 1. Spiel eines Abends mit den Folgepartien. Sinkt der Wert, lässt deine Konzentration (oder Nüchternheit) nach." />
            </div>
            <div className="grid gap-1.5">
              {fatigueFactors.map((f) => (
                <div key={f.playerName} className="flex items-center justify-between rounded-lg bg-lane-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-lane-800">{f.playerName}</span>
                  <span className={`text-xs font-semibold ${f.drop > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    1. Spiel ⌀ {f.firstAvg} → danach ⌀ {f.laterAvg} ({f.drop > 0 ? '−' : '+'}{Math.abs(f.drop)}) · {f.sessions} Abende
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Triple threat */}
        {tripleThreats.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Dreifach-Konstant</p>
              <InfoTip text="Drei oder mehr Spiele an einem Abend, bei denen alle Ergebnisse innerhalb von 5 Pins liegen. Zeigt extreme Konstanz in einer Session." />
            </div>
            <div className="flex flex-wrap gap-2">
              {tripleThreats.map((t, i) => (
                <Badge key={i} emoji="🎯" label={`${t.playerName} am ${t.date}: ${t.scores.join(', ')}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Day session stats ──

type DayPlayerStats = {
  name: string;
  scores: number[];
  totalPins: number;
  dayAvg: number;
  bestGame: number;
  globalAvg: number;
  performancePct: number;
  dayStrikes: number;
  strikeAvgValue: number;
};

function getMultiGameDays(games: GameRead[]): { date: string; games: GameRead[] }[] {
  const dateMap = new Map<string, GameRead[]>();
  for (const game of games) {
    const list = dateMap.get(game.played_at) ?? [];
    list.push(game);
    dateMap.set(game.played_at, list);
  }
  return [...dateMap.entries()]
    .filter(([, g]) => g.length >= 2)
    .map(([date, g]) => ({ date, games: g.slice().sort((a, b) => a.id - b.id) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function computeDayPlayerStats(dayGames: GameRead[], globalPlayers: PlayerSummary[]): DayPlayerStats[] {
  const globalAvgMap = new Map(globalPlayers.map((p) => [p.name, p.avgScore]));
  const playerData = new Map<string, { scores: number[]; strikes: number; strikeValues: number[] }>();
  for (const game of dayGames) {
    for (const score of game.scores) {
      const entry = playerData.get(score.player_name) ?? { scores: [], strikes: 0, strikeValues: [] };
      entry.scores.push(score.total_score);
      const frames = score.frames as FrameData[];
      for (let f = 0; f < frames.length; f++) {
        if (getFrameType(frames[f]) === 'strike') {
          entry.strikes++;
          const cum = parseCumulative(frames[f]);
          const prevCum = f > 0 ? parseCumulative(frames[f - 1]) : 0;
          if (cum !== null && prevCum !== null) {
            entry.strikeValues.push(cum - prevCum);
          }
        }
      }
      playerData.set(score.player_name, entry);
    }
  }
  return [...playerData.entries()].map(([name, { scores, strikes, strikeValues }]) => {
    const totalPins = scores.reduce((a, b) => a + b, 0);
    const dayAvg = Math.round((totalPins / scores.length) * 10) / 10;
    const globalAvg = globalAvgMap.get(name) ?? dayAvg;
    const performancePct = globalAvg > 0 ? Math.round(((dayAvg - globalAvg) / globalAvg) * 1000) / 10 : 0;
    const strikeAvgValue = strikeValues.length > 0 ? Math.round((strikeValues.reduce((a, b) => a + b, 0) / strikeValues.length) * 10) / 10 : 0;
    return { name, scores, totalPins, dayAvg, bestGame: Math.max(...scores), globalAvg, performancePct, dayStrikes: strikes, strikeAvgValue };
  }).sort((a, b) => b.totalPins - a.totalPins);
}

function buildDayChartData(dayGames: GameRead[]): Record<string, string | number>[] {
  return dayGames.slice().sort((a, b) => a.id - b.id).map((game, i) => {
    const point: Record<string, string | number> = { game: `Spiel ${i + 1}` };
    for (const score of game.scores) {
      point[score.player_name] = score.total_score;
    }
    return point;
  });
}

function buildDayAllFramesChartData(dayGames: GameRead[]): {
  data: Record<string, string | number | undefined>[];
  gameBoundaries: string[];
} {
  const sorted = dayGames.slice().sort((a, b) => a.id - b.id);
  const data: Record<string, string | number | undefined>[] = [];
  const gameBoundaries: string[] = [];

  for (let g = 0; g < sorted.length; g++) {
    const game = sorted[g];
    const frameCount = Math.max(...game.scores.map((s) => s.frames.length), 0);

    if (g > 0) {
      gameBoundaries.push(`${g + 1}-1`);
      data.push({ frame: `gap-${g}` });
    }

    for (let f = 0; f < frameCount; f++) {
      const label = `${g + 1}-${f + 1}`;
      const point: Record<string, string | number | undefined> = { frame: label };
      for (const score of game.scores) {
        if (f < score.frames.length) {
          const frame = score.frames[f] as FrameData;
          const cum = parseCumulative(frame);
          if (cum !== null) {
            point[score.player_name] = cum;
            point[`${score.player_name}_type`] = getFrameType(frame);
          }
        }
      }
      data.push(point);
    }
  }

  return { data, gameBoundaries };
}

function buildDayCumulativeChartData(dayGames: GameRead[]): {
  data: Record<string, string | number>[];
  gameBoundaries: string[];
} {
  const sorted = dayGames.slice().sort((a, b) => a.id - b.id);
  const data: Record<string, string | number>[] = [];
  const gameBoundaries: string[] = [];
  const playerPrevTotal = new Map<string, number>();

  for (let g = 0; g < sorted.length; g++) {
    const game = sorted[g];
    const frameCount = Math.max(...game.scores.map((s) => s.frames.length), 0);

    if (g > 0) {
      gameBoundaries.push(`${g + 1}-1`);
    }

    for (let f = 0; f < frameCount; f++) {
      const label = `${g + 1}-${f + 1}`;
      const point: Record<string, string | number> = { frame: label };
      for (const score of game.scores) {
        if (f < score.frames.length) {
          const frame = score.frames[f] as FrameData;
          const cum = parseCumulative(frame);
          if (cum !== null) {
            point[score.player_name] = (playerPrevTotal.get(score.player_name) ?? 0) + cum;
          }
        }
      }
      data.push(point);
    }

    for (const score of game.scores) {
      const lastFrame = score.frames[score.frames.length - 1] as FrameData | undefined;
      if (lastFrame) {
        const finalCum = parseCumulative(lastFrame);
        if (finalCum !== null) {
          playerPrevTotal.set(score.player_name, (playerPrevTotal.get(score.player_name) ?? 0) + finalCum);
        }
      }
    }
  }

  return { data, gameBoundaries };
}

function buildDayCumulativeEndpointsData(dayGames: GameRead[]): Record<string, string | number>[] {
  const sorted = dayGames.slice().sort((a, b) => a.id - b.id);
  const playerRunning = new Map<string, number>();
  return sorted.map((game, i) => {
    const point: Record<string, string | number> = { game: `Spiel ${i + 1}` };
    for (const score of game.scores) {
      const prev = playerRunning.get(score.player_name) ?? 0;
      const cumTotal = prev + score.total_score;
      playerRunning.set(score.player_name, cumTotal);
      point[score.player_name] = cumTotal;
    }
    return point;
  });
}

function DaySessionContent({ dayGames, players }: {
  dayGames: GameRead[];
  players: PlayerSummary[];
}) {
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [cumOpen, setCumOpen] = useState(true);
  const [cumMode, setCumMode] = useState<'allFrames' | 'final'>('allFrames');
  const [compareOpen, setCompareOpen] = useState(true);
  const [compareMode, setCompareMode] = useState<'allFrames' | 'final'>('final');
  const sortedGames = dayGames.slice().sort((a, b) => a.id - b.id);
  const dayPlayers = computeDayPlayerStats(sortedGames, players);
  const chartData = buildDayChartData(sortedGames);
  const allPlayerNames = [...new Set(sortedGames.flatMap((g) => g.scores.map((s) => s.player_name)))];
  const dayWinner = dayPlayers[0];
  const bestSingle = dayPlayers.reduce(
    (best, p) => (p.bestGame > best.score ? { name: p.name, score: p.bestGame } : best),
    { name: '', score: 0 },
  );
  const maxStrikes = Math.max(...dayPlayers.map((p) => p.dayStrikes), 0);
  const strikeLeaders = maxStrikes > 0
    ? dayPlayers.filter((p) => p.dayStrikes === maxStrikes).sort((a, b) => b.strikeAvgValue - a.strikeAvgValue)
    : [];

  const allFrames = buildDayAllFramesChartData(sortedGames);
  const cumAllFrames = buildDayCumulativeChartData(sortedGames);
  const cumEndpoints = buildDayCumulativeEndpointsData(sortedGames);

  return (
    <div className="grid gap-4">
      {/* Cumulative chart */}
      <div className="rounded-xl border border-lane-100 overflow-hidden">
        <button type="button" className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-lane-50"
          onClick={() => setCumOpen((v) => !v)}>
          <span className="text-sm font-semibold text-lane-800">Kumulativ</span>
          <span className="text-lane-400 text-sm">{cumOpen ? '▲' : '▼'}</span>
        </button>
        {cumOpen && (
          <div className="border-t border-lane-100 px-2 py-3">
            <div className="mb-2 flex items-center gap-1 rounded-full border border-lane-200 bg-white/90 p-1 self-start w-fit">
              <button type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${cumMode === 'allFrames' ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                onClick={() => setCumMode('allFrames')}>Alle Frames</button>
              <button type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${cumMode === 'final' ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                onClick={() => setCumMode('final')}>Endpunkte</button>
            </div>
            <div style={{ touchAction: 'none' }}>
              {cumMode === 'allFrames' ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cumAllFrames.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="frame" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.split('-')[1]} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    <Tooltip labelFormatter={() => ''} />
                    <Legend />
                    {cumAllFrames.gameBoundaries.map((boundary) => (
                      <ReferenceLine key={boundary} x={boundary} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
                    ))}
                    {allPlayerNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={cumEndpoints} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="game" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    <Tooltip labelFormatter={() => ''} />
                    <Legend />
                    {allPlayerNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Per-game comparison chart */}
      <div className="rounded-xl border border-lane-100 overflow-hidden">
        <button type="button" className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-lane-50"
          onClick={() => setCompareOpen((v) => !v)}>
          <span className="text-sm font-semibold text-lane-800">Spielvergleich</span>
          <span className="text-lane-400 text-sm">{compareOpen ? '▲' : '▼'}</span>
        </button>
        {compareOpen && (
          <div className="border-t border-lane-100 px-2 py-3">
            <div className="mb-2 flex items-center gap-1 rounded-full border border-lane-200 bg-white/90 p-1 self-start w-fit">
              <button type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${compareMode === 'allFrames' ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                onClick={() => setCompareMode('allFrames')}>Alle Frames</button>
              <button type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${compareMode === 'final' ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                onClick={() => setCompareMode('final')}>Endpunkte</button>
            </div>
            <div style={{ touchAction: 'none' }}>
              {compareMode === 'allFrames' ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={allFrames.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="frame" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.includes('gap') ? '' : v.split('-')[1]} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    <Tooltip labelFormatter={() => ''} />
                    <Legend />
                    {allFrames.gameBoundaries.map((boundary) => (
                      <ReferenceLine key={boundary} x={boundary} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
                    ))}
                    {allPlayerNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={2} dot={<PinDot />} activeDot={{ r: 4 }} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                    <XAxis dataKey="game" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'dataMax + 10']} />
                    <Tooltip labelFormatter={() => ''} />
                    <Legend />
                    {allPlayerNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {dayWinner && (
          <StatCard label="Tages-Sieger" value={dayWinner.name} sub={`${dayWinner.totalPins} Pins gesamt`} />
        )}
        <StatCard label="Bestes Einzelspiel" value={bestSingle.score} sub={bestSingle.name} />
        {strikeLeaders.length === 1 && (
          <StatCard label="Meiste Strikes" value={strikeLeaders[0].dayStrikes} sub={`${strikeLeaders[0].name} · ⌀ ${strikeLeaders[0].strikeAvgValue} Pins/Strike`} />
        )}
        {strikeLeaders.length > 1 && (
          <div className="rounded-xl bg-lane-50 py-2.5 px-4">
            <p className="text-xs text-lane-500">Meiste Strikes ({maxStrikes})</p>
            <div className="mt-1 grid gap-1">
              {strikeLeaders.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className={`font-semibold ${i === 0 ? 'text-lane-900' : 'text-lane-700'}`}>{i + 1}. {p.name}</span>
                  <span className="text-xs text-lane-500">⌀ {p.strikeAvgValue} Pins/Strike</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-lane-500">Tagesform</p>
          <InfoTip text="Vergleicht den Tagesdurchschnitt jedes Spielers mit seinem Gesamtdurchschnitt. Positiv = besser als sonst, negativ = unter dem üblichen Niveau." />
        </div>
        <div className="grid gap-1.5">
          {dayPlayers.map((p) => (
            <div key={p.name} className="flex items-center justify-between rounded-lg bg-lane-50 px-3 py-2 text-sm">
              <span className="font-semibold text-lane-800">{p.name}</span>
              <span className="text-xs text-lane-600">
                {p.totalPins} Pins · Tag ⌀ {p.dayAvg} · Gesamt ⌀ {p.globalAvg}
                {' '}
                <span className={`font-semibold ${p.performancePct > 0 ? 'text-green-700' : p.performancePct < 0 ? 'text-red-600' : 'text-lane-600'}`}>
                  ({p.performancePct > 0 ? '+' : ''}{p.performancePct}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        {sortedGames.map((game, i) => {
          const maxScore = Math.max(...game.scores.map((s) => s.total_score));
          const isExpanded = expandedGameId === game.id;
          return (
            <div key={game.id} className="rounded-xl border border-lane-100 bg-lane-50/50 overflow-hidden">
              <button type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-lane-50"
                onClick={() => setExpandedGameId(isExpanded ? null : game.id)}
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-lane-800">Spiel {i + 1}</span>
                  <span className="ml-2 text-xs text-lane-500">{game.location}</span>
                  <div className="mt-0.5 flex flex-wrap gap-2">
                    {game.scores.map((s) => (
                      <span key={s.player_name}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.total_score === maxScore ? 'bg-lane-800 text-white' : 'bg-lane-100 text-lane-700'}`}
                      >{s.player_name}: {s.total_score}</span>
                    ))}
                  </div>
                </div>
                <span className="text-lane-400 text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-lane-100 p-4">
                  <GameChart game={game} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodaySessionSection({ games, players }: {
  games: GameRead[];
  players: PlayerSummary[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const todayGames = games.filter((g) => g.played_at === today);
  if (todayGames.length < 2) return null;

  return (
    <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
      <SectionHeader
        title={`Heutige Session · ${todayGames.length} Spiele`}
        info="Übersicht über alle heutigen Spiele: Punkteverlauf, Tagessieger und Leistung im Vergleich zum persönlichen Durchschnitt."
      />
      <DaySessionContent dayGames={todayGames} players={players} />
    </div>
  );
}

function PastSessionsList({ games, players }: {
  games: GameRead[];
  players: PlayerSummary[];
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const multiGameDays = getMultiGameDays(games).filter((d) => d.date !== today);

  if (multiGameDays.length === 0) return null;

  return (
    <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 overflow-hidden">
      <h3 className="px-5 pt-4 pb-2 text-sm font-semibold text-lane-800">Vergangene Tages-Sessions</h3>
      {multiGameDays.map((session, i) => {
        const isExpanded = expandedDate === session.date;
        const dayPlayers = computeDayPlayerStats(session.games, players);
        const winner = dayPlayers[0];
        return (
          <div key={session.date}>
            <button type="button"
              className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-lane-50 ${i < multiGameDays.length - 1 || isExpanded ? 'border-b border-lane-100' : ''}`}
              onClick={() => setExpandedDate(isExpanded ? null : session.date)}
            >
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-lane-900">{session.date}</h4>
                <p className="mt-0.5 text-xs text-lane-500">
                  {session.games.length} Spiele · {session.games[0].location}
                  {winner ? ` · Sieger: ${winner.name} (${winner.totalPins} Pins)` : ''}
                </p>
              </div>
              <span className="text-lane-400 text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div className="border-b border-lane-100 p-4">
                <DaySessionContent dayGames={session.games} players={players} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main view ──

export default function StatsView() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');
  const [renamingPlayer, setRenamingPlayer] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [renameNotice, setRenameNotice] = useState('');
  const [isEditingPlayer, setIsEditingPlayer] = useState(false);
  const [statsView, setStatsView] = useState<'play' | 'player' | 'day'>('play');
  const [showPersonalGame, setShowPersonalGame] = useState(true);
  const [showRoundNumber, setShowRoundNumber] = useState(false);
  const [showPersonalBest, setShowPersonalBest] = useState(false);

  useEffect(() => {
    fetchGames().then(setGames).finally(() => setLoading(false));
  }, []);

  async function handleRenamePlayer() {
    if (!selectedPlayer) return;

    const nextName = editingPlayerName.trim();
    if (!nextName) {
      setRenameError('Der Spielername darf nicht leer sein.');
      return;
    }

    setRenamingPlayer(true);
    setRenameError('');
    setRenameNotice('');

    try {
      const result = await renamePlayer({ current_name: selectedPlayer, new_name: nextName });
      const refreshedGames = await fetchGames();
      setGames(refreshedGames);
      setSelectedPlayer(result.player_name);
      setEditingPlayerName(result.player_name);
      setIsEditingPlayer(false);
      setRenameNotice(result.merged ? 'Spieler wurden zusammengefuehrt.' : 'Spielername aktualisiert.');
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Spieler konnte nicht umbenannt werden.');
    } finally {
      setRenamingPlayer(false);
    }
  }

  if (loading) {
    return <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Statistiken...</div>;
  }

  if (games.length === 0) {
    return (
      <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-center text-sm text-lane-600">
        Noch keine Spiele gespeichert. Lade ein Bild hoch und speichere das Ergebnis.
      </div>
    );
  }

  const players = derivePlayerSummaries(games);

  // ── Navigation for stats views ──
  const statsNavigation = (
    <div className="mb-4 flex items-center gap-2 border-b border-lane-200">
      <button
        type="button"
        onClick={() => {
          setStatsView('play');
          setSelectedPlayer(null);
          setExpandedGameId(null);
        }}
        className={`px-4 py-3 text-sm font-medium transition ${
          statsView === 'play'
            ? 'border-b-2 border-lane-800 text-lane-800'
            : 'text-lane-600 hover:text-lane-800'
        }`}
      >
        Spiel-Statistiken
      </button>
      <button
        type="button"
        onClick={() => {
          setStatsView('player');
          setSelectedPlayer(null);
          setExpandedGameId(null);
        }}
        className={`px-4 py-3 text-sm font-medium transition ${
          statsView === 'player'
            ? 'border-b-2 border-lane-800 text-lane-800'
            : 'text-lane-600 hover:text-lane-800'
        }`}
      >
        Spieler-Statistiken
      </button>
      <button
        type="button"
        onClick={() => {
          setStatsView('day');
          setSelectedPlayer(null);
          setExpandedGameId(null);
        }}
        className={`px-4 py-3 text-sm font-medium transition ${
          statsView === 'day'
            ? 'border-b-2 border-lane-800 text-lane-800'
            : 'text-lane-600 hover:text-lane-800'
        }`}
      >
        Tages-Statistiken
      </button>
    </div>
  );

  // ── Player detail view (within player stats view) ──
  if (selectedPlayer && statsView === 'player') {
    const playerGames = getPlayerGames(games, selectedPlayer)
      .slice().sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id);
    const summary = players.find((p) => p.name === selectedPlayer);
    const trendData = buildPlayerTrendData(games, selectedPlayer);

    return (
      <div>
        {statsNavigation}
        <div className="grid gap-4">
          <button type="button"
            className="flex items-center gap-1.5 self-start rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70"
            onClick={() => {
              setSelectedPlayer(null);
              setExpandedGameId(null);
              setIsEditingPlayer(false);
              setRenameError('');
              setRenameNotice('');
            }}
          >← Alle Spieler</button>

        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isEditingPlayer ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editingPlayerName}
                    onChange={(e) => setEditingPlayerName(e.target.value)}
                    className="min-w-[220px] rounded-lg border border-lane-200 px-3 py-2 text-base font-semibold text-lane-900 outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Spielername"
                  />
                  <button
                    type="button"
                    className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRenamePlayer}
                    disabled={renamingPlayer}
                  >
                    {renamingPlayer ? 'Speichert...' : 'Speichern'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
                    onClick={() => {
                      setIsEditingPlayer(false);
                      setEditingPlayerName(selectedPlayer);
                      setRenameError('');
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-lane-900">{selectedPlayer}</h2>
                  <button
                    type="button"
                    className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-lane-50"
                    onClick={() => {
                      setEditingPlayerName(selectedPlayer);
                      setIsEditingPlayer(true);
                      setRenameError('');
                      setRenameNotice('');
                    }}
                  >
                    Spieler bearbeiten
                  </button>
                </div>
              )}
              {renameError ? <p className="mt-2 text-sm text-red-700">{renameError}</p> : null}
              {!renameError && renameNotice ? <p className="mt-2 text-sm text-green-700">{renameNotice}</p> : null}
            </div>
          </div>
          {summary && (
            <div className="mt-3 flex flex-wrap gap-3">
              <StatCard label="Spiele" value={summary.gamesPlayed} />
              <StatCard label="Durchschnitt" value={summary.avgScore} />
              <StatCard label="Bestleistung" value={summary.maxScore} />
            </div>
          )}
        </div>

        {trendData.length > 1 && (
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-lane-800">Punkte pro Spiel</h3>
                <p className="text-xs text-lane-600">Rundenzahl = Spielnummer × 10.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ChartToggle active={showPersonalGame} label="Personal Spiel" onClick={() => setShowPersonalGame((value) => !value)} />
                <ChartToggle active={showRoundNumber} label="Rundenzahl" onClick={() => setShowRoundNumber((value) => !value)} />
                <ChartToggle active={showPersonalBest} label="Bestspiel" onClick={() => setShowPersonalBest((value) => !value)} />
              </div>
            </div>
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
                <Legend />
                {showPersonalBest && summary && (
                  <ReferenceLine y={summary.maxScore} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Bestspiel', position: 'insideTopRight', fill: '#92400e', fontSize: 12 }} />
                )}
                {showPersonalGame && <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="Personal Spiel" />}
                {showRoundNumber && <Line type="monotone" dataKey="roundNumber" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} name="Rundenzahl" tooltipType="none" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <PlayerStatsSection games={games} playerName={selectedPlayer} />

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold text-lane-800">Alle Spiele ({playerGames.length})</h3>
          {playerGames.map((game) => {
            const playerScore = game.scores.find((s) => s.player_name === selectedPlayer);
            const otherPlayers = game.scores.filter((s) => s.player_name !== selectedPlayer);
            const isExpanded = expandedGameId === game.id;
            const gameAvg = Math.round(game.scores.reduce((a, s) => a + s.total_score, 0) / game.scores.length);
            const gameMax = Math.max(...game.scores.map((s) => s.total_score));
            return (
              <div key={game.id} className="rounded-[1.3rem] border border-lane-200 bg-white/90 overflow-hidden">
                <button type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-lane-50"
                  onClick={() => setExpandedGameId(isExpanded ? null : game.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-lane-800">{game.location}</span>
                      <span className="text-xs text-lane-500">{game.played_at}</span>
                    </div>
                    {otherPlayers.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-lane-500">
                        mit {otherPlayers.map((s) => `${s.player_name} (${s.total_score})`).join(', ')}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-lane-400">⌀ {gameAvg} · Max {gameMax}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="rounded-full bg-lane-800 px-3 py-0.5 text-sm font-semibold text-white">
                      {playerScore?.total_score ?? '–'}
                    </span>
                    <span className="text-lane-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-lane-200 p-4">
                    <GameChart game={game} highlightPlayer={selectedPlayer} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
        </div>
      );
    }

  // ── Main stats view ──
  return (
    <div>
      {statsNavigation}

      {statsView === 'play' && (
        <div className="grid gap-4">
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const todayGameCount = games.filter((g) => g.played_at === today).length;
            const openGameHandler = (id: number) => setExpandedGameId((prev) => (prev === id ? null : id));

            return (
              <>
                {todayGameCount >= 2 ? (
                  <TodaySessionSection games={games} players={players} />
                ) : (
                  <TodaysGames games={games} onOpenGame={openGameHandler} />
                )}

                {expandedGameId && !selectedPlayer && (() => {
                  const game = games.find((g) => g.id === expandedGameId);
                  if (!game) return null;
                  return (
                    <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-lane-200">
                        <div>
                          <span className="text-sm font-semibold text-lane-800">{game.location}</span>
                          <span className="ml-2 text-xs text-lane-500">{game.played_at}</span>
                        </div>
                        <button type="button"
                          className="rounded-full border border-lane-300 px-3 py-1 text-xs font-medium text-lane-700 transition hover:bg-lane-50"
                          onClick={() => setExpandedGameId(null)}
                        >Schließen</button>
                      </div>
                      <div className="p-4"><GameChart game={game} /></div>
                    </div>
                  );
                })()}

                <SocialStatsSection games={games} players={players} />

                <PastSessionsList games={games} players={players} />
              </>
            );
          })()}
        </div>
      )}

      {statsView === 'player' && (
        <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 overflow-hidden">
          <h3 className="px-5 pt-4 pb-2 text-sm font-semibold text-lane-800">Spieler</h3>
          {players.map((player, i) => {
            const recentGames = getPlayerGames(games, player.name)
              .slice().sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id).slice(0, 3);
            return (
              <button key={player.name} type="button"
                className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-lane-50 ${i < players.length - 1 ? 'border-b border-lane-100' : ''}`}
                onClick={() => { setSelectedPlayer(player.name); setExpandedGameId(null); }}
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-lane-900">{player.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-lane-500">
                    Zuletzt: {recentGames.map((g) => {
                      const s = g.scores.find((s) => s.player_name === player.name);
                      return `${s?.total_score ?? '–'} (${g.played_at})`;
                    }).join('  ·  ')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-lane-500">{player.gamesPlayed} Spiele</p>
                    <p className="text-sm text-lane-700">
                      <span className="font-semibold text-lane-900">⌀ {player.avgScore}</span>
                      <span className="ml-2 text-lane-500">Max {player.maxScore}</span>
                    </p>
                  </div>
                  <span className="text-lane-400 text-sm">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {statsView === 'day' && (
        <div>
          <PastSessionsList games={games} players={players} />
        </div>
      )}
    </div>
  );
}
