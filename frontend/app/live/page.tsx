'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Navigation from '@/components/navigation';
import LaneCalibrationPanel from '@/components/lane-calibration-panel';
import SplitPatternPopover from '@/components/split-pattern-popover';
import Card from '@/components/ui/card';
import {
  type ThrowCorrectionAction,
  correctTrackingThrow,
  createGame,
  createTrackingSession,
  fetchGames,
  fetchTrackingEvents,
  fetchTrackingSession,
  getTrackingWebSocketUrl,
  resetTrackingSession,
  setTrackingPlayers,
} from '@/lib/api';
import type { BallPathPoint, LiveEvent, ThrowAnalysis, TrackingPlayerCard, TrackingSession } from '@/types';
import { isLaneControlMessage, laneRequest, type CompanionCommand, type CompanionStatus, type LaneControlMessage } from '@/lib/lane-calibration';

const DEFAULT_SESSION_ID = 'demo-session';
const DEFAULT_GAME_LOCATION = 'Squash House';
const FINAL_THROW_REVIEW_DELAY_MS = 5_000;
const MAX_VISIBLE_EVENTS = 30;
const LANE_LENGTH_M = 18.29;
const BOARD_COUNT = 39;
const LANE_WIDTH_IN = 41.5;
const PIN_CENTER_SPACING_IN = 12;
const PIN_SPACING_PCT = (PIN_CENTER_SPACING_IN / LANE_WIDTH_IN) * 100;
const PIN_DECK_HEIGHT_PCT = 13;
const PIN_HEADER_Y_PCT = PIN_DECK_HEIGHT_PCT;
// Pin 1 stands ON the pin-header line (the lane coordinate 18.29 m IS the head pin), with the
// deeper rows behind it — so the drawn trajectory ends exactly at pin 1, not short of the deck.
const PIN_DECK_PIN1_PCT = 6; // small visual inset of pin 1 from the header line, % of deck depth
const PIN_DECK_ROW_STEP_PCT = 26; // row-to-row spacing, % of deck depth
// The rack's front envelope is a triangle: pin 1 at the head-pin line, pins 7/10 three rows
// deeper. An off-centre ball rolls past the header line until it meets that envelope.
const PIN_ROW_SPACING_M = 0.2637; // 12 in × sin 60°
const RACK_BACK_DEPTH_M = 3 * PIN_ROW_SPACING_M;
// Centre → pin 7/10 in boards (1.5 pin spacings expressed in board widths).
const RACK_HALF_SPREAD_BOARDS = (1.5 * PIN_CENTER_SPACING_IN * BOARD_COUNT) / LANE_WIDTH_IN;
// Collision reach for the first-hit search: ball centre within (ball + pin radius) of a pin centre.
const BOARD_WIDTH_M = (LANE_WIDTH_IN * 0.0254) / BOARD_COUNT;
const HIT_RADIUS_BOARDS = (0.108 + 0.061) / BOARD_WIDTH_M; // ball radius + pin body radius, ≈6 boards
// Visible gutters on each side of the wood. Boards 1..39 span only the band between them, so a
// ball at board 2–4 clearly renders ON the lane near the edge instead of appearing "in the gutter".
const GUTTER_PCT = 7;
// 12 in pin spacing expressed in boards, so deck pins sit on the same axis as the ball path.
const PIN_BOARD_SPACING = (PIN_CENTER_SPACING_IN * BOARD_COUNT) / LANE_WIDTH_IN;

/** Cross-axis position of a board: the wood band between the gutters; off-lane values land in them. */
function mapBoardPct(board: number) {
  const inner = 100 - 2 * GUTTER_PCT;
  const pct = GUTTER_PCT + ((board - 0.5) / BOARD_COUNT) * inner;
  return Math.max(1, Math.min(99, pct));
}

const PIN_LAYOUT = [
  { pin: 7, row: 0, offset: -1.5 },
  { pin: 8, row: 0, offset: -0.5 },
  { pin: 9, row: 0, offset: 0.5 },
  { pin: 10, row: 0, offset: 1.5 },
  { pin: 4, row: 1, offset: -1 },
  { pin: 5, row: 1, offset: 0 },
  { pin: 6, row: 1, offset: 1 },
  { pin: 2, row: 2, offset: -0.5 },
  { pin: 3, row: 2, offset: 0.5 },
  { pin: 1, row: 3, offset: 0 },
];

type PinState = 'standing' | 'already-down' | 'new-down';

function pinDeckPosition(pin: (typeof PIN_LAYOUT)[number], horizontal: boolean) {
  return {
    x: horizontal ? 88 - pin.row * 23 : 50 + pin.offset * PIN_SPACING_PCT,
    y: horizontal ? 50 + pin.offset * PIN_SPACING_PCT : 19 + pin.row * 23,
  };
}

function pinClass(state: PinState, interactive = false) {
  const base = interactive ? 'transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-coral/60' : '';
  if (state === 'new-down' || state === 'already-down') return `${base} border-2 border-[var(--split-pin-color)] bg-transparent text-transparent opacity-95 shadow`;
  return `${base} border-2 border-[var(--split-pin-color)] bg-[var(--split-pin-color)] text-lane-950 shadow`;
}

function isThrowAnalysis(payload: LiveEvent['payload']): payload is LiveEvent['payload'] & ThrowAnalysis {
  return typeof payload.player === 'string' && typeof payload.frame === 'number' && typeof payload.throw === 'number';
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return `${value.toFixed(1)}${suffix}`;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitMetadata(fallenPins: number[][] | undefined) {
  const firstBallFallen = new Set(fallenPins?.[0] ?? []);
  if (!firstBallFallen.has(1)) return null;

  const standingPins = PIN_LAYOUT.map((pin) => pin.pin).filter((pin) => !firstBallFallen.has(pin)).sort((a, b) => a - b);
  if (standingPins.length < 2) return null;

  const pinByNumber = new Map(PIN_LAYOUT.map((pin) => [pin.pin, pin]));
  const seen = new Set<number>();
  let groups = 0;

  const adjacentPins = (pinNumber: number) => {
    const pin = pinByNumber.get(pinNumber);
    if (!pin) return [];
    return standingPins.filter((candidateNumber) => {
      if (candidateNumber === pinNumber) return false;
      const candidate = pinByNumber.get(candidateNumber);
      if (!candidate) return false;
      const dx = candidate.offset - pin.offset;
      const dy = (candidate.row - pin.row) * 0.866;
      return Math.hypot(dx, dy) <= 1.05;
    });
  };

  for (const pin of standingPins) {
    if (seen.has(pin)) continue;
    groups += 1;
    const queue = [pin];
    seen.add(pin);
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacentPins(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  if (groups <= 1) return null;
  const secondBallFallen = new Set(fallenPins?.[1] ?? []);
  const converted = standingPins.every((pin) => secondBallFallen.has(pin));
  return { isSplit: true, converted, standingPins };
}

// Backend now serializes camelCase, but stay defensive against the snake_case spelling.
function distanceOf(point: { distanceM?: number; distance_m?: number }): number {
  return point.distanceM ?? point.distance_m ?? 0;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    session_created: 'Session erstellt',
    session_snapshot: 'Session synchronisiert',
    companion_connected: 'Companion verbunden',
    live_client_connected: 'Live-Client verbunden',
    live_client_disconnected: 'Live-Client getrennt',
    throw_analyzed: 'Wurf analysiert',
    score_updated: 'Score aktualisiert',
    low_confidence_detection: 'Niedrige Konfidenz',
    session_reset: 'Neues Spiel gestartet',
    throw_corrected: 'Wurf korrigiert',
  };
  return labels[type] ?? type;
}

function PinLegend() {
  const items: { state: PinState; label: string }[] = [
    { state: 'new-down', label: 'neu gefallen' },
    { state: 'already-down', label: 'bereits gefallen' },
    { state: 'standing', label: 'steht noch' },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] font-bold text-lane-500">
      {items.map((item) => (
        <span key={item.state} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-full border ${pinClass(item.state)}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function PinPatternDeck({
  value,
  alreadyDown = [],
  onChange,
  disabled,
  compact = false,
}: {
  value: number[];
  alreadyDown?: number[];
  onChange?: (next: number[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = new Set(value);
  const already = new Set(alreadyDown);
  const toggle = (pin: number) => {
    if (!onChange || disabled || already.has(pin)) return;
    const next = new Set(selected);
    if (next.has(pin)) next.delete(pin);
    else next.add(pin);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div
      className={`relative shrink-0 rounded-xl border border-lane-200 bg-[var(--lane-deck)] ${compact ? 'h-24 w-32' : 'h-32 w-44'}`}
      aria-label="Pin-Muster"
    >
      {PIN_LAYOUT.map((pin) => {
        const { x, y } = pinDeckPosition(pin, false);
        const state: PinState = selected.has(pin.pin) ? 'new-down' : already.has(pin.pin) ? 'already-down' : 'standing';
        const size = compact ? 'h-6 w-6 text-[0.62rem]' : 'h-7 w-7 text-[0.68rem]';
        const className = `absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 font-black tabular-nums ${size} ${pinClass(state, Boolean(onChange))}`;
        if (onChange) {
          return (
            <button
              key={pin.pin}
              type="button"
              onClick={() => toggle(pin.pin)}
              disabled={disabled || already.has(pin.pin)}
              className={className}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-pressed={selected.has(pin.pin)}
              aria-label={`Pin ${pin.pin} ${selected.has(pin.pin) ? 'entfernen' : 'als gefallen markieren'}`}
              title={`Pin ${pin.pin}`}
            >
              {pin.pin}
            </button>
          );
        }
        return (
          <span key={pin.pin} className={className} style={{ left: `${x}%`, top: `${y}%` }} title={`Pin ${pin.pin}`}>
            {pin.pin}
          </span>
        );
      })}
    </div>
  );
}

/** One ball's display glyph in the score table (X strike, / spare, - gutter). */
function ballGlyph(frame: TrackingPlayerCard['frames'][number], ballIndex: number): string {
  const pins = frame.throws[ballIndex];
  if (pins === undefined) return '';
  if (pins >= 10) return 'X';
  if (ballIndex > 0) {
    const prev = frame.throws[ballIndex - 1] ?? 0;
    if (prev < 10 && prev + pins >= 10) return '/';
  }
  return pins === 0 ? '–' : String(pins);
}

/** A realistic lane viewed from behind. Vertical (default, mobile): pin deck at the
 *  top, foul line at the bottom. Horizontal (wide screens): pin deck on the right,
 *  foul line on the left — the same lane rotated a quarter-turn. */
function LaneView({
  lastThrow,
  orientation = 'vertical',
  pinPattern,
  alreadyDownPins = [],
  onPinPatternChange,
  pinPatternDisabled,
}: {
  lastThrow: ThrowAnalysis | undefined;
  orientation?: 'vertical' | 'horizontal';
  pinPattern?: number[];
  alreadyDownPins?: number[];
  onPinPatternChange?: (next: number[]) => void;
  pinPatternDisabled?: boolean;
}) {
  const horizontal = orientation === 'horizontal';
  // Distance from the foul line to the pin header, as a percentage of the lane's long axis.
  const headerLengthPct = horizontal ? 100 - PIN_DECK_HEIGHT_PCT : PIN_HEADER_Y_PCT;

  const mapBoard = mapBoardPct;
  // Full-scale endpoint: LANE_LENGTH_M is the head pin, which sits slightly INSIDE the deck — the
  // trajectory is drawn all the way onto pin 1 instead of stopping at the header line.
  const pin1AlongV = PIN_DECK_HEIGHT_PCT * (1 - PIN_DECK_PIN1_PCT / 100);
  const pin1AlongH = headerLengthPct + PIN_DECK_HEIGHT_PCT * (PIN_DECK_PIN1_PCT / 100);
  // Distances beyond the head pin (into the rack) map along the deck's row spacing.
  const deckPctPerMeter = ((PIN_DECK_ROW_STEP_PCT / 100) * PIN_DECK_HEIGHT_PCT) / PIN_ROW_SPACING_M;
  // Vertical: distance runs bottom (foul) → top (pins).
  const mapDistanceV = (distanceM: number) => {
    if (distanceM >= LANE_LENGTH_M) {
      return Math.max(1, pin1AlongV - (distanceM - LANE_LENGTH_M) * deckPctPerMeter);
    }
    const y = pin1AlongV + (1 - distanceM / LANE_LENGTH_M) * (100 - pin1AlongV);
    return Math.min(99, y);
  };
  // Horizontal: distance runs left (foul) → right (pins).
  const mapDistanceH = (distanceM: number) => {
    if (distanceM >= LANE_LENGTH_M) {
      return Math.min(99, pin1AlongH + (distanceM - LANE_LENGTH_M) * deckPctPerMeter);
    }
    return Math.max(1, (distanceM / LANE_LENGTH_M) * pin1AlongH);
  };
  // Project a (board, distance) lane coordinate onto container percentages.
  const pos = (board: number, distanceM: number) =>
    horizontal
      ? { left: mapDistanceH(distanceM), top: mapBoard(board) }
      : { left: mapBoard(board), top: mapDistanceV(distanceM) };

  const path: BallPathPoint[] = lastThrow?.path ?? [];
  const curve = lastThrow?.curve;
  // The path data ends at the head-pin line, but the ball rolls on into the rack until it MEETS a
  // pin. First-collision search: walk the rows front-to-back and stop at the first pin whose
  // centre line the ball's centre passes within collision reach (ball radius + pin radius) — not
  // just the rack's outer triangle, which let the endpoint land "behind" a pin it grazed.
  const rackHit = (() => {
    if (path.length < 2) return null;
    const end = path[path.length - 1];
    // Robust end direction: pair the last point with one a stretch back — the immediate
    // neighbour may be a near-duplicate whose slope is noise, which kinked the extension.
    let ref = path[path.length - 2];
    for (let i = path.length - 2; i >= 0; i--) {
      ref = path[i];
      if (distanceOf(end) - distanceOf(ref) >= 1.5) break;
    }
    const dDist = distanceOf(end) - distanceOf(ref);
    const slope = dDist > 1e-6 ? (end.board - ref.board) / dDist : 0;
    const ballAt = (depth: number) => end.board + slope * depth;
    const down = new Set(alreadyDownPins.length ? alreadyDownPins : lastThrow?.alreadyDownPins ?? []);
    const radiusM = HIT_RADIUS_BOARDS * BOARD_WIDTH_M;
    const directionX = slope * BOARD_WIDTH_M;
    const directionLengthSq = directionX * directionX + 1;
    let firstCollision: { board: number; distanceM: number; travel: number } | null = null;
    for (const pin of PIN_LAYOUT) {
      if (down.has(pin.pin)) continue;
      const pinDepth = (3 - pin.row) * PIN_ROW_SPACING_M;
      const pinX = (20 + pin.offset * PIN_BOARD_SPACING - end.board) * BOARD_WIDTH_M;
      const projection = (pinX * directionX + pinDepth) / directionLengthSq;
      if (projection < 0) continue;
      const closestX = projection * directionX;
      const closestDepth = projection;
      const missSq = (closestX - pinX) ** 2 + (closestDepth - pinDepth) ** 2;
      if (missSq > radiusM ** 2) continue;
      const offset = Math.sqrt((radiusM ** 2 - missSq) / directionLengthSq);
      const travel = Math.max(0, projection - offset);
      if (!firstCollision || travel < firstCollision.travel) {
        firstCollision = { board: ballAt(travel), distanceM: LANE_LENGTH_M + travel, travel };
      }
    }
    if (firstCollision) return { board: firstCollision.board, distanceM: firstCollision.distanceM };
    // Reaches nothing (edge/gutter ball): fall back to the rack's outer envelope.
    const depth = Math.min(RACK_BACK_DEPTH_M, (Math.abs(ballAt(0) - 20) / RACK_HALF_SPREAD_BOARDS) * RACK_BACK_DEPTH_M);
    return { board: ballAt(depth), distanceM: LANE_LENGTH_M + depth };
  })();
  const polyline =
    path.length >= 2
      ? [...path, ...(rackHit ? [rackHit] : [])]
          .map((p) => {
            const q = pos(p.board, distanceOf(p));
            return `${q.left},${q.top}`;
          })
          .join(' ')
      : null;
  const markers = [
    { key: 'launch', label: 'Start', point: curve?.launch, color: '#16a34a' },
    { key: 'apex', label: 'Hook', point: curve?.apex, color: '#f59e0b' },
    { key: 'impact', label: 'Pins', point: rackHit ?? curve?.impact, color: '#e11d48' },
  ];
  const knockedPins = Math.max(0, Math.min(10, lastThrow?.pinsKnockedDown ?? 0));
  const canEditPins = Boolean(onPinPatternChange) && !pinPatternDisabled;
  const shownFallenPins = pinPattern ?? lastThrow?.fallenPins ?? null;
  const newDownSet = shownFallenPins ? new Set(shownFallenPins) : null;
  const alreadyDownSet = new Set(alreadyDownPins.length ? alreadyDownPins : lastThrow?.alreadyDownPins ?? []);
  const boardGuides = [5, 10, 15, 20, 25, 30, 35];
  const arrowDistance = 4.5; // bowling arrows sit ~4.5 m down the lane
  const togglePin = (pin: number) => {
    if (!onPinPatternChange || pinPatternDisabled || alreadyDownSet.has(pin)) return;
    const selected = new Set(pinPattern ?? []);
    if (selected.has(pin)) selected.delete(pin);
    else selected.add(pin);
    onPinPatternChange([...selected].sort((a, b) => a - b));
  };

  const containerClass = horizontal
    ? 'relative h-[170px] w-full overflow-hidden rounded-[1.5rem] border-2 bg-gradient-to-l from-[var(--lane-wood-top)] via-[var(--lane-wood-mid)] to-[var(--lane-wood-bottom)] shadow-inner xl:h-[200px]'
    : 'relative h-[440px] w-full overflow-hidden rounded-[1.5rem] border-2 bg-gradient-to-b from-[var(--lane-wood-top)] via-[var(--lane-wood-mid)] to-[var(--lane-wood-bottom)] shadow-inner sm:h-[560px]';

  return (
    <div className={containerClass} style={{ borderColor: 'var(--lane-edge)' }}>
      {/* Gutters: the wood spans only boards 1–39 between these strips. */}
      <div
        className={horizontal ? 'absolute inset-x-0 top-0' : 'absolute inset-y-0 left-0'}
        style={horizontal ? { height: `${GUTTER_PCT}%`, background: 'var(--lane-deck)', opacity: 0.55 } : { width: `${GUTTER_PCT}%`, background: 'var(--lane-deck)', opacity: 0.55 }}
      />
      <div
        className={horizontal ? 'absolute inset-x-0 bottom-0' : 'absolute inset-y-0 right-0'}
        style={horizontal ? { height: `${GUTTER_PCT}%`, background: 'var(--lane-deck)', opacity: 0.55 } : { width: `${GUTTER_PCT}%`, background: 'var(--lane-deck)', opacity: 0.55 }}
      />

      {/* Pin deck beyond the playable lane — same wood as the lane; the header line marks it.
        Pin 1 stands right at that line (lane coordinate 18.29 m = head pin). */}
      <div className={`${horizontal ? 'absolute inset-y-0 right-0 w-[13%]' : 'absolute inset-x-0 top-0 h-[13%]'} z-20`}>
        {PIN_LAYOUT.map((pin, index) => {
          // Cross-axis from the pin's true BOARD, so the drawn line points at the pin it hit.
          const cross = mapBoardPct(20 + pin.offset * PIN_BOARD_SPACING);
          const inset = PIN_DECK_PIN1_PCT + (3 - pin.row) * PIN_DECK_ROW_STEP_PCT;
          const along = horizontal ? inset : 100 - inset;
          const x = horizontal ? along : cross;
          const y = horizontal ? cross : along;
          const state: PinState = newDownSet
            ? newDownSet.has(pin.pin)
              ? 'new-down'
              : alreadyDownSet.has(pin.pin)
                ? 'already-down'
                : 'standing'
            : index < knockedPins
              ? 'new-down'
              : 'standing';
          const visualPinClassName = `h-3.5 w-3.5 rounded-full border-2 sm:h-4 sm:w-4 ${pinClass(state, canEditPins)}`;
          if (onPinPatternChange) {
            return (
              <button
                key={pin.pin}
                type="button"
                onClick={() => togglePin(pin.pin)}
                disabled={pinPatternDisabled || state === 'already-down'}
                className="absolute grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center p-0 sm:h-12 sm:w-12"
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-pressed={newDownSet?.has(pin.pin) ?? false}
                aria-label={`Pin ${pin.pin} ${newDownSet?.has(pin.pin) ? 'entfernen' : 'als gefallen markieren'}`}
                title={`Pin ${pin.pin}${state === 'new-down' ? ' neu gefallen' : state === 'already-down' ? ' bereits gefallen' : ' steht'}`}
              >
                <span className={`pointer-events-none ${visualPinClassName}`} />
              </button>
            );
          }
          return (
            <span
              key={pin.pin}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${visualPinClassName}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              title={`Pin ${pin.pin}${state === 'new-down' ? ' neu gefallen' : state === 'already-down' ? ' bereits gefallen' : ' steht'}`}
            />
          );
        })}
      </div>

      {/* Pin header line: end of the measured ball trajectory, before the pin deck. */}
      <div
        className={horizontal ? 'absolute inset-y-0 w-[2px]' : 'absolute inset-x-0 h-[2px]'}
        style={
          horizontal
            ? { left: `${headerLengthPct}%`, background: 'var(--lane-foul)' }
            : { top: `${headerLengthPct}%`, background: 'var(--lane-foul)' }
        }
      />

      {/* Big transparent speed watermark, sized to the whole lane so it's readable from across the
        room. Sits over the lane wood but under the ball curve (drawn by the svg below). */}
      {lastThrow?.ballSpeedKmh != null && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <span
            className={`font-black leading-none tabular-nums ${horizontal ? 'text-[5rem] xl:text-[7rem]' : 'text-[4rem] sm:text-[7rem]'}`}
            style={{ color: 'var(--foreground)', opacity: 0.18 }}
          >
            {formatNumber(lastThrow.ballSpeedKmh)}
          </span>
          <span
            className={`font-black tracking-[0.35em] ${horizontal ? 'text-sm' : 'text-xl sm:text-2xl'}`}
            style={{ color: 'var(--foreground)', opacity: 0.18 }}
          >
            KM/H
          </span>
        </div>
      )}

      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* board guide lines */}
        {boardGuides.map((b) => {
          const a = pos(b, 0);
          const c = pos(b, LANE_LENGTH_M);
          return <line key={b} x1={a.left} y1={a.top} x2={c.left} y2={c.top} style={{ stroke: 'var(--lane-board-line)' }} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
        })}
        {/* the throw */}
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            style={{ stroke: 'var(--lane-path)' }}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* bowling arrows */}
      {boardGuides.map((b) => {
        const q = pos(b, arrowDistance);
        return (
          <span
            key={`arrow-${b}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[0.6rem] font-black"
            style={{ left: `${q.left}%`, top: `${q.top}%`, color: 'var(--lane-arrow)' }}
          >
            ▲
          </span>
        );
      })}

      {/* foul line */}
      <div className={horizontal ? 'absolute inset-y-0 left-0 w-[1.5%]' : 'absolute inset-x-0 bottom-0 h-[1.5%]'} style={{ background: 'var(--lane-foul)' }} />

      {/* shape markers */}
      {markers.map((m) => {
        if (!m.point) return null;
        const q = pos(m.point.board, distanceOf(m.point));
        return (
          <span
            key={m.key}
            className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg"
            style={{ left: `${q.left}%`, top: `${q.top}%`, borderColor: m.color, background: m.key === 'impact' ? 'transparent' : m.color }}
            title={m.label}
          />
        );
      })}

      {/* label */}
      <div className={`absolute left-2 ${horizontal ? 'top-2' : 'top-[15%]'} rounded-lg bg-lane-950/70 px-2 py-1 text-[0.7rem] font-black text-amber-50`}>
        {!lastThrow
          ? 'Warte auf Wurf…'
          : lastThrow.isCurve
            ? `Hook ${formatNumber(lastThrow.curveBoards)} Boards`
            : 'Gerader Wurf'}
      </div>
      {!polyline && lastThrow && (
        <p className="absolute inset-x-2 bottom-6 text-center text-xs font-bold" style={{ color: 'var(--foreground)' }}>
          Keine Kurvendaten für diesen Wurf.
        </p>
      )}
    </div>
  );
}

/** Compact 0–10 pin stepper (10 shown as a strike "X"), matching the player-count control. */
function PinStepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-lane-100 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-black text-lane-700 shadow disabled:opacity-40"
        aria-label="Weniger Pins"
      >
        −
      </button>
      <span className="min-w-[2rem] text-center text-base font-black tabular-nums">{value >= 10 ? 'X' : value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(10, value + 1))}
        disabled={disabled || value >= 10}
        className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-black text-lane-700 shadow disabled:opacity-40"
        aria-label="Mehr Pins"
      >
        +
      </button>
    </div>
  );
}

export default function LivePage() {
  const [session, setSession] = useState<TrackingSession | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [laneControlMessage, setLaneControlMessage] = useState<LaneControlMessage | null>(null);
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus | null>(null);
  const [companionCommandMessage, setCompanionCommandMessage] = useState<string | null>(null);
  const [winnerOpen, setWinnerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [insertPins, setInsertPins] = useState(0);
  const [expandedThrowIndex, setExpandedThrowIndex] = useState<number | null>(null);
  const [playerNameDrafts, setPlayerNameDrafts] = useState<string[]>([]);
  const [editingNameIndex, setEditingNameIndex] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioContextRef.current = new AudioContextCtor();
    }
    return audioContextRef.current;
  };

  const playThrowBing = () => {
    const audio = getAudioContext();
    if (!audio || audio.state !== 'running') return;

    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  };

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const unlockAudio = () => {
      const audio = getAudioContext();
      if (audio?.state === 'suspended') {
        audio.resume().catch(() => undefined);
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    const applyEvent = (event: LiveEvent) => {
      if (event.type === 'session_snapshot') {
        if (event.payload.session) setSession(event.payload.session);
        if (Array.isArray(event.payload.events)) {
          setEvents(event.payload.events.slice(-MAX_VISIBLE_EVENTS));
        }
        return;
      }

      if (event.payload.session) {
        setSession(event.payload.session);
      }
      if (event.type === 'companion_connected') {
        setSession((current) => current ? { ...current, companionConnected: true } : current);
      } else if (event.type === 'companion_disconnected') {
        setSession((current) => current ? { ...current, companionConnected: false } : current);
      }

      setEvents((current) => [...current, event].slice(-MAX_VISIBLE_EVENTS));
    };

    const openSocket = async () => {
      try {
        setError(null);
        setConnectionState('connecting');
        const existingSession = await fetchTrackingSession(DEFAULT_SESSION_ID).catch(() => createTrackingSession([], DEFAULT_SESSION_ID));
        if (cancelled) return;
        setSession(existingSession);

        const history = await fetchTrackingEvents(existingSession.sessionId).catch(() => []);
        if (!cancelled) setEvents(history.slice(-MAX_VISIBLE_EVENTS));

        const socket = new WebSocket(getTrackingWebSocketUrl(existingSession.sessionId));
        socketRef.current = socket;

        socket.onopen = () => setConnectionState('open');
        socket.onmessage = (message) => {
          const parsed: unknown = JSON.parse(message.data);
          if (isLaneControlMessage(parsed)) {
            if (parsed.type === 'companion.status') setCompanionStatus(parsed.payload);
            if (parsed.type === 'companion.command.applied') {
              setCompanionCommandMessage(`${parsed.payload.command}: ausgeführt`);
              if (typeof parsed.payload.zoom === 'number') setCompanionStatus((current) => current ? { ...current, zoom: parsed.payload.zoom! } : current);
            }
            if (parsed.type === 'companion.command.rejected') setCompanionCommandMessage(`${parsed.payload.command}: ${parsed.payload.message}`);
            setLaneControlMessage(parsed);
            return;
          }
          const event = parsed as LiveEvent;
          if (event.type === 'throw_analyzed') playThrowBing();
          applyEvent(event);
        };
        socket.onerror = () => setError('Live-Verbindung konnte nicht stabil aufgebaut werden.');
        socket.onclose = () => {
          setConnectionState('closed');
          setLaneControlMessage(null);
          if (!cancelled) {
            reconnectTimer = setTimeout(openSocket, 2000);
          }
        };
      } catch (err) {
        if (cancelled) return;
        setConnectionState('closed');
        setError(err instanceof Error ? err.message : 'Live-Session konnte nicht geladen werden.');
        reconnectTimer = setTimeout(openSocket, 3000);
      }
    };

    openSocket();

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  const throwEvents = useMemo(
    () => events.filter((event) => event.type === 'throw_analyzed' && isThrowAnalysis(event.payload)),
    [events],
  );
  const lastThrow = throwEvents.at(-1)?.payload as ThrowAnalysis | undefined;
  const scoreboard = session?.scoreboard ?? null;
  const loggedThrows = scoreboard?.throws ?? [];
  const latestLoggedThrow = loggedThrows.at(-1);
  const sessionNameKey = session?.playerNames.join('\u0000') ?? '';

  useEffect(() => {
    if (!session || editingNameIndex !== null) return;
    setPlayerNameDrafts(
      Array.from({ length: session.playerCount }, (_, index) =>
        session.playerNames[index] ?? scoreboard?.players?.[index]?.name ?? `Spieler ${index + 1}`,
      ),
    );
  }, [editingNameIndex, scoreboard?.players, session, sessionNameKey]);

  const connectionText = connectionState === 'open' ? 'Verbunden' : connectionState === 'connecting' ? 'Verbinde…' : 'Getrennt';
  const sendLaneMessage = (message: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(message);
    return true;
  };

  const sendCompanionCommand = (command: CompanionCommand, zoom?: number) => {
    if (!session) return;
    const request = laneRequest(session.sessionId, 'companion.command', { command, ...(zoom === undefined ? {} : { zoom }) });
    setCompanionCommandMessage('Befehl wird gesendet…');
    if (!sendLaneMessage(JSON.stringify(request))) setCompanionCommandMessage('Live-Verbindung ist nicht bereit.');
  };

  useEffect(() => {
    if (!scoreboard?.isFinished) {
      setWinnerOpen(false);
      return;
    }
    if (expandedThrowIndex !== null) return;
    // Keep the live view unobstructed for a moment after the deciding delivery so its detected
    // pins can be checked before the winner dialog appears.
    const timer = window.setTimeout(() => setWinnerOpen(true), FINAL_THROW_REVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [expandedThrowIndex, scoreboard?.isFinished]);

  const reviewLatestThrow = () => {
    if (!latestLoggedThrow) return;
    setWinnerOpen(false);
    setExpandedThrowIndex(latestLoggedThrow.index);
    window.setTimeout(() => {
      document.getElementById(`live-throw-${latestLoggedThrow.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const startNewGame = async () => {
    if (!session) return;
    if (scoreboard?.throwCount && !window.confirm('Neues Spiel starten? Der aktuelle Score wird zurückgesetzt.')) return;
    setRosterBusy(true);
    try {
      const updated = await resetTrackingSession(session.sessionId);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neues Spiel konnte nicht gestartet werden.');
    } finally {
      setRosterBusy(false);
    }
  };

  const saveGame = async () => {
    if (!session || !scoreboard?.players?.length) return;
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const today = formatLocalDate(new Date());
      const defaultLocation = await fetchGames()
        .then((games) => games.find((game) => game.played_at === today)?.location?.trim() || DEFAULT_GAME_LOCATION)
        .catch(() => DEFAULT_GAME_LOCATION);
      const locationInput = window.prompt('Wo wurde gespielt?', defaultLocation);
      if (locationInput === null) return;
      const location = locationInput.trim() || DEFAULT_GAME_LOCATION;
      const scores = scoreboard.players
        .filter((player) => player.frames.length > 0)
        .map((player) => ({
          player_name: player.name,
          total_score: player.total,
          frames: player.frames.map((frame, fIdx) => {
            const fallenPins = frame.fallenPins ?? [];
            const split = splitMetadata(fallenPins);
            return {
              throw1: ballGlyph(frame, 0),
              throw2: ballGlyph(frame, 1),
              throw3: fIdx === 9 ? ballGlyph(frame, 2) : '',
              cumulative: frame.cumulative != null ? String(frame.cumulative) : '',
              // Per-ball fallen pins come from the scoreboard (the backend keeps them aligned to the
              // log, so they stay correct after manual corrections), for player pin stats.
              fallenPins,
              ballSpeedKmh: frame.ballSpeedKmh ?? [],
              ...(split ? { split } : {}),
            };
          }),
        }));
      if (!scores.length) {
        setError('Noch keine Würfe zum Speichern.');
        return;
      }
      const now = new Date();
      await createGame({ played_at: today, played_at_time: now.toTimeString().slice(0, 8), location, mode: '10-Pin', scores });
      if (scoreboard.isFinished) {
        const updated = await resetTrackingSession(session.sessionId);
        setSession(updated);
        setEvents([]);
        setExpandedThrowIndex(null);
        setWinnerOpen(false);
        sendCompanionCommand('clear-track');
      }
      setSaveMsg(`Spiel gespeichert: ${location}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spiel konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const applyCorrection = async (action: ThrowCorrectionAction, pins?: number, throwIndex?: number, fallenPins?: number[]) => {
    if (!session) return;
    setCorrecting(true);
    setError(null);
    setSaveMsg(null);
    try {
      const updated = await correctTrackingThrow(session.sessionId, action, pins, throwIndex, fallenPins);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Korrektur konnte nicht angewendet werden.');
    } finally {
      setCorrecting(false);
    }
  };

  const editThrowPattern = (throwIndex: number, pattern: number[]) => {
    applyCorrection('edit_at_pattern', pattern.length, throwIndex, pattern);
  };

  const deleteLoggedThrow = (throwIndex: number) => {
    const throwNumber = throwIndex + 1;
    if (window.confirm(`Wurf #${throwNumber} löschen? Alle späteren Würfe werden neu zugeordnet.`)) {
      applyCorrection('delete_at', undefined, throwIndex);
    }
  };

  const savePlayerNames = async (drafts = playerNameDrafts) => {
    if (!session) return;
    const count = session.playerCount;
    const nextNames = Array.from({ length: count }, (_, index) => (drafts[index] ?? '').trim());
    const currentNames = Array.from({ length: count }, (_, index) => (session.playerNames[index] ?? '').trim());
    if (nextNames.every((name, index) => name === currentNames[index])) return;

    setRosterBusy(true);
    setError(null);
    try {
      const updated = await setTrackingPlayers(session.sessionId, count, nextNames);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spielernamen konnten nicht gespeichert werden.');
      setPlayerNameDrafts(currentNames);
    } finally {
      setRosterBusy(false);
    }
  };

  const changePlayerCount = async (delta: number) => {
    if (!session) return;
    const next = Math.max(1, Math.min(8, session.playerCount + delta));
    if (next === session.playerCount) return;
    const nextNames = Array.from({ length: next }, (_, index) => playerNameDrafts[index] ?? session.playerNames[index] ?? '');
    setRosterBusy(true);
    try {
      const updated = await setTrackingPlayers(session.sessionId, next, nextNames);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spieleranzahl konnte nicht geändert werden.');
    } finally {
      setRosterBusy(false);
    }
  };

  // Live-data blocks, shared between the narrow (side-by-side) and wide (stacked) layouts.
  const aktuellCard = (
    <Card
      title="Aktuell"
      eyebrow
      header={session?.currentPlayer ?? 'Spieler 1'}
      headerSize="lg"
      subtext={`Frame ${session?.currentFrame ?? 1} · Wurf ${session?.currentThrow ?? 1}`}
    />
  );

  const metricCards = (
    <>
      <Card title="Pins" header={lastThrow?.pinsKnockedDown != null ? String(lastThrow.pinsKnockedDown) : '–'} headerSize="lg" padding="sm" />
      <Card title="Board" header={lastThrow ? formatNumber(lastThrow.impactBoard) : '–'} headerSize="lg" padding="sm" />
      <Card title="Hook" header={lastThrow?.isCurve ? formatNumber(lastThrow.curveBoards) : '0.0'} headerSize="lg" padding="sm" />
      <Card title="Winkel" header={lastThrow ? formatNumber(lastThrow.entryAngleDeg, '°') : '–'} headerSize="lg" padding="sm" />
      <Card title="Konfidenz" header={lastThrow?.confidence != null ? `${Math.round(lastThrow.confidence * 100)}%` : '–'} headerSize="lg" padding="sm" />
    </>
  );

  const lowConfidenceBadge = lastThrow?.lowConfidence ? (
    <span className="rounded-full bg-coral px-3 py-2 text-center text-xs font-black text-lane-950">Wurf prüfen — niedrige Konfidenz</span>
  ) : null;

  const historySection = (
    <section className="soft-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Wurf-Historie</p>
        <span className="text-xs font-bold text-lane-500">Eintrag anklicken, um Pins zu bearbeiten</span>
      </div>
      <div className="mt-3 divide-y divide-[var(--border)] rounded-2xl border" style={{ background: 'var(--surface-soft)', borderColor: 'var(--border)' }}>
        {[...loggedThrows].reverse().map((throwItem) => {
          const expanded = expandedThrowIndex === throwItem.index;
          return (
            <div key={throwItem.index} id={`live-throw-${throwItem.index}`} className="text-xs">
              <button
                type="button"
                onClick={() => setExpandedThrowIndex(expanded ? null : throwItem.index)}
                className="grid w-full grid-cols-[4.5rem_1fr_5rem_5rem_2rem] items-center gap-3 px-3 py-2 text-left transition"
                aria-expanded={expanded}
              >
                <span className="font-black tabular-nums text-lane-700">#{throwItem.index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate font-black text-lane-900">
                    {throwItem.player} · Frame {throwItem.frame} · Wurf {throwItem.throw}
                  </p>
                  <p className="truncate text-[0.68rem] font-bold text-lane-500">
                    {throwItem.manualCorrection ? 'korrigiert' : throwItem.manual ? 'manuell' : 'getrackt'}
                    {throwItem.lowConfidence ? ' · niedrige Konfidenz' : ''}
                    {throwItem.alreadyDownPins?.length ? ` · ignoriert: ${throwItem.alreadyDownPins.join(', ')}` : ''}
                    {throwItem.capturedAt ? ` · ${new Date(throwItem.capturedAt).toLocaleTimeString('de-DE')}` : ''}
                  </p>
                </div>
                <span className="font-black text-lane-800" title={throwItem.observedFallenPins?.length ? `Companion sah: ${throwItem.observedFallenPins.join(', ')}` : undefined}>
                  {throwItem.pinsKnockedDown ?? '–'} Pins
                </span>
                <span className="font-bold text-lane-600">{throwItem.ballSpeedKmh != null ? formatNumber(throwItem.ballSpeedKmh, ' km/h') : '–'}</span>
                <span className="justify-self-end text-lg font-black text-lane-500">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && (
                <div className="grid gap-4 border-t px-3 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <PinPatternDeck
                    value={throwItem.fallenPins ?? []}
                    alreadyDown={throwItem.alreadyDownPins ?? []}
                    onChange={(pattern) => editThrowPattern(throwItem.index, pattern)}
                    disabled={correcting || !session}
                  />
                  <div className="space-y-2">
                    <p className="text-sm font-black text-lane-900">Pin-Muster bearbeiten</p>
                    <PinLegend />
                    <p className="text-xs font-bold text-lane-500">
                      Rot zählt für diesen Wurf. Weiß steht noch. Nur Rahmen bedeutet: bereits unten.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteLoggedThrow(throwItem.index)}
                    disabled={correcting || !session}
                    className="rounded-full border border-red-200 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50 disabled:opacity-40"
                  >
                    Löschen
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!loggedThrows.length && (
          <p className="px-3 py-4 text-sm font-bold text-lane-500">Noch keine Würfe in der Historie.</p>
        )}
      </div>
    </section>
  );

  return (
    <>
      <Navigation />
      <main className="app-main">
        {/* Compact status bar */}
        <section className="soft-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
            <span className={`rounded-full border px-3 py-1.5 ${connectionState === 'open' ? 'border-transparent bg-emerald-400 text-emerald-950' : 'subtle-surface text-lane-700'}`}>{connectionText}</span>
            <span className={`rounded-full border px-3 py-1.5 ${session?.companionConnected ? 'border-transparent bg-emerald-400 text-emerald-950' : 'subtle-surface text-lane-700'}`}>
              Companion {session?.companionConnected ? 'online' : 'wartet'}
            </span>
            <span className="rounded-full border subtle-surface px-3 py-1.5 text-lane-700">Code {session?.pairingToken ?? '––––––'}</span>
            <span className="rounded-full border subtle-surface px-3 py-1.5 text-lane-700">{session?.liveClientCount ?? 1} Clients</span>
          </div>

          {/* Operator controls: start a fresh game, or set how many bowlers are on the lane. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveGame}
              disabled={saving || !session || !scoreboard?.throwCount}
              className="rounded-full border border-transparent bg-emerald-400 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              {saving ? 'Speichert…' : 'Spiel speichern'}
            </button>
            <button
              type="button"
              onClick={startNewGame}
              disabled={rosterBusy || !session}
              className="rounded-full border subtle-surface px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-lane-700 transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              Neues Spiel
            </button>
            <span className="text-xs font-bold text-lane-500">Spieler</span>
            <div className="flex items-center gap-1 rounded-full bg-lane-100 p-1">
              <button
                type="button"
                onClick={() => changePlayerCount(-1)}
                disabled={rosterBusy || (session?.playerCount ?? 1) <= 1}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-black text-lane-700 shadow disabled:opacity-40"
                aria-label="Weniger Spieler"
              >
                −
              </button>
              <span className="min-w-[1.5rem] text-center text-lg font-black tabular-nums">{session?.playerCount ?? 1}</span>
              <button
                type="button"
                onClick={() => changePlayerCount(1)}
                disabled={rosterBusy || (session?.playerCount ?? 1) >= 8}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-black text-lane-700 shadow disabled:opacity-40"
                aria-label="Mehr Spieler"
              >
                +
              </button>
            </div>
          </div>
        </section>

        {error && <section className="app-card app-card--warn p-4 text-sm font-bold">{error}</section>}
        {saveMsg && <section className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{saveMsg}</section>}

        <LaneCalibrationPanel
          sessionId={session?.sessionId ?? DEFAULT_SESSION_ID}
          connected={connectionState === 'open'}
          companionConnected={Boolean(session?.companionConnected)}
          message={laneControlMessage}
          send={sendLaneMessage}
        >
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-lane-200 pt-3">
            <div>
              <p className="text-sm font-bold text-lane-600">
                Akku {companionStatus?.batteryPercent ?? '–'}%{companionStatus?.charging ? ' · lädt' : ''} · Zoom {Math.round((companionStatus?.zoom ?? 0) * 100)}% · {companionStatus?.ready ? 'bereit' : 'nicht bereit'}{companionStatus?.dimmed ? ' · gedimmt' : ''}
              </p>
              {companionCommandMessage && <p className="mt-1 text-xs font-bold text-lane-500">{companionCommandMessage}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['calibrate', 'accept-lane', 'mark-pins', 'clear-track'] as const).map((command) => (
                <button key={command} type="button" disabled={!session?.companionConnected} onClick={() => sendCompanionCommand(command)} className="rounded-full border subtle-surface px-3 py-2 text-xs font-black text-lane-700 disabled:opacity-40">
                  {{ calibrate: 'Kalibrieren', 'accept-lane': 'Bahn übernehmen', 'mark-pins': 'Pins markieren', 'clear-track': 'Track löschen' }[command]}
                </button>
              ))}
              <label className="flex items-center gap-2 text-xs font-black text-lane-600">
                Zoom
                <input type="range" min="0" max="100" value={Math.round((companionStatus?.zoom ?? 0) * 100)} disabled={!session?.companionConnected} onChange={(event) => setCompanionStatus((current) => ({ batteryPercent: null, charging: false, dimmed: false, laneLocked: false, pinsMarked: false, ready: false, ...current, zoom: Number(event.target.value) / 100 }))} onPointerUp={(event) => sendCompanionCommand('set-zoom', Number(event.currentTarget.value) / 100)} />
              </label>
            </div>
          </div>
        </LaneCalibrationPanel>

        {winnerOpen && scoreboard?.isFinished && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-lane-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="winner-title">
            <div className="w-full max-w-sm rounded-2xl border border-amber-300 bg-white p-5 text-center shadow-2xl">
              <p className="eyebrow">Spiel beendet</p>
              <h2 id="winner-title" className="mt-2 text-2xl font-black text-lane-900">
                {(() => { const best = Math.max(...scoreboard.players.map((player) => player.total)); const names = scoreboard.players.filter((player) => player.total === best).map((player) => player.name); return names.length > 1 ? `Unentschieden: ${names.join(' & ')}` : `🏆 ${names[0]}`; })()}
              </h2>
              <p className="mt-1 text-sm font-bold text-lane-600">{Math.max(...scoreboard.players.map((player) => player.total))} Punkte</p>
              <p className="mt-3 text-xs font-bold text-lane-500">Bitte den letzten Wurf prüfen, bevor das Spiel gespeichert wird.</p>
              <button type="button" onClick={reviewLatestThrow} disabled={saving || correcting || !latestLoggedThrow} className="mt-4 w-full rounded-full border border-lane-300 px-4 py-3 text-sm font-black text-lane-700 disabled:opacity-40">
                Letzten Wurf bearbeiten
              </button>
              <button type="button" onClick={saveGame} disabled={saving} className="primary-action mt-4 w-full">{saving ? 'Speichert…' : 'Speichern & nächstes Spiel'}</button>
            </div>
          </div>
        )}

        {!winnerOpen && scoreboard?.isFinished && (
          <button
            type="button"
            onClick={() => setWinnerOpen(true)}
            className="fixed bottom-5 right-5 z-40 rounded-full bg-amber-400 px-5 py-3 text-sm font-black text-lane-950 shadow-xl"
          >
            Ergebnis öffnen & speichern
          </button>
        )}

        {/* Narrow / mobile: lane (curve) on the left, live data on the right. */}
        <section className="grid grid-cols-[42%_1fr] gap-3 sm:gap-5 lg:hidden">
          <LaneView
            lastThrow={lastThrow}
            pinPattern={latestLoggedThrow?.fallenPins ?? []}
            alreadyDownPins={latestLoggedThrow?.alreadyDownPins ?? []}
            onPinPatternChange={(pattern) => latestLoggedThrow && editThrowPattern(latestLoggedThrow.index, pattern)}
            pinPatternDisabled={correcting || !latestLoggedThrow}
          />

          <div className="flex flex-col gap-3">
            {aktuellCard}
            <div className="grid grid-cols-2 gap-3">{metricCards}</div>
            {lowConfidenceBadge}
          </div>
        </section>

        {/* Wide screens: live data on top, the lane laid out horizontally below. */}
        <section className="hidden flex-col gap-5 lg:flex">
          <div className="grid grid-cols-[minmax(13rem,1fr)_3fr] items-start gap-5">
            {aktuellCard}
            <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">{metricCards}</div>
          </div>
          {lowConfidenceBadge}
          <LaneView
            lastThrow={lastThrow}
            orientation="horizontal"
            pinPattern={latestLoggedThrow?.fallenPins ?? []}
            alreadyDownPins={latestLoggedThrow?.alreadyDownPins ?? []}
            onPinPatternChange={(pattern) => latestLoggedThrow && editThrowPattern(latestLoggedThrow.index, pattern)}
            pinPatternDisabled={correcting || !latestLoggedThrow}
          />
        </section>

        {/* Manual throw-log fix-ups for when the camera missed or mis-scored a throw. */}
        <section className="soft-card p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Wurf-Korrektur</p>
            <span className="text-xs font-bold text-lane-500">
              Letzter Wurf: {lastThrow ? `${lastThrow.player} · Frame ${lastThrow.frame} · Wurf ${lastThrow.throw}` : '—'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-lane-600">Fehlenden Wurf einfügen</span>
              <div className="flex items-center gap-2">
                <PinStepper value={insertPins} onChange={setInsertPins} disabled={correcting} />
                <button
                  type="button"
                  onClick={() => applyCorrection('insert_at_end', insertPins)}
                  disabled={correcting || !session}
                  className="rounded-full border subtle-surface px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-lane-700 transition hover:-translate-y-0.5 disabled:opacity-40"
                  title="Wurf jetzt nachtragen (nächster Spieler ist dran)"
                >
                  Anhängen
                </button>
                <button
                  type="button"
                  onClick={() => applyCorrection('insert_before_last', insertPins)}
                  disabled={correcting || !scoreboard?.throwCount}
                  className="rounded-full border subtle-surface px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-lane-700 transition hover:-translate-y-0.5 disabled:opacity-40"
                  title="Vor dem letzten Wurf einfügen (rückt den letzten Wurf zum richtigen Spieler)"
                >
                  Davor
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (window.confirm('Letzten Wurf löschen?')) applyCorrection('delete_last'); }}
              disabled={correcting || !scoreboard?.throwCount}
              className="rounded-full border border-transparent bg-coral px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-lane-950 transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              Letzten Wurf löschen
            </button>
          </div>
          <p className="mt-2 text-xs text-lane-500">
            Pin-Muster des letzten Wurfs direkt oben auf der Bahn antippen, um es zu korrigieren.{' '}
            Eigener Wurf nicht erkannt? „Anhängen“ trägt ihn nach. Fiel erst durch den nächsten Wurf auf, dass die Zuordnung
            verrutscht ist? „Davor“ schiebt den letzten Wurf zum richtigen Spieler. Bewegung fälschlich als Wurf erkannt?
            „Letzten Wurf löschen“.
          </p>
        </section>

        {/* Live score table, rebuilt from the throw log */}
        <section className="soft-card p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Score</p>
            <span className="text-xs font-bold text-lane-500">{scoreboard?.throwCount ?? 0} Würfe erfasst · Namen antippen zum Bearbeiten</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-left font-semibold text-lane-800">Name</th>
                  {Array.from({ length: 10 }, (_, i) => (
                    <th key={i} className="border border-lane-200 bg-lane-50 px-1 py-1.5 text-center font-semibold text-lane-800">{i + 1}</th>
                  ))}
                  <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">Ges.</th>
                </tr>
              </thead>
              <tbody>
                {(scoreboard?.players ?? []).map((player) => (
                  <tr key={player.index} className={player.isCurrent ? 'live-current-player-row' : ''}>
                    <td className="h-10 border border-lane-200 px-2 py-1 font-medium text-lane-900 whitespace-nowrap">
                      {player.isCurrent && <span className="mr-1 text-coral">▸</span>}
                      <input
                        type="text"
                        value={playerNameDrafts[player.index] ?? player.name}
                        onFocus={() => setEditingNameIndex(player.index)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPlayerNameDrafts((current) => {
                            const next = [...current];
                            next[player.index] = value;
                            return next;
                          });
                        }}
                        onBlur={() => {
                          setEditingNameIndex(null);
                          savePlayerNames();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                          if (event.key === 'Escape') {
                            setPlayerNameDrafts(
                              Array.from({ length: session?.playerCount ?? 1 }, (_, index) =>
                                session?.playerNames[index] ?? scoreboard?.players?.[index]?.name ?? `Spieler ${index + 1}`,
                              ),
                            );
                            event.currentTarget.blur();
                          }
                        }}
                        disabled={rosterBusy || !session}
                        className="min-w-[7rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 font-black text-lane-900 outline-none transition focus:border-coral focus:bg-white focus:ring-2 focus:ring-coral/20 disabled:opacity-60"
                        aria-label={`Name für Spieler ${player.index + 1}`}
                      />
                    </td>
                    {Array.from({ length: 10 }, (_, fIdx) => {
                      const frame = player.frames[fIdx];
                      const split = splitMetadata(frame?.fallenPins);
                      const bgClass = frame?.isStrike ? 'bg-amber-200/60' : frame?.isSpare ? 'bg-slate-200/60' : '';
                      return (
                        <td key={fIdx} className={`h-10 border border-lane-200 px-0 py-0 align-top ${bgClass}`}>
                          <div className="relative flex h-5 border-b border-lane-100 text-[0.65rem] leading-5">
                            <span className="relative h-full w-1/2 border-r border-lane-100 px-1 text-center">
                              {frame ? ballGlyph(frame, 0) : ''}
                              {split && (
                                <SplitPatternPopover standingPins={split.standingPins} converted={split.converted} />
                              )}
                            </span>
                            <span className="h-full w-1/2 px-1 text-center">{frame ? ballGlyph(frame, 1) : ''}</span>
                            {fIdx === 9 && <span className="h-full w-1/2 border-l border-lane-100 px-1 text-center">{frame ? ballGlyph(frame, 2) : ''}</span>}
                          </div>
                          <div className="h-5 px-1 text-center text-lane-600 leading-5">{frame?.cumulative ?? ''}</div>
                        </td>
                      );
                    })}
                    <td className="h-10 border border-lane-200 px-2 py-1 text-center font-black text-lane-900">{player.total}</td>
                  </tr>
                ))}
                {!scoreboard?.players?.length && (
                  <tr>
                    <td colSpan={12} className="border border-lane-200 px-2 py-3 text-center text-sm font-bold text-lane-500">Noch keine Würfe.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {historySection}

        {/* Event stream */}
        <section className="soft-card p-4 sm:p-6">
          <p className="eyebrow">Event Stream</p>
          <div className="mt-3 flex flex-col gap-2">
            {[...events].reverse().slice(0, 12).map((event) => (
              <div key={event.eventId} className="app-card p-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black">{eventLabel(event.type)}</span>
                  <span className="text-xs text-lane-500">{new Date(event.createdAt).toLocaleTimeString('de-DE')}</span>
                </div>
                {isThrowAnalysis(event.payload) && (
                  <p className="mt-1 text-xs text-lane-600">{event.payload.player}: {event.payload.pinsKnockedDown ?? '–'} Pins · {formatNumber(event.payload.ballSpeedKmh, ' km/h')}</p>
                )}
              </div>
            ))}
            {!events.length && <p className="text-sm font-bold text-lane-600">Noch keine Events.</p>}
          </div>
        </section>
      </main>
    </>
  );
}
