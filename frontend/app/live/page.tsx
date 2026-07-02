'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Navigation from '@/components/navigation';
import Card from '@/components/ui/card';
import {
  type ThrowCorrectionAction,
  correctTrackingThrow,
  createGame,
  createTrackingSession,
  fetchTrackingEvents,
  fetchTrackingSession,
  getTrackingWebSocketUrl,
  resetTrackingSession,
  setTrackingPlayers,
} from '@/lib/api';
import type { BallPathPoint, LiveEvent, ThrowAnalysis, TrackingPlayerCard, TrackingSession } from '@/types';

const DEFAULT_SESSION_ID = 'demo-session';
const MAX_VISIBLE_EVENTS = 30;
const LANE_LENGTH_M = 18.29;
const BOARD_COUNT = 39;
const LANE_WIDTH_IN = 41.5;
const PIN_CENTER_SPACING_IN = 12;
const PIN_SPACING_PCT = (PIN_CENTER_SPACING_IN / LANE_WIDTH_IN) * 100;
const PIN_DECK_HEIGHT_PCT = 13;
const PIN_HEADER_Y_PCT = PIN_DECK_HEIGHT_PCT;

function isThrowAnalysis(payload: LiveEvent['payload']): payload is LiveEvent['payload'] & ThrowAnalysis {
  return typeof payload.player === 'string' && typeof payload.frame === 'number' && typeof payload.throw === 'number';
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return `${value.toFixed(1)}${suffix}`;
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
}: {
  lastThrow: ThrowAnalysis | undefined;
  orientation?: 'vertical' | 'horizontal';
}) {
  const horizontal = orientation === 'horizontal';
  // Distance from the foul line to the pin header, as a percentage of the lane's long axis.
  const headerLengthPct = horizontal ? 100 - PIN_DECK_HEIGHT_PCT : PIN_HEADER_Y_PCT;

  const clampPct = (v: number) => Math.max(2, Math.min(98, v));
  const mapBoard = (board: number) => clampPct((board / BOARD_COUNT) * 100);
  // Vertical: distance runs bottom (foul) → top (pins).
  const mapDistanceV = (distanceM: number) => {
    const laneSurfacePct = 100 - PIN_HEADER_Y_PCT;
    const y = PIN_HEADER_Y_PCT + (1 - distanceM / LANE_LENGTH_M) * laneSurfacePct;
    return Math.max(PIN_HEADER_Y_PCT, Math.min(99, y));
  };
  // Horizontal: distance runs left (foul) → right (pins).
  const mapDistanceH = (distanceM: number) => {
    const x = (distanceM / LANE_LENGTH_M) * headerLengthPct;
    return Math.max(1, Math.min(headerLengthPct, x));
  };
  // Project a (board, distance) lane coordinate onto container percentages.
  const pos = (board: number, distanceM: number) =>
    horizontal
      ? { left: mapDistanceH(distanceM), top: mapBoard(board) }
      : { left: mapBoard(board), top: mapDistanceV(distanceM) };

  const path: BallPathPoint[] = lastThrow?.path ?? [];
  const curve = lastThrow?.curve;
  const polyline =
    path.length >= 2
      ? path
          .map((p) => {
            const q = pos(p.board, distanceOf(p));
            return `${q.left},${q.top}`;
          })
          .join(' ')
      : null;
  const markers = [
    { key: 'launch', label: 'Start', point: curve?.launch, color: '#16a34a' },
    { key: 'apex', label: 'Hook', point: curve?.apex, color: '#f59e0b' },
    { key: 'impact', label: 'Pins', point: curve?.impact, color: '#e11d48' },
  ];
  const knockedPins = Math.max(0, Math.min(10, lastThrow?.pinsKnockedDown ?? 0));
  // Prefer the exact pins the display reported fallen; fall back to "first N" only for the count.
  const fallenSet =
    lastThrow?.fallenPins && lastThrow.fallenPins.length > 0 ? new Set(lastThrow.fallenPins) : null;
  const pinPositions = [
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
  ].map((pin, index) => ({
    ...pin,
    // Inside the deck strip: the board (offset) axis spreads across the strip's long
    // side; the row axis stacks along its short side, back row farthest from the lane.
    x: horizontal ? 88 - pin.row * 23 : 50 + pin.offset * PIN_SPACING_PCT,
    y: horizontal ? 50 + pin.offset * PIN_SPACING_PCT : 19 + pin.row * 23,
    knocked: fallenSet ? fallenSet.has(pin.pin) : index < knockedPins,
  }));
  const boardGuides = [5, 10, 15, 20, 25, 30, 35];
  const arrowDistance = 4.5; // bowling arrows sit ~4.5 m down the lane

  const containerClass = horizontal
    ? 'relative h-[170px] w-full overflow-hidden rounded-[1.5rem] border-2 bg-gradient-to-l from-[var(--lane-wood-top)] via-[var(--lane-wood-mid)] to-[var(--lane-wood-bottom)] shadow-inner xl:h-[200px]'
    : 'relative h-[440px] w-full overflow-hidden rounded-[1.5rem] border-2 bg-gradient-to-b from-[var(--lane-wood-top)] via-[var(--lane-wood-mid)] to-[var(--lane-wood-bottom)] shadow-inner sm:h-[560px]';

  return (
    <div className={containerClass} style={{ borderColor: 'var(--lane-edge)' }}>
      {/* Pin deck beyond the playable lane. The trajectory only maps from the foul
        line up to the pin header line at the edge of this deck. */}
      <div
        className={horizontal ? 'absolute inset-y-0 right-0 w-[13%]' : 'absolute inset-x-0 top-0 h-[13%]'}
        style={{ background: 'var(--lane-deck)' }}
      >
        {pinPositions.map((pin) => (
          <span
            key={pin.pin}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm sm:h-4 sm:w-4 ${
              pin.knocked ? 'bg-transparent opacity-50' : 'bg-white'
            }`}
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              borderColor: 'var(--lane-pin)',
            }}
            title={`Pin ${pin.pin}${pin.knocked ? ' gefallen' : ' steht'}`}
          />
        ))}
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

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
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
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
            style={{ left: `${q.left}%`, top: `${q.top}%`, background: m.color }}
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
  const [error, setError] = useState<string | null>(null);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [lastPins, setLastPins] = useState(0);
  const [insertPins, setInsertPins] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
          const event = JSON.parse(message.data) as LiveEvent;
          applyEvent(event);
        };
        socket.onerror = () => setError('Live-Verbindung konnte nicht stabil aufgebaut werden.');
        socket.onclose = () => {
          setConnectionState('closed');
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

  // Seed the "edit last throw" stepper with each newly detected throw's pin count.
  useEffect(() => {
    setLastPins(lastThrow?.pinsKnockedDown ?? 0);
  }, [lastThrow?.capturedAt, lastThrow?.pinsKnockedDown]);

  const connectionText = connectionState === 'open' ? 'Verbunden' : connectionState === 'connecting' ? 'Verbinde…' : 'Getrennt';

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
      const today = new Date().toISOString().slice(0, 10);
      const scores = scoreboard.players
        .filter((player) => player.frames.length > 0)
        .map((player) => ({
          player_name: player.name,
          total_score: player.total,
          frames: player.frames.map((frame, fIdx) => ({
            throw1: ballGlyph(frame, 0),
            throw2: ballGlyph(frame, 1),
            throw3: fIdx === 9 ? ballGlyph(frame, 2) : '',
            cumulative: frame.cumulative != null ? String(frame.cumulative) : '',
            // Per-ball fallen pins come from the scoreboard (the backend keeps them aligned to the
            // log, so they stay correct after manual corrections), for player pin stats.
            fallenPins: frame.fallenPins ?? [],
          })),
        }));
      if (!scores.length) {
        setError('Noch keine Würfe zum Speichern.');
        return;
      }
      await createGame({ played_at: today, location: session.location ?? 'Live-Tracking', mode: '10-Pin', scores });
      setSaveMsg('Spiel gespeichert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spiel konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const applyCorrection = async (action: ThrowCorrectionAction, pins?: number, throwIndex?: number) => {
    if (!session) return;
    setCorrecting(true);
    setError(null);
    setSaveMsg(null);
    try {
      const updated = await correctTrackingThrow(session.sessionId, action, pins, throwIndex);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Korrektur konnte nicht angewendet werden.');
    } finally {
      setCorrecting(false);
    }
  };

  const editLastPins = (next: number) => {
    const clamped = Math.max(0, Math.min(10, next));
    setLastPins(clamped);
    applyCorrection('edit_last', clamped);
  };

  const deleteLoggedThrow = (throwIndex: number) => {
    const throwNumber = throwIndex + 1;
    if (window.confirm(`Wurf #${throwNumber} löschen? Alle späteren Würfe werden neu zugeordnet.`)) {
      applyCorrection('delete_at', undefined, throwIndex);
    }
  };

  const changePlayerCount = async (delta: number) => {
    if (!session) return;
    const next = Math.max(1, Math.min(8, session.playerCount + delta));
    if (next === session.playerCount) return;
    setRosterBusy(true);
    try {
      const updated = await setTrackingPlayers(session.sessionId, next);
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
      <Card title="Speed" header={lastThrow ? formatNumber(lastThrow.ballSpeedKmh) : '–'} headerSize="lg" padding="sm" />
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

        {/* Narrow / mobile: lane (curve) on the left, live data on the right. */}
        <section className="grid grid-cols-[42%_1fr] gap-3 sm:gap-5 lg:hidden">
          <LaneView lastThrow={lastThrow} />

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
          <LaneView lastThrow={lastThrow} orientation="horizontal" />
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
              <span className="text-xs font-bold text-lane-600">Pins letzter Wurf</span>
              <PinStepper value={lastPins} onChange={editLastPins} disabled={correcting || !scoreboard?.throwCount} />
            </div>
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
            Eigener Wurf nicht erkannt? „Anhängen“ trägt ihn nach. Fiel erst durch den nächsten Wurf auf, dass die Zuordnung
            verrutscht ist? „Davor“ schiebt den letzten Wurf zum richtigen Spieler. Bewegung fälschlich als Wurf erkannt?
            „Letzten Wurf löschen“.
          </p>

          <div className="mt-5 border-t border-lane-200/70 pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-lane-600">Wurf-Historie</p>
              <span className="text-xs font-bold text-lane-500">Beliebigen Fehlwurf löschen</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[42rem] divide-y divide-lane-100 rounded-2xl border border-lane-200 bg-white/70">
                {[...loggedThrows].reverse().map((throwItem) => (
                  <div key={throwItem.index} className="grid grid-cols-[4.5rem_1fr_6rem_6rem_7rem] items-center gap-3 px-3 py-2 text-xs">
                    <span className="font-black tabular-nums text-lane-700">#{throwItem.index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-lane-900">
                        {throwItem.player} · Frame {throwItem.frame} · Wurf {throwItem.throw}
                      </p>
                      <p className="truncate text-[0.68rem] font-bold text-lane-500">
                        {throwItem.manual ? 'manuell' : 'getrackt'}
                        {throwItem.lowConfidence ? ' · niedrige Konfidenz' : ''}
                        {throwItem.capturedAt ? ` · ${new Date(throwItem.capturedAt).toLocaleTimeString('de-DE')}` : ''}
                      </p>
                    </div>
                    <span className="font-black text-lane-800">{throwItem.pinsKnockedDown ?? '–'} Pins</span>
                    <span className="font-bold text-lane-600">{throwItem.ballSpeedKmh != null ? formatNumber(throwItem.ballSpeedKmh, ' km/h') : '–'}</span>
                    <button
                      type="button"
                      onClick={() => deleteLoggedThrow(throwItem.index)}
                      disabled={correcting || !session}
                      className="justify-self-end rounded-full border border-red-200 px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.12em] text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50 disabled:opacity-40"
                    >
                      Löschen
                    </button>
                  </div>
                ))}
                {!loggedThrows.length && (
                  <p className="px-3 py-4 text-sm font-bold text-lane-500">Noch keine Würfe in der Historie.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Live score table, rebuilt from the throw log */}
        <section className="soft-card p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Score</p>
            <span className="text-xs font-bold text-lane-500">{scoreboard?.throwCount ?? 0} Würfe erfasst</span>
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
                  <tr key={player.index} className={player.isCurrent ? 'bg-amber-100/50' : ''}>
                    <td className="border border-lane-200 px-2 py-1 font-medium text-lane-900 whitespace-nowrap">
                      {player.isCurrent && <span className="mr-1 text-coral">▸</span>}
                      {player.name}
                    </td>
                    {Array.from({ length: 10 }, (_, fIdx) => {
                      const frame = player.frames[fIdx];
                      const bgClass = frame?.isStrike ? 'bg-amber-200/60' : frame?.isSpare ? 'bg-slate-200/60' : '';
                      return (
                        <td key={fIdx} className={`border border-lane-200 px-0 py-0 ${bgClass}`}>
                          <div className="flex min-h-[1.1rem] border-b border-lane-100 text-[0.65rem]">
                            <span className="w-1/2 border-r border-lane-100 px-1 py-0.5 text-center">{frame ? ballGlyph(frame, 0) : ''}</span>
                            <span className="w-1/2 px-1 py-0.5 text-center">{frame ? ballGlyph(frame, 1) : ''}</span>
                            {fIdx === 9 && <span className="w-1/2 border-l border-lane-100 px-1 py-0.5 text-center">{frame ? ballGlyph(frame, 2) : ''}</span>}
                          </div>
                          <div className="px-1 py-0.5 text-center text-lane-600">{frame?.cumulative ?? ''}</div>
                        </td>
                      );
                    })}
                    <td className="border border-lane-200 px-2 py-1 text-center font-black text-lane-900">{player.total}</td>
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
