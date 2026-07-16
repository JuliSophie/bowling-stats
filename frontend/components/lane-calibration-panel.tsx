'use client';

import { useEffect, useRef, useState } from 'react';

import {
  laneRequest,
  type LaneControlMessage,
  type LaneCorners,
  type LanePoint,
  type LaneScreenshotMessage,
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
}: {
  sessionId: string;
  connected: boolean;
  companionConnected: boolean;
  message: LaneControlMessage | null;
  send: (message: string) => boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [screenshot, setScreenshot] = useState<LaneScreenshotMessage | null>(null);
  const [corners, setCorners] = useState<LaneCorners | null>(null);
  const [dragging, setDragging] = useState<(typeof CORNER_NAMES)[number] | null>(null);
  const [pointer, setPointer] = useState<LanePoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Noch kein Kamerabild geladen.');
  const pendingRequestRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const applyCorners = () => {
    if (!screenshot || !corners) return;
    if (!isValidCorners(corners)) {
      setError('Eckpunkte bilden keine gültige Bahnfläche.');
      return;
    }
    const request = laneRequest(sessionId, 'lane.quad.apply', { screenshotId: screenshot.payload.screenshotId, corners });
    setBusy(true);
    startRequest(request.requestId);
    setError(null);
    setStatus('Kalibrierung wird übertragen…');
    if (!send(JSON.stringify(request))) {
      finishRequest();
      setError('Live-Verbindung ist nicht bereit.');
    }
  };

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!corners) return;
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
    setPointer(position);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const position = pointerPosition(event);
    setPointer(position);
    setCorners((current) => current ? { ...current, [dragging]: position } : current);
  };

  const stopDragging = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(null);
    setPointer(null);
  };

  return (
    <section className="soft-card p-4 sm:p-6" aria-labelledby="lane-calibration-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Remote-Kalibrierung</p>
          <h2 id="lane-calibration-title" className="mt-1 text-lg font-black text-lane-900">Bahnecken einstellen</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={requestScreenshot} disabled={busy || !connected || !companionConnected} className="rounded-full border subtle-surface px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-lane-700 disabled:opacity-40">
            Aktualisieren
          </button>
          <button type="button" onClick={applyCorners} disabled={busy || !corners || !isValidCorners(corners) || !connected || !companionConnected} className="rounded-full border border-transparent bg-emerald-400 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-950 disabled:opacity-40">
            {busy ? 'Bitte warten…' : 'Übernehmen'}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-lane-200 bg-lane-950">
        {screenshot ? (
          <canvas
            ref={canvasRef}
            className="block h-auto w-full touch-none"
            style={{ aspectRatio: `${screenshot.payload.image.width} / ${screenshot.payload.image.height}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            aria-label="Kamerabild mit verschiebbaren Bahnecken"
          />
        ) : (
          <div className="grid min-h-48 place-items-center px-6 text-center text-sm font-bold text-lane-300">{companionConnected ? 'Kamerabild anfordern, um die Bahn einzustellen.' : 'Companion ist nicht verbunden.'}</div>
        )}
      </div>
      <p className="mt-3 text-sm font-bold text-lane-600" aria-live="polite">{error ?? status}</p>
    </section>
  );
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