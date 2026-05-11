'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { createGame, extractScorecard, guessScorecardCorners, rectifyScorecard } from '@/lib/api';
import type { ExtractionResult, FrameData, GameRead, ManualCorner, RectifiedPreview } from '@/types';
import StatsView from './stats-view';

type AppTab = 'upload' | 'stats';

const PIPELINE_STEPS = [
  { title: 'Monitor finden' },
  { title: 'Ergebnis prüfen' },
];

type TableSubView = 'bw' | 'lines';

const TABLE_SUB_VIEWS: { key: TableSubView; label: string }[] = [
  { key: 'bw', label: 'Schwarz/Weiß' },
  { key: 'lines', label: 'Linien' },
];

const MAGNIFIER_SIZE = 140;
const MAGNIFIER_ZOOM = 4;

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777'];

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

type FrameType = 'strike' | 'spare' | 'normal';

function getFrameType(frame: FrameData): FrameType {
  if (frame.throw1.trim().toLowerCase() === 'x' || frame.throw2.trim().toLowerCase() === 'x') return 'strike';
  if (frame.throw2.trim() === '/') return 'spare';
  return 'normal';
}

function buildCumulativeChartData(scores: GameRead['scores']): Record<string, string | number>[] {
  const frameCount = Math.max(...scores.map((s) => s.frames.length), 0);
  const data: Record<string, string | number>[] = [];

  for (let f = 0; f < frameCount; f++) {
    const point: Record<string, string | number> = { frame: `${f + 1}` };
    for (const score of scores) {
      if (f < score.frames.length) {
        const cum = parseInt(String(score.frames[f].cumulative ?? ''), 10);
        if (!isNaN(cum)) {
          point[score.player_name] = cum;
          point[`${score.player_name}_type`] = getFrameType(score.frames[f]);
        }
      }
    }
    data.push(point);
  }

  return data;
}

function FrameDot({ cx, cy, payload, dataKey, stroke }: {
  cx?: number; cy?: number; payload?: Record<string, string | number>; dataKey?: string; stroke?: string;
}) {
  if (cx == null || cy == null || !payload || !dataKey) return null;
  const frameType = payload[`${dataKey}_type`] as FrameType | undefined;

  if (frameType === 'strike') {
    const s = 6;
    return (
      <g>
        <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke={stroke} strokeWidth={2.5} />
        <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke={stroke} strokeWidth={2.5} />
      </g>
    );
  }

  if (frameType === 'spare') {
    return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={stroke} rx={2} />;
  }

  return <circle cx={cx} cy={cy} r={4} fill={stroke} />;
}


function parseThrowValue(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (v === '-') return 0;
  if (v.toLowerCase() === 'x') return 10;
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 || n > 10 ? null : n;
}

function isStrikeFrame(frame: FrameData): boolean {
  return frame.throw1.trim().toLowerCase() === 'x' || frame.throw2.trim().toLowerCase() === 'x';
}

function isSpareFrame(frame: FrameData): boolean {
  return frame.throw2.trim() === '/';
}

function validateBowlingScores(players: { name: string; frames: FrameData[] }[]): Set<string> {
  const errors = new Set<string>();

  for (let p = 0; p < players.length; p++) {
    const frames = players[p].frames;
    if (frames.length < 10) continue;

    const throws: (number | null)[] = [];

    for (let f = 0; f < 10; f++) {
      const frame = frames[f];

      if (f === 9) {
        const t1 = parseThrowValue(frame.throw1);
        throws.push(t1);
        if (frame.throw2.trim() === '/') {
          throws.push(t1 !== null ? 10 - t1 : null);
        } else {
          throws.push(parseThrowValue(frame.throw2));
        }
        if (frame.throw3.trim() === '/') {
          const prev = parseThrowValue(frame.throw2);
          throws.push(prev !== null ? 10 - prev : null);
        } else {
          throws.push(parseThrowValue(frame.throw3));
        }
      } else if (isStrikeFrame(frame)) {
        throws.push(10);
      } else if (isSpareFrame(frame)) {
        const t1 = parseThrowValue(frame.throw1);
        throws.push(t1);
        throws.push(t1 !== null ? 10 - t1 : null);
      } else {
        const t1 = parseThrowValue(frame.throw1);
        const t2 = parseThrowValue(frame.throw2);
        throws.push(t1);
        throws.push(t2);
        if (t1 !== null && t2 !== null && t1 + t2 > 10) {
          errors.add(`${p}-${f}-throw1`);
          errors.add(`${p}-${f}-throw2`);
        }
      }
    }

    let cum = 0;
    let ti = 0;

    for (let f = 0; f < 10; f++) {
      let score: number | null = null;

      if (f === 9) {
        const t1 = throws[ti];
        const t2 = throws[ti + 1];
        const t3 = throws[ti + 2];
        if (t1 !== null && t2 !== null) {
          score = t1 + t2 + (t3 ?? 0);
        }
        ti += 3;
      } else if (isStrikeFrame(frames[f])) {
        const b1 = throws[ti + 1];
        const b2 = throws[ti + 2];
        if (b1 !== null && b2 !== null) {
          score = 10 + b1 + b2;
        }
        ti += 1;
      } else if (isSpareFrame(frames[f])) {
        const bonus = throws[ti + 2];
        if (bonus !== null) {
          score = 10 + bonus;
        }
        ti += 2;
      } else {
        const t1 = throws[ti];
        const t2 = throws[ti + 1];
        if (t1 !== null && t2 !== null) {
          score = t1 + t2;
        }
        ti += 2;
      }

      if (score !== null) {
        cum += score;
        const ocrCum = parseInt(frames[f].cumulative.trim(), 10);
        if (!isNaN(ocrCum) && ocrCum !== cum) {
          errors.add(`${p}-${f}-cumulative`);
          errors.add(`${p}-${f}-throw1`);
          errors.add(`${p}-${f}-throw2`);
          if (f === 9) errors.add(`${p}-${f}-throw3`);
        }
      }
    }
  }

  return errors;
}

function polygonPoints(points: ManualCorner[]): string {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ');
}


function findNearestCornerIndex(corners: ManualCorner[], target: ManualCorner): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  corners.forEach((corner, index) => {
    const distance = Math.hypot(corner.x - target.x, corner.y - target.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}


export default function BowlingApp() {
  const [appTab, setAppTab] = useState<AppTab>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [manualCorners, setManualCorners] = useState<ManualCorner[]>([]);
  const [activeCornerIndex, setActiveCornerIndex] = useState<number | null>(null);
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null);
  const [rectifiedPreview, setRectifiedPreview] = useState<RectifiedPreview | null>(null);
  const [step, setStep] = useState(1);
  const [tableSubView, setTableSubView] = useState<TableSubView>('lines');
  const [cornerWarnings, setCornerWarnings] = useState<string[]>([]);
  const [guessingCorners, setGuessingCorners] = useState(false);
  const [rectifying, setRectifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [bwThreshold, setBwThreshold] = useState(75);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saveLocation, setSaveLocation] = useState('Squash House');
  const [saving, setSaving] = useState(false);
  const [savedGame, setSavedGame] = useState<GameRead | null>(null);
  const cornerImageRef = useRef<HTMLImageElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [magnifierPos, setMagnifierPos] = useState<{ nx: number; ny: number; px: number; py: number } | null>(null);
  const bwCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bwBaseImageRef = useRef<HTMLImageElement | null>(null);
  const edgeBaseImageRef = useRef<HTMLImageElement | null>(null);

  const bwThresholdRef = useRef(bwThreshold);
  bwThresholdRef.current = bwThreshold;

  const applyThresholdToCanvas = useCallback(() => {
    const canvas = bwCanvasRef.current;
    const img = bwBaseImageRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const threshold = bwThresholdRef.current;
    for (let i = 0; i < pixels.length; i += 4) {
      const val = pixels[i] > threshold ? 255 : 0;
      pixels[i] = val;
      pixels[i + 1] = val;
      pixels[i + 2] = val;
    }

    const edgeImg = edgeBaseImageRef.current;
    if (edgeImg) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(edgeImg, 0, 0, canvas.width, canvas.height);
        const edgeData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < edgeData.data.length; i += 4) {
          const r = edgeData.data[i];
          const g = edgeData.data[i + 1];
          const b = edgeData.data[i + 2];
          const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
          if (maxDiff > 30) {
            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  useEffect(() => {
    if (!rectifiedPreview?.bw_image_data_url) return;
    const img = new Image();
    img.onload = () => {
      bwBaseImageRef.current = img;
      applyThresholdToCanvas();
    };
    img.src = rectifiedPreview.bw_image_data_url;
  }, [rectifiedPreview?.bw_image_data_url, applyThresholdToCanvas]);

  useEffect(() => {
    if (!rectifiedPreview?.edge_debug_image_data_url) return;
    const img = new Image();
    img.onload = () => {
      edgeBaseImageRef.current = img;
      applyThresholdToCanvas();
    };
    img.src = rectifiedPreview.edge_debug_image_data_url;
  }, [rectifiedPreview?.edge_debug_image_data_url, applyThresholdToCanvas]);

  useEffect(() => {
    const timer = setTimeout(() => applyThresholdToCanvas(), 250);
    return () => clearTimeout(timer);
  }, [bwThreshold, applyThresholdToCanvas]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!magnifierPos) return;
    const canvas = magnifierCanvasRef.current;
    const img = cornerImageRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayW = img.getBoundingClientRect().width;
    const scale = img.naturalWidth / (displayW || 1);
    const srcSize = (MAGNIFIER_SIZE / MAGNIFIER_ZOOM) * scale;
    const srcX = magnifierPos.nx * img.naturalWidth - srcSize / 2;
    const srcY = magnifierPos.ny * img.naturalHeight - srcSize / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);

    const center = MAGNIFIER_SIZE / 2;
    ctx.strokeStyle = 'rgba(31, 111, 235, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, MAGNIFIER_SIZE);
    ctx.moveTo(0, center);
    ctx.lineTo(MAGNIFIER_SIZE, center);
    ctx.stroke();
  }, [magnifierPos]);

  function getNormalizedPoint(event: React.MouseEvent<HTMLDivElement>, imageElement: HTMLImageElement | null): ManualCorner | null {
    if (!imageElement) {
      return null;
    }

    const bounds = imageElement.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function getNormalizedPointFromTouch(event: React.TouchEvent<HTMLDivElement>, imageElement: HTMLImageElement | null): ManualCorner | null {
    if (!imageElement) return null;
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return null;
    const bounds = imageElement.getBoundingClientRect();
    const x = (touch.clientX - bounds.left) / bounds.width;
    const y = (touch.clientY - bounds.top) / bounds.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function getNormalizedPointFromPointer(event: React.PointerEvent, imageElement: HTMLImageElement | null): ManualCorner | null {
    if (!imageElement) return null;
    const bounds = imageElement.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setErrorMessage('');
    setStatusMessage('Monitor-Ecken werden gesucht...');
    setUploadedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setManualCorners([]);
    setActiveCornerIndex(null);
    setDraggingCornerIndex(null);
    setRectifiedPreview(null);
    setStep(1);
    setTableSubView('bw');
    setCornerWarnings([]);

    setGuessingCorners(true);
    try {
      const guessResult = await guessScorecardCorners(file);
      setManualCorners(guessResult.guessed_corners);
      setCornerWarnings(guessResult.warnings);
      setStatusMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Monitor-Ecken konnten nicht erkannt werden.');
      setStatusMessage('');
    } finally {
      setGuessingCorners(false);
      event.target.value = '';
    }
  }

  function handleCornerPreviewClick(event: React.MouseEvent<HTMLDivElement>) {
    const point = getNormalizedPoint(event, cornerImageRef.current);
    if (!point) {
      return;
    }

    setErrorMessage('');
    setManualCorners((current) => {
      if (current.length < 4) {
        return [...current, point];
      }

      const nextCorners = [...current];
      const targetIndex = activeCornerIndex ?? findNearestCornerIndex(current, point);
      nextCorners[targetIndex] = point;
      return nextCorners;
    });
    setActiveCornerIndex(null);
  }

  function handleCornerPreviewMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const img = cornerImageRef.current;
    if (!img) return;

    const bounds = img.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));

    setMagnifierPos({ nx, ny, px, py });

    if (draggingCornerIndex !== null) {
      setManualCorners((current) => current.map((corner, index) => (index === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function handleCornerPreviewTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();
    const point = getNormalizedPointFromTouch(event, cornerImageRef.current);
    if (!point) return;
    // find nearest corner if not tapping an existing button
    setActiveCornerIndex(null);
    setManualCorners((current) => {
      if (current.length < 4) return [...current, point];
      const next = [...current];
      const targetIndex = activeCornerIndex ?? findNearestCornerIndex(current, point);
      next[targetIndex] = point;
      return next;
    });
  }

  function handleCornerPreviewTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();
    const img = cornerImageRef.current;
    if (!img) return;
    const touch = event.touches[0];
    if (!touch) return;
    const bounds = img.getBoundingClientRect();
    const px = touch.clientX - bounds.left;
    const py = touch.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));

    setMagnifierPos({ nx, ny, px, py });

    if (draggingCornerIndex !== null) {
      setManualCorners((current) => current.map((corner, index) => (index === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function handleCornerPreviewTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();
    stopCornerDrag();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    // behave like mouse move but for pointer
    const img = cornerImageRef.current;
    if (!img) return;

    const bounds = img.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));

    setMagnifierPos({ nx, ny, px, py });

    if (draggingCornerIndex !== null) {
      setManualCorners((current) => current.map((corner, index) => (index === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    stopCornerDrag();
  }

  function handleButtonPointerDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch (e) {
      // ignore
    }
    setDraggingCornerIndex(index);
    setActiveCornerIndex(index);
  }

  function handleButtonPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    try {
      (event.target as Element).releasePointerCapture?.(event.pointerId);
    } catch (e) {
      // ignore
    }
    stopCornerDrag();
  }

  function stopCornerDrag() {
    if (draggingCornerIndex !== null) {
      setDraggingCornerIndex(null);
    }
    // hide magnifier when drag stops
    setMagnifierPos(null);
  }

  async function handleConfirmCorners() {
    if (!uploadedFile || manualCorners.length !== 4) {
      setErrorMessage('Bitte genau vier Monitor-Eckpunkte setzen.');
      return;
    }

    setRectifying(true);
    setErrorMessage('');
    setStatusMessage('Bild wird entzerrt und Tabelle wird gesucht...');

    try {
      const preview = await rectifyScorecard(uploadedFile, manualCorners);
      setRectifiedPreview(preview);
      setStep(2);
      setTableSubView('bw');
      setStatusMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Verarbeitung fehlgeschlagen.');
      setStatusMessage('');
    } finally {
      setRectifying(false);
    }
  }

  function goToStep(targetStep: number) {
    if (targetStep < 1 || targetStep > 2) {
      return;
    }
    if (targetStep >= 2 && !rectifiedPreview) {
      return;
    }
    setStep(targetStep);
    setErrorMessage('');
    setStatusMessage('');
  }

  async function handleExtract() {
    if (!uploadedFile || manualCorners.length !== 4) {
      return;
    }

    setExtracting(true);
    setErrorMessage('');

    try {
      const result = await extractScorecard(uploadedFile, manualCorners, bwThreshold);
      setExtractionResult(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'OCR-Extraktion fehlgeschlagen.');
    } finally {
      setExtracting(false);
    }
  }

  function updatePlayerName(playerIdx: number, name: string) {
    setExtractionResult((prev) => {
      if (!prev) return prev;
      const players = [...prev.players];
      players[playerIdx] = { ...players[playerIdx], name };
      return { ...prev, players };
    });
  }

  function removePlayerRow(playerIdx: number) {
    setShowSaveForm(false);
    setExtractionResult((prev) => {
      if (!prev) return prev;
      const players = prev.players.filter((_, idx) => idx !== playerIdx);
      return { ...prev, players };
    });
  }

  function updateFrame(playerIdx: number, frameIdx: number, field: keyof FrameData, value: string) {
    setExtractionResult((prev) => {
      if (!prev) return prev;
      const players = [...prev.players];
      const frames = [...players[playerIdx].frames];
      frames[frameIdx] = { ...frames[frameIdx], [field]: value };
      players[playerIdx] = { ...players[playerIdx], frames };
      return { ...prev, players };
    });
  }

  function computeTotalScore(frames: FrameData[]): number {
    if (frames.length === 10) {
      const last = parseInt(frames[9].cumulative.trim(), 10);
      if (!isNaN(last)) return last;
    }
    return 0;
  }

  async function handleSaveGame() {
    if (!extractionResult || !saveLocation.trim() || !saveDate) return;

    setSaving(true);
    setErrorMessage('');

    try {
      const game = await createGame({
        played_at: saveDate,
        location: saveLocation.trim(),
        scores: extractionResult.players.map((player) => ({
          player_name: normalizePlayerName(player.name),
          total_score: computeTotalScore(player.frames),
          frames: player.frames,
        })),
      });
      setSavedGame(game);
      setShowSaveForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  const scoreErrors = extractionResult ? validateBowlingScores(extractionResult.players) : new Set<string>();



  const currentWarnings = step === 1 ? cornerWarnings : [...(rectifiedPreview?.warnings ?? []), ...(extractionResult?.warnings ?? [])];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="panel overflow-hidden rounded-[2.4rem] border border-lane-200/60 p-6 sm:p-8">
        <p className="text-sm uppercase tracking-[0.36em] text-lane-500">bowling.sophiealexandra.de</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-lane-900 sm:text-4xl">
          Bowling Stats
        </h1>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              appTab === 'upload' ? 'bg-lane-800 text-white' : 'border border-lane-300 text-lane-700 hover:bg-white/70'
            }`}
            onClick={() => setAppTab('upload')}
          >
            Upload
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              appTab === 'stats' ? 'bg-lane-800 text-white' : 'border border-lane-300 text-lane-700 hover:bg-white/70'
            }`}
            onClick={() => setAppTab('stats')}
          >
            Statistiken
          </button>
        </div>
      </section>

      {appTab === 'stats' && <StatsView />}

      {appTab === 'upload' && <>
      <nav className="flex items-center gap-1.5 rounded-[2rem] bg-[rgba(41,24,9,0.92)] p-2.5 text-white sm:gap-2 sm:p-3">
        {PIPELINE_STEPS.map(({ title }, index) => {
          const number = index + 1;
          const isActive = step === number;
          const isReachable = number === 1 || (number === 2 && !!rectifiedPreview);

          return (
            <button
              key={number}
              type="button"
              className={`flex-1 rounded-2xl px-2 py-2.5 text-center text-xs font-medium transition sm:px-3 sm:text-sm ${
                isActive
                  ? 'bg-white/20 text-white'
                  : isReachable
                    ? 'text-lane-200 hover:bg-white/10'
                    : 'cursor-not-allowed text-lane-500'
              }`}
              onClick={() => isReachable && goToStep(number)}
              disabled={!isReachable}
            >
              {number}. {title}
            </button>
          );
        })}
      </nav>

      <section className="panel rounded-[2rem] p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Schritt {step} von {PIPELINE_STEPS.length}</p>
            <h2 className="mt-1.5 text-xl font-semibold text-lane-800 sm:text-2xl">{PIPELINE_STEPS[step - 1].title}</h2>
          </div>
          {step === 1 && (
            <span className="rounded-full bg-lane-100 px-3 py-1 text-sm font-medium text-lane-700">
              {guessingCorners ? 'Suche...' : manualCorners.length === 4 ? '4 Ecken gesetzt' : `${manualCorners.length}/4 Ecken`}
            </span>
          )}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-[1.3rem] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Fehler</p>
                <p className="mt-1 whitespace-pre-wrap">{errorMessage}</p>
              </div>
              <button
                className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-white"
                type="button"
                onClick={() => setErrorMessage('')}
              >
                Schließen
              </button>
            </div>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mb-4 rounded-[1.3rem] border border-lane-200 bg-lane-50 px-4 py-3 text-sm text-lane-700">
            {statusMessage}
          </div>
        ) : null}

        {currentWarnings.length > 0 ? (
          <ul className="mb-4 grid gap-2">
            {currentWarnings.map((warning) => (
              <li key={warning} className="rounded-[1.2rem] border border-lane-200 bg-lane-50 px-4 py-3 text-sm text-lane-800">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        {step === 1 && !previewUrl ? (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-lane-300 bg-white/50 px-4 py-14 text-center transition hover:border-lane-500 hover:bg-white/70">
            <span className="text-lg font-medium text-lane-800">Bild auswählen</span>
            <span className="mt-2 text-sm text-lane-600">PNG oder JPG direkt vom Bowling-Monitor</span>
            <input className="hidden" type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} />
          </label>
        ) : null}

        {step === 1 && previewUrl ? (
          <div className="rounded-[1.5rem] bg-[rgba(255,255,255,0.74)] p-4">
              <div
                  className="relative mt-4 overflow-hidden rounded-[1.2rem] border border-lane-200 bg-white"
                  onClick={handleCornerPreviewClick}
                  onMouseMove={handleCornerPreviewMouseMove}
                onPointerMove={handlePointerMove}
                  onMouseUp={stopCornerDrag}
                onMouseLeave={() => { setMagnifierPos(null); stopCornerDrag(); }}
                onTouchStart={handleCornerPreviewTouchStart}
                onTouchMove={handleCornerPreviewTouchMove}
                onTouchEnd={handleCornerPreviewTouchEnd}
                onPointerUp={handlePointerUp}
                  onContextMenu={(e) => e.preventDefault()}
                  role="button"
                  tabIndex={0}
                  style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                    }
                  }}
                >
              <img
                ref={cornerImageRef}
                alt="Bowling-Monitor Farbvorschau"
                className="block max-h-[40rem] w-full object-contain"
                src={previewUrl}
              />
              {manualCorners.length >= 2 ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {manualCorners.length === 4 ? (
                    <polygon fill="rgba(31,111,235,0.10)" points={polygonPoints(manualCorners)} stroke="rgba(31,111,235,0.90)" strokeWidth="0.6" />
                  ) : (
                    <polyline fill="none" points={polygonPoints(manualCorners)} stroke="rgba(31,111,235,0.90)" strokeWidth="0.6" />
                  )}
                </svg>
              ) : null}
              {manualCorners.map((corner, index) => (
                <button
                  key={`${corner.x}-${corner.y}-${index}`}
                  className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold shadow-lg ${
                    activeCornerIndex === index ? 'bg-lane-800 text-white' : 'bg-blue-600 text-white'
                  }`}
                  style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDraggingCornerIndex(index);
                    setActiveCornerIndex(index);
                  }}
                  onPointerDown={(event) => handleButtonPointerDown(event, index)}
                  onPointerUp={(event) => handleButtonPointerUp(event)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveCornerIndex(index);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {index + 1}
                </button>
              ))}
              {magnifierPos && (
                <div
                  className="pointer-events-none absolute z-20 overflow-hidden rounded-2xl border-2 border-white/80 shadow-xl ring-1 ring-black/10"
                  style={{
                    left: magnifierPos.px + (magnifierPos.px > MAGNIFIER_SIZE + 24 ? -(MAGNIFIER_SIZE + 16) : 16),
                    top: magnifierPos.py + (magnifierPos.py > MAGNIFIER_SIZE + 24 ? -(MAGNIFIER_SIZE + 16) : 16),
                    width: MAGNIFIER_SIZE,
                    height: MAGNIFIER_SIZE,
                  }}
                >
                  <canvas
                    ref={magnifierCanvasRef}
                    width={MAGNIFIER_SIZE}
                    height={MAGNIFIER_SIZE}
                    className="block bg-black"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleConfirmCorners}
                disabled={manualCorners.length !== 4 || rectifying}
              >
                {rectifying ? 'Verarbeite...' : 'Ecken bestätigen →'}
              </button>
              <button
                className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70"
                type="button"
                onClick={() => {
                  setManualCorners([]);
                  setActiveCornerIndex(null);
                  setDraggingCornerIndex(null);
                }}
              >
                Zurücksetzen
              </button>
              <button
                className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setManualCorners((current) => current.slice(0, -1));
                  setActiveCornerIndex(null);
                  setDraggingCornerIndex(null);
                }}
                disabled={!manualCorners.length}
              >
                Letzten Punkt entfernen
              </button>
              <label className="rounded-full border border-lane-300 bg-white/80 px-4 py-2 text-sm font-medium text-lane-700 cursor-pointer transition hover:bg-white">
                Neues Bild
                <input className="hidden" type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} />
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 && rectifiedPreview ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 rounded-full border border-lane-200 bg-white/90 p-1 self-start">
              {TABLE_SUB_VIEWS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    tableSubView === key ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'
                  }`}
                  type="button"
                  onClick={() => setTableSubView(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tableSubView === 'bw' && (
              <div className="flex items-center gap-3 rounded-[1.3rem] border border-lane-200 bg-white/90 px-4 py-2.5">
                <label className="text-xs font-medium text-lane-700 whitespace-nowrap" htmlFor="bw-threshold">
                  S/W Schwelle
                </label>
                <input
                  id="bw-threshold"
                  type="range"
                  min={10}
                  max={240}
                  step={1}
                  value={bwThreshold}
                  onChange={(e) => setBwThreshold(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="min-w-[2.5rem] text-right text-xs font-mono text-lane-600">{bwThreshold}</span>
              </div>
            )}

            <div className="overflow-hidden rounded-[1.3rem] border border-lane-200 bg-white">
              {tableSubView === 'bw' ? (
                <canvas
                  ref={bwCanvasRef}
                  className="block max-h-[42rem] w-full object-contain"
                />
              ) : (
                <img
                  alt="Tabelle finden: Linien"
                  className="block max-h-[42rem] w-full object-contain"
                  src={rectifiedPreview?.edge_debug_image_data_url ?? ''}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70"
                type="button"
                onClick={() => goToStep(1)}
              >
                ← Zurück zu Monitor
              </button>
              <button
                className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleExtract}
                disabled={extracting}
              >
                {extracting ? 'Extrahiere...' : 'Text extrahieren'}
              </button>
            </div>

            {extractionResult ? (
              <div className="mt-4 overflow-x-auto rounded-[1.3rem] p-4 border border-lane-200 bg-white/80 -mx-1 sm:mx-0">
                <table className="min-w-[700px] w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-left font-semibold text-lane-800">Name</th>
                      {Array.from({ length: 10 }, (_, i) => (
                        <th key={i} className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">
                          {i + 1}
                        </th>
                      ))}
                      <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractionResult.players.map((player, pIdx) => (
                      <tr key={pIdx}>
                        <td className="border border-lane-200 px-1 py-1">
                          <input
                            className={`w-full min-w-[80px] rounded px-1 py-0.5 text-sm text-lane-900 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${player.name.trim() ? 'bg-transparent' : 'bg-red-100'}`}
                            value={player.name}
                            onChange={(e) => updatePlayerName(pIdx, e.target.value)}
                            placeholder="Name fehlt"
                          />
                        </td>
                        {player.frames.map((frame, fIdx) => {
                          const errClass = (field: string) =>
                            scoreErrors.has(`${pIdx}-${fIdx}-${field}`) ? 'bg-red-100' : 'bg-transparent';

                          return (
                            <td key={fIdx} className="border border-lane-200 px-0 py-0">
                              <div className="flex border-b border-lane-100">
                                <input
                                  className={`w-1/2 border-r border-lane-100 px-1 py-0.5 text-center outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${errClass('throw1')}`}
                                  value={frame.throw1}
                                  onChange={(e) => updateFrame(pIdx, fIdx, 'throw1', e.target.value)}
                                  placeholder="nA"
                                />
                                <input
                                  className={`w-1/2 px-1 py-0.5 text-center outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${errClass('throw2')}`}
                                  value={frame.throw2}
                                  onChange={(e) => updateFrame(pIdx, fIdx, 'throw2', e.target.value)}
                                  placeholder="nA"
                                />
                                {fIdx === 9 ? (
                                  <input
                                    className={`w-1/2 border-l border-lane-100 px-1 py-0.5 text-center outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${errClass('throw3')}`}
                                    value={frame.throw3}
                                    onChange={(e) => updateFrame(pIdx, fIdx, 'throw3', e.target.value)}
                                    placeholder="nA"
                                  />
                                ) : null}
                              </div>
                              <input
                                className={`w-full px-1 py-0.5 text-center text-lane-600 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 ${errClass('cumulative')}`}
                                value={frame.cumulative}
                                onChange={(e) => updateFrame(pIdx, fIdx, 'cumulative', e.target.value)}
                                placeholder="nA"
                              />
                            </td>
                          );
                        })}
                        <td className="border border-lane-200 px-2 py-1 align-top">
                          <button
                            type="button"
                            aria-label={`Spieler ${player.name || pIdx + 1} löschen`}
                            title="Zeile löschen"
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 text-red-700 transition hover:bg-red-50"
                            onClick={() => removePlayerRow(pIdx)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 7h16" />
                              <path d="M9 7V5.8c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7" />
                              <path d="M7.2 7l.8 11c.1 1 1 1.8 2 1.8h4c1 0 1.9-.8 2-1.8l.8-11" />
                              <path d="M10 11.2v5.6" />
                              <path d="M14 11.2v5.6" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {extractionResult && extractionResult.players.length > 0 && !savedGame ? (
              <div className="mt-2">
                {!showSaveForm ? (
                  <div className="flex justify-end">
                    <button
                      className="rounded-full bg-lane-800 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={extractionResult.players.some((p) => !p.name.trim()) || scoreErrors.size > 0}
                      onClick={() => setShowSaveForm(true)}
                    >
                      Ergebnis speichern
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-lane-800">Spieldetails ergänzen</h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="save-date" className="text-xs font-medium text-lane-600">Datum</label>
                        <input
                          id="save-date"
                          type="date"
                          value={saveDate}
                          onChange={(e) => setSaveDate(e.target.value)}
                          className="rounded-lg border border-lane-200 px-3 py-1.5 text-sm text-lane-900 outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <label htmlFor="save-location" className="text-xs font-medium text-lane-600">Ort / Bowlingbahn</label>
                        <input
                          id="save-location"
                          type="text"
                          value={saveLocation}
                          onChange={(e) => setSaveLocation(e.target.value)}
                          placeholder="z.B. Bowling Arena Stuttgart"
                          className="rounded-lg border border-lane-200 px-3 py-1.5 text-sm text-lane-900 outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                      <button
                        className="rounded-full bg-lane-800 px-5 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={!saveLocation.trim() || !saveDate || saving}
                        onClick={handleSaveGame}
                      >
                        {saving ? 'Speichert...' : 'Jetzt speichern'}
                      </button>
                      <button
                        className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70"
                        type="button"
                        onClick={() => setShowSaveForm(false)}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {savedGame ? (
              <div className="grid gap-4">
                <div className="rounded-[1.3rem] border border-green-300 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-semibold">Gespeichert!</p>
                  <p className="mt-1">
                    Spiel #{savedGame.id} — {savedGame.location}, {savedGame.played_at} — {savedGame.scores.length} Spieler
                  </p>
                </div>

                <div className="rounded-[1.3rem] border border-lane-200 bg-white/90 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-lane-800">Punkteverlauf</h3>
                    <div className="flex items-center gap-4 text-xs text-lane-600">
                      <span className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12" stroke="#64748b" strokeWidth="2" /><line x1="12" y1="2" x2="2" y2="12" stroke="#64748b" strokeWidth="2" /></svg>
                        Strike
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="#64748b" rx="2" /></svg>
                        Spare
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4" fill="#64748b" /></svg>
                        Normal
                      </span>
                    </div>
                  </div>
                  <div style={{ touchAction: 'none' }}>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={buildCumulativeChartData(savedGame.scores)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
                        <XAxis dataKey="frame" label={{ value: 'Frame', position: 'insideBottomRight', offset: -5 }} tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        {savedGame.scores.map((score, i) => (
                          <Line
                            key={score.player_name}
                            type="monotone"
                            dataKey={score.player_name}
                            stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                            strokeWidth={2}
                            dot={<FrameDot />}
                            activeDot={{ r: 6 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      </>}
    </main>
  );
}
