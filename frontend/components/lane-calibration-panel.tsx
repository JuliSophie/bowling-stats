'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  laneRequest,
  type LaneControlMessage,
  type LaneCorners,
  type LanePoint,
  type LaneScreenshotMessage,
  type LaneDebugMetadata,
  isLaneImageSizeValid,
} from '@/lib/lane-calibration';

const CORNER_NAMES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
const HANDLE_SIZE_CSS_PX = 44;
const MAGNIFIER_RADIUS_CSS_PX = 42;

export default function LaneCalibrationPanel({
  sessionId,
  connected,
  companionConnected,
  message,
  send,
  children,
}: {
  sessionId: string;
  connected: boolean;
  companionConnected: boolean;
  message: LaneControlMessage | null;
  send: (message: string) => boolean;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [screenshot, setScreenshot] = useState<LaneScreenshotMessage | null>(null);
  const [debugImage, setDebugImage] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<LaneCorners | null>(null);
  const [dragging, setDragging] = useState<(typeof CORNER_NAMES)[number] | null>(null);
  const [pointer, setPointer] = useState<LanePoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Noch kein Kamerabild geladen.');
  const [open, setOpen] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const pendingRequestRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cornersRef = useRef<LaneCorners | null>(null);
  const dragStartRef = useRef<LaneCorners | null>(null);
  const dragActiveRef = useRef<(typeof CORNER_NAMES)[number] | null>(null);
  const dragStartDirtyRef = useRef(false);
  const dragReleaseRef = useRef(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { cornersRef.current = corners; }, [corners]);

  const finishRequest = () => {
    pendingRequestRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setBusy(false);
  };

  const startRequest = (requestId: string) => {
    pendingRequestRef.current = requestId;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      pendingRequestRef.current = null;
      timeoutRef.current = null;
      setBusy(false);
      setError('Zeitüberschreitung bei der Companion-Anfrage.');
    }, 15_000);
  };

  useEffect(() => {
    if (!message) return;
    if (message.type === 'companion.status' || message.type === 'companion.command.applied' || message.type === 'companion.command.rejected') return;
    if (message.requestId !== pendingRequestRef.current) return;
    if (message.type === 'lane.error') {
      finishRequest();
      setError(message.payload.message);
      return;
    }
    if (message.type === 'lane.quad.applied') {
      setStatus('Kalibrierung übernommen. Neues Kamerabild wird geladen…');
      return;
    }

    if (!isLaneImageSizeValid(message.payload.image.width, message.payload.image.height)) {
      finishRequest();
      setError('Kamerabild hat unzulässige Abmessungen.');
      return;
    }

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setScreenshot(message);
      setCorners(message.payload.corners);
      cornersRef.current = message.payload.corners;
      setDraftDirty(false);
      setDebugImage(null);
      const encodedCrop = message.payload.debug?.pinDeck;
      if (encodedCrop && isLaneImageSizeValid(encodedCrop.width, encodedCrop.height)) {
        const crop = new Image();
        crop.onload = () => setDebugImage(crop);
        crop.src = `data:${encodedCrop.mimeType};base64,${encodedCrop.jpegBase64}`;
      }
      finishRequest();
      setError(null);
      setStatus(message.payload.reason === 'applied' ? 'Kalibrierung übernommen.' : 'Kamerabild ist aktuell.');
    };
    image.onerror = () => {
      finishRequest();
      setError('Kamerabild konnte nicht angezeigt werden.');
    };
    image.src = `data:${message.payload.image.mimeType};base64,${message.payload.image.jpegBase64}`;
  }, [message]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (!connected || !companionConnected) {
      finishRequest();
    }
  }, [companionConnected, connected]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => modalRef.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]');
    const first = focusable()?.[0];
    first?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items?.length) return;
      const current = document.activeElement;
      const index = Array.from(items).indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || index < 0)) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !corners || !screenshot) return;
    const width = screenshot.payload.image.width;
    const height = screenshot.payload.image.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const points = CORNER_NAMES.map((name) => corners[name]);
    context.strokeStyle = '#fb7185';
    context.lineWidth = Math.max(3, width / 320);
    context.beginPath();
    points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();

    context.strokeStyle = '#22d3ee';
    context.lineWidth = Math.max(4, width / 240);
    context.beginPath();
    context.moveTo(corners.topLeft.x * width, corners.topLeft.y * height);
    context.lineTo(corners.topRight.x * width, corners.topRight.y * height);
    context.stroke();
    context.fillStyle = '#cffafe';
    context.font = `700 ${Math.max(14, width / 45)}px sans-serif`;
    context.fillText('Kopfpin-Linie', corners.topLeft.x * width + 8, corners.topLeft.y * height - 12);

    const cssScale = width / Math.max(1, canvas.getBoundingClientRect().width);
    const handleRadius = (HANDLE_SIZE_CSS_PX / 2) * cssScale;
    points.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x * width, point.y * height, handleRadius, 0, Math.PI * 2);
      context.fillStyle = dragging === CORNER_NAMES[index] ? '#facc15' : '#ffffff';
      context.fill();
      context.strokeStyle = '#9f1239';
      context.lineWidth = Math.max(2, cssScale * 2);
      context.stroke();
    });

    if (dragging && pointer) drawMagnifier(context, image, pointer, width, height, cssScale);
  }, [corners, dragging, pointer, screenshot]);

  const requestScreenshot = () => {
    const request = laneRequest(sessionId, 'lane.screenshot.request', {});
    setBusy(true);
    startRequest(request.requestId);
    setError(null);
    setStatus('Kamerabild wird angefordert…');
    if (!send(JSON.stringify(request))) {
      finishRequest();
      setError('Live-Verbindung ist nicht bereit.');
    }
  };

  const applyCorners = (draft = cornersRef.current) => {
    if (!screenshot || !draft) return;
    if (!isValidCorners(draft)) {
      setError('Eckpunkte bilden keine gültige Bahnfläche.');
      return;
    }
    if (pendingRequestRef.current) return;
    const request = laneRequest(sessionId, 'lane.quad.apply', { screenshotId: screenshot.payload.screenshotId, corners: draft });
    setBusy(true);
    startRequest(request.requestId);
    setError(null);
    setStatus('Kalibrierung wird übertragen…');
    if (!send(JSON.stringify(request))) {
      finishRequest();
      setError('Live-Verbindung ist nicht bereit.');
    }
  };

  const setDraftCorners = (next: LaneCorners) => {
    cornersRef.current = next;
    setCorners(next);
    setDraftDirty(true);
  };

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!corners || pendingRequestRef.current) return;
    const position = pointerPosition(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const radiusX = HANDLE_SIZE_CSS_PX / rect.width;
    const radiusY = HANDLE_SIZE_CSS_PX / rect.height;
    const nearest = CORNER_NAMES.map((name) => ({
      name,
      distance: Math.hypot((corners[name].x - position.x) / radiusX, (corners[name].y - position.y) / radiusY),
    })).sort((left, right) => left.distance - right.distance)[0];
    if (nearest.distance > 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(nearest.name);
    dragActiveRef.current = nearest.name;
    dragStartRef.current = { ...corners };
    dragStartDirtyRef.current = draftDirty;
    dragReleaseRef.current = false;
    setPointer(position);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const position = pointerPosition(event);
    setPointer(position);
    if (cornersRef.current) setDraftCorners({ ...cornersRef.current, [dragging]: position });
  };

  const stopDragging = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const activeDrag = dragActiveRef.current;
    const original = dragStartRef.current;
    if (event.type === 'pointercancel' && activeDrag) {
      if (original) { cornersRef.current = original; setCorners(original); }
      setDraftDirty(dragStartDirtyRef.current);
    } else if (activeDrag && original && !dragReleaseRef.current) {
      dragReleaseRef.current = true;
      const current = cornersRef.current;
      const changed = Boolean(current && CORNER_NAMES.some((name) => current[name].x !== original[name].x || current[name].y !== original[name].y));
      if (changed) applyCorners(current);
    }
    dragActiveRef.current = null;
    dragStartRef.current = null;
    setDragging(null);
    setPointer(null);
  };

  const debug = screenshot?.payload.debug;
  const closeModal = () => setOpen(false);
  const modal = open && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-lane-950/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="lane-calibration-modal-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-lane-700 bg-lane-950 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-lane-800 px-4 py-3">
          <div><p className="eyebrow text-lane-400">Remote-Kalibrierung</p><h2 id="lane-calibration-modal-title" className="text-lg font-black text-white">Bahnecken einstellen</h2></div>
          <button type="button" onClick={closeModal} aria-label="Kalibrierung schließen" className="grid h-10 w-10 place-items-center rounded-full border border-lane-700 text-xl text-white focus:outline-none focus:ring-2 focus:ring-coral">×</button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 overflow-hidden rounded-xl border border-lane-700 bg-black">
              {screenshot ? <canvas ref={canvasRef} tabIndex={0} className="mx-auto block h-auto max-h-[calc(100dvh-10rem)] w-auto max-w-full touch-none" style={{ aspectRatio: `${screenshot.payload.image.width} / ${screenshot.payload.image.height}` }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging} aria-label="Kamerabild. Bahnecken mit Maus oder Touch ziehen." /> : <div className="grid min-h-48 place-items-center px-6 text-center text-sm font-bold text-lane-300">{companionConnected ? 'Kamerabild anfordern, um die Bahn einzustellen.' : 'Companion ist nicht verbunden.'}</div>}
            </div>
            <aside className="space-y-3 rounded-xl border border-lane-800 bg-lane-900/70 p-3" aria-label="Pin-Debugstatus">
              <div className="flex items-center justify-between"><h3 className="font-black text-white">Pin-Deck</h3><span className="text-xs text-lane-400">Companion</span></div>
              {debugImage ? <div className="overflow-hidden rounded-lg border border-lane-700 bg-black"><div className="relative"><img src={debugImage.src} alt="Annotiertes Pin-Deck vom Companion" className="block h-auto w-full" />{debug?.pinDeck?.laneEndLine && <CropLine line={debug.pinDeck.laneEndLine} />}<span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-bold text-amber-300">Kopfpin-Linie</span></div></div> : <div className="grid aspect-square place-items-center rounded-lg bg-black px-3 text-center text-xs text-lane-400">Kein Pin-Deck-Bild verfügbar.</div>}
              <DebugStatus debug={debug} />
            </aside>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-lane-300" aria-live="polite">{error ?? status}</p><div className="flex gap-2"><button type="button" onClick={requestScreenshot} disabled={busy || !connected || !companionConnected} className="rounded-full border border-lane-700 px-3 py-2 text-xs font-black text-lane-200 disabled:opacity-40">Aktualisieren</button>{draftDirty && <button type="button" onClick={() => applyCorners()} disabled={busy || !corners || !isValidCorners(corners) || !connected || !companionConnected} className="rounded-full bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-40">{busy ? 'Bitte warten…' : 'Übernehmen'}</button>}</div></div>
        </div>
      </div>
    </div>, document.body,
  ) : null;

  return (
    <section className="soft-card p-4 sm:p-5" aria-labelledby="lane-calibration-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Companion</p>
          <h2 id="lane-calibration-title" className="mt-1 text-lg font-black text-lane-900">Steuerung &amp; Kalibrierung</h2>
          <p className="mt-1 text-sm font-bold text-lane-600">{error ?? status}</p>
        </div>
        <button
          ref={launcherRef}
          type="button"
          onClick={() => {
            setOpen(true);
            if (connected && companionConnected) requestScreenshot();
          }}
          className="primary-action"
          aria-haspopup="dialog"
        >
          Kalibrierung öffnen
        </button>
      </div>
      {children}
      {modal}
    </section>
  );
}

function CropLine({ line }: { line: [number, number, number, number] }) {
  const dx = line[2] - line[0];
  const dy = line[3] - line[1];
  return <span className="pointer-events-none absolute h-0.5 origin-left bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.9)]" style={{ left: `${line[0] * 100}%`, top: `${line[1] * 100}%`, width: `${Math.hypot(dx, dy) * 100}%`, transform: `rotate(${Math.atan2(dy, dx)}rad)` }} />;
}

function DebugStatus({ debug }: { debug?: LaneDebugMetadata | null }) {
  const status = debug?.pinStatus;
  const rows = status ? [
    [`Pins`, `${status.standing}/${status.total} oben · ${status.down} unten`],
    [`Referenz`, status.referenceAvailable ? 'verfügbar' : 'nicht verfügbar'],
    [`Zählen`, status.pinCountingArmed ? 'aktiv' : 'inaktiv'],
    [`Deck`, status.deckSettled ? 'ruhig' : 'wartet'],
    [`Auto-Referenz`, `${status.autoReferenceStatus}${status.autoReferenceReady ? ' · bereit' : ''}`],
  ] : [];
  return <dl className="space-y-1 text-xs">{rows.length ? rows.map(([label, value]) => <div key={label} className="flex justify-between gap-2 border-b border-lane-800 py-1"><dt className="text-lane-400">{label}</dt><dd className="text-right font-bold text-lane-100">{value}</dd></div>) : <div className="text-lane-400">Noch keine Debugdaten.</div>}</dl>;
}

function drawMagnifier(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  pointer: LanePoint,
  width: number,
  height: number,
  cssScale: number,
) {
  const radius = MAGNIFIER_RADIUS_CSS_PX * cssScale;
  const centerX = Math.max(radius, Math.min(width - radius, pointer.x * width));
  const centerY = Math.max(radius, pointer.y * height - radius * 1.7);
  const sourceRadius = radius / 2.4;
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(
    image,
    pointer.x * width - sourceRadius,
    pointer.y * height - sourceRadius,
    sourceRadius * 2,
    sourceRadius * 2,
    centerX - radius,
    centerY - radius,
    radius * 2,
    radius * 2,
  );
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(2, cssScale * 1.5);
  context.beginPath();
  context.moveTo(centerX - radius / 3, centerY);
  context.lineTo(centerX + radius / 3, centerY);
  context.moveTo(centerX, centerY - radius / 3);
  context.lineTo(centerX, centerY + radius / 3);
  context.stroke();
  context.restore();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = '#facc15';
  context.lineWidth = Math.max(3, cssScale * 2);
  context.stroke();
}

function isValidCorners(corners: LaneCorners): boolean {
  const points = CORNER_NAMES.map((name) => corners[name]);
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return false;
  const twiceArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0);
  return twiceArea > 0.01 && points[0].y < points[2].y && points[1].y < points[3].y && points[0].x < points[1].x && points[3].x < points[2].x;
}