'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { buildTable, checkApiHealth, createGame, extractScorecard, fetchRecentPlayerNames, guessScorecardCorners, rectifyScorecard } from '@/lib/api';
import type { ExtractionResult, FrameData, GameRead, LineSegment, ManualCorner, RectifiedPreview, TableBuildResult } from '@/types';

type TableSubView = 'morph-horizontal' | 'morph-vertical' | 'bw';

const PIPELINE_STEPS = [
  { title: 'Monitor finden' },
  { title: 'Tabelle & Ergebnis' },
];

const MAGNIFIER_SIZE = 140;
const MAGNIFIER_ZOOM = 4;
const LINE_SELECT_THRESHOLD = 0.025;

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777'];

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function isPlaceholderPlayerName(name: string): boolean {
  return /\d\s*$/.test(normalizePlayerName(name));
}

type FrameType = 'strike' | 'spare' | 'normal';

function getFrameType(frame: FrameData): FrameType {
  if (frame.throw1.trim().toLowerCase() === 'x' || frame.throw2.trim().toLowerCase() === 'x') return 'strike';
  if (frame.throw2.trim() === '/') return 'spare';
  return 'normal';
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
  if (frameType === 'spare') return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={stroke} rx={2} />;
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

function parseCompactFrameInput(rawValue: string, isTenthFrame: boolean): Pick<FrameData, 'throw1' | 'throw2' | 'throw3'> {
  const raw = rawValue.trim();
  if (!raw) return { throw1: '', throw2: '', throw3: '' };

  if (raw.includes('|')) {
    const parts = raw.split('|').map((part) => part.trim());
    return {
      throw1: parts[0] ?? '',
      throw2: parts[1] ?? '',
      throw3: isTenthFrame ? (parts[2] ?? '') : '',
    };
  }

  const compact = raw.replace(/\s+/g, '');
  const maxLength = isTenthFrame ? 3 : 2;
  const chars = compact.slice(0, maxLength).split('');
  return {
    throw1: chars[0] ?? '',
    throw2: chars[1] ?? '',
    throw3: isTenthFrame ? (chars[2] ?? '') : '',
  };
}

function formatCompactFrameInput(frame: FrameData, isTenthFrame: boolean): string {
  const throw1 = String(frame.throw1 ?? '').trim();
  const throw2 = String(frame.throw2 ?? '').trim();
  const throw3 = String(frame.throw3 ?? '').trim();

  if (isTenthFrame) {
    if (!throw1 && !throw2 && !throw3) return '';
    if (!throw2 && !throw3) return throw1;
    if (!throw3) return `${throw1}|${throw2}`;
    return `${throw1}|${throw2}|${throw3}`;
  }

  if (!throw1 && !throw2) return '';
  if (!throw2) return throw1;
  return `${throw1}|${throw2}`;
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
        throws.push(frame.throw2.trim() === '/' ? (t1 !== null ? 10 - t1 : null) : parseThrowValue(frame.throw2));
        throws.push(frame.throw3.trim() === '/' ? (() => { const prev = parseThrowValue(frame.throw2); return prev !== null ? 10 - prev : null; })() : parseThrowValue(frame.throw3));
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
    let cum = 0, ti = 0;
    for (let f = 0; f < 10; f++) {
      let score: number | null = null;
      if (f === 9) {
        const t1 = throws[ti], t2 = throws[ti + 1], t3 = throws[ti + 2];
        if (t1 !== null && t2 !== null) score = t1 + t2 + (t3 ?? 0);
        ti += 3;
      } else if (isStrikeFrame(frames[f])) {
        const b1 = throws[ti + 1], b2 = throws[ti + 2];
        if (b1 !== null && b2 !== null) score = 10 + b1 + b2;
        ti += 1;
      } else if (isSpareFrame(frames[f])) {
        const bonus = throws[ti + 2];
        if (bonus !== null) score = 10 + bonus;
        ti += 2;
      } else {
        const t1 = throws[ti], t2 = throws[ti + 1];
        if (t1 !== null && t2 !== null) score = t1 + t2;
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
    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
  });
  return nearestIndex;
}

function distanceToSegment(seg: LineSegment, px: number, py: number): number {
  const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - seg.x1, py - seg.y1);
  const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / len2));
  return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
}

const MORPH_BRIGHT = 128;

function getMorphBrightness(data: ImageData, x: number, y: number): number {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || ix >= data.width || iy < 0 || iy >= data.height) return 0;
  return data.data[(iy * data.width + ix) * 4];
}

function findWhitePixelNear(data: ImageData, px: number, py: number): [number, number] | null {
  for (let r = 0; r <= 15; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = px + dx, y = py + dy;
        if (x >= 0 && x < data.width && y >= 0 && y < data.height
          && getMorphBrightness(data, x, y) >= MORPH_BRIGHT) return [x, y];
      }
    }
  }
  return null;
}

function scanBand(data: ImageData, startPos: number, fixedCoord: number, scanAxis: 'x' | 'y', maxGap = 0): [number, number] {
  const limit = scanAxis === 'x' ? data.width : data.height;
  let lo = startPos, hi = startPos;
  const bright = (p: number) => scanAxis === 'x'
    ? getMorphBrightness(data, p, fixedCoord) : getMorphBrightness(data, fixedCoord, p);
  if (maxGap <= 0) {
    while (lo > 0 && bright(lo - 1) >= MORPH_BRIGHT) lo--;
    while (hi < limit - 1 && bright(hi + 1) >= MORPH_BRIGHT) hi++;
  } else {
    let gap = 0;
    for (let p = startPos - 1; p >= 0; p--) {
      if (bright(p) >= MORPH_BRIGHT) { lo = p; gap = 0; } else { gap++; if (gap > maxGap) break; }
    }
    gap = 0;
    for (let p = startPos + 1; p < limit; p++) {
      if (bright(p) >= MORPH_BRIGHT) { hi = p; gap = 0; } else { gap++; if (gap > maxGap) break; }
    }
  }
  return [lo, hi];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function findMorphCenterNear(
  data: ImageData,
  variableCoord: number,
  predictedFixedCoord: number,
  orientation: 'h' | 'v',
  searchRadius: number,
): number | null {
  const fixedLimit = orientation === 'h' ? data.height : data.width;
  const fixedAxis: 'x' | 'y' = orientation === 'h' ? 'y' : 'x';
  const start = Math.max(0, Math.round(predictedFixedCoord - searchRadius));
  const end = Math.min(fixedLimit - 1, Math.round(predictedFixedCoord + searchRadius));

  let bestCoord = -1;
  let bestDistance = Infinity;
  for (let fixedCoord = start; fixedCoord <= end; fixedCoord++) {
    const brightness = orientation === 'h'
      ? getMorphBrightness(data, variableCoord, fixedCoord)
      : getMorphBrightness(data, fixedCoord, variableCoord);
    if (brightness < MORPH_BRIGHT) continue;
    const distance = Math.abs(fixedCoord - predictedFixedCoord);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCoord = fixedCoord;
    }
  }
  if (bestCoord < 0) return null;

  const [lo, hi] = scanBand(data, bestCoord, variableCoord, fixedAxis);
  return (lo + hi) / 2;
}

function traceMorphLinePoints(data: ImageData, hitX: number, hitY: number, orientation: 'h' | 'v'): [number, number][] {
  const isHorizontal = orientation === 'h';
  const axisLimit = isHorizontal ? data.width : data.height;
  const fixedLimit = isHorizontal ? data.height : data.width;
  const startAxis = isHorizontal ? hitX : hitY;
  const startFixed = isHorizontal ? hitY : hitX;
  const fixedAxis: 'x' | 'y' = isHorizontal ? 'y' : 'x';
  const searchRadius = Math.max(10, Math.floor(fixedLimit * 0.035));
  const maxGap = Math.max(8, Math.floor(axisLimit * 0.025));
  const step = Math.max(1, Math.floor(axisLimit / 700));

  const [startLo, startHi] = scanBand(data, startFixed, startAxis, fixedAxis);
  const startCenter = (startLo + startHi) / 2;
  const leftOrTop: [number, number][] = [];
  const rightOrBottom: [number, number][] = [];

  const walk = (direction: -1 | 1, out: [number, number][]) => {
    let predictedFixed = startCenter;
    let gap = 0;
    for (let axis = startAxis + direction * step; axis >= 0 && axis < axisLimit; axis += direction * step) {
      const center = findMorphCenterNear(data, axis, predictedFixed, orientation, searchRadius);
      if (center === null) {
        gap += step;
        if (gap > maxGap) break;
        continue;
      }
      predictedFixed = center;
      gap = 0;
      out.push(isHorizontal ? [axis, center] : [center, axis]);
    }
  };

  walk(-1, leftOrTop);
  walk(1, rightOrBottom);
  return [...leftOrTop.reverse(), isHorizontal ? [startAxis, startCenter] : [startCenter, startAxis], ...rightOrBottom];
}

function fitHorizontalMorphLine(data: ImageData, hitX: number, hitY: number): LineSegment | null {
  const points = traceMorphLinePoints(data, hitX, hitY, 'h');
  if (points.length < 2) return null;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  if (maxX - minX + 1 < data.width * 0.35) return null;

  const n = points.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const det = n * sxx - sx * sx;
  if (Math.abs(det) <= 1e-6) return null;
  const slope = (n * sxy - sx * sy) / det;
  const intercept = (sy - slope * sx) / n;
  const yAtLeft = intercept;
  const yAtRight = slope * (data.width - 1) + intercept;
  return { x1: 0, y1: clamp01(yAtLeft / (data.height - 1)), x2: 1, y2: clamp01(yAtRight / (data.height - 1)) };
}

function fitVerticalMorphLine(data: ImageData, hitX: number, hitY: number): LineSegment | null {
  const points = traceMorphLinePoints(data, hitX, hitY, 'v');
  if (points.length < 2) return null;
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  if (maxY - minY + 1 < data.height * 0.35) return null;

  const n = points.length;
  let sx = 0, sy = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) { sx += x; sy += y; syy += y * y; sxy += x * y; }
  const det = n * syy - sy * sy;
  if (Math.abs(det) <= 1e-6) return null;
  const slope = (n * sxy - sx * sy) / det;
  const intercept = (sx - slope * sy) / n;
  const xAtTop = intercept;
  const xAtBottom = slope * (data.height - 1) + intercept;
  return { x1: clamp01(xAtTop / (data.width - 1)), y1: 0, x2: clamp01(xAtBottom / (data.width - 1)), y2: 1 };
}

function scanHorizontalLine(data: ImageData, nx: number, ny: number): LineSegment | null {
  const w = data.width, h = data.height;
  const hit = findWhitePixelNear(data, Math.round(nx * (w - 1)), Math.round(ny * (h - 1)));
  if (!hit) return null;
  return fitHorizontalMorphLine(data, hit[0], hit[1]);
}

function scanVerticalLine(data: ImageData, nx: number, ny: number): LineSegment | null {
  const w = data.width, h = data.height;
  const hit = findWhitePixelNear(data, Math.round(nx * (w - 1)), Math.round(ny * (h - 1)));
  if (!hit) return null;
  return fitVerticalMorphLine(data, hit[0], hit[1]);
}

export default function UploadView() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [manualCorners, setManualCorners] = useState<ManualCorner[]>([]);
  const [activeCornerIndex, setActiveCornerIndex] = useState<number | null>(null);
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null);
  const [rectifiedPreview, setRectifiedPreview] = useState<RectifiedPreview | null>(null);
  const [step, setStep] = useState(1);
  const [tableSubView, setTableSubView] = useState<TableSubView>('morph-horizontal');

  const [selectedHLines, setSelectedHLines] = useState<LineSegment[]>([]);
  const [selectedVLines, setSelectedVLines] = useState<LineSegment[]>([]);
  const [focusedLine, setFocusedLine] = useState<{ orientation: 'h' | 'v'; index: number } | null>(null);
  const [movingLine, setMovingLine] = useState(false);
  const [draggingEndpoint, setDraggingEndpoint] = useState<'start' | 'end' | null>(null);
  const [focusPosition, setFocusPosition] = useState<{ x: number; y: number } | null>(null);

  const [tableBuildResult, setTableBuildResult] = useState<TableBuildResult | null>(null);
  const [buildingTable, setBuildingTable] = useState(false);

  const [cornerWarnings, setCornerWarnings] = useState<string[]>([]);
  const [guessingCorners, setGuessingCorners] = useState(false);
  const [rectifying, setRectifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [bwThreshold, setBwThreshold] = useState(75);
  const [showRowCrops, setShowRowCrops] = useState(true);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saveLocation, setSaveLocation] = useState('Squash House');
  const [saving, setSaving] = useState(false);
  const [savedGame, setSavedGame] = useState<GameRead | null>(null);
  const [bwCanvasReady, setBwCanvasReady] = useState(false);

  const cornerImageRef = useRef<HTMLImageElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [magnifierPos, setMagnifierPos] = useState<{ nx: number; ny: number; px: number; py: number } | null>(null);
  const bwCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bwBaseImageRef = useRef<HTMLImageElement | null>(null);
  const morphImageRef = useRef<HTMLImageElement | null>(null);
  const hMorphDataRef = useRef<ImageData | null>(null);
  const vMorphDataRef = useRef<ImageData | null>(null);

  const bwThresholdRef = useRef(bwThreshold);
  bwThresholdRef.current = bwThreshold;

  const tableConfirmed = tableBuildResult !== null && !!tableBuildResult.rectified_bw_data_url;

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
      pixels[i] = val; pixels[i + 1] = val; pixels[i + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    setBwCanvasReady(true);
  }, []);

  useEffect(() => {
    checkApiHealth().then(setApiOnline);
    const id = setInterval(() => checkApiHealth().then(setApiOnline), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setBwCanvasReady(false);
    const src = tableBuildResult?.rectified_bw_data_url;
    if (!src) return;
    const img = new Image();
    img.onload = () => { bwBaseImageRef.current = img; applyThresholdToCanvas(); };
    img.src = src;
  }, [tableBuildResult?.rectified_bw_data_url, applyThresholdToCanvas]);

  useEffect(() => {
    if (tableSubView !== 'bw') return;
    const frameId = requestAnimationFrame(() => applyThresholdToCanvas());
    return () => cancelAnimationFrame(frameId);
  }, [tableSubView, tableBuildResult?.rectified_bw_data_url, applyThresholdToCanvas]);

  useEffect(() => {
    const timer = setTimeout(() => applyThresholdToCanvas(), 250);
    return () => clearTimeout(timer);
  }, [bwThreshold, applyThresholdToCanvas]);

  useEffect(() => {
    hMorphDataRef.current = null;
    vMorphDataRef.current = null;
    function loadMorphData(src: string | null | undefined, ref: React.MutableRefObject<ImageData | null>) {
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        ref.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      img.src = src;
    }
    loadMorphData(rectifiedPreview?.morph_horizontal_data_url, hMorphDataRef);
    loadMorphData(rectifiedPreview?.morph_vertical_data_url, vMorphDataRef);
  }, [rectifiedPreview?.morph_horizontal_data_url, rectifiedPreview?.morph_vertical_data_url]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
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
    ctx.moveTo(center, 0); ctx.lineTo(center, MAGNIFIER_SIZE);
    ctx.moveTo(0, center); ctx.lineTo(MAGNIFIER_SIZE, center);
    ctx.stroke();
  }, [magnifierPos]);

  function getNormalizedPoint(event: React.MouseEvent | React.PointerEvent, el: HTMLImageElement | null): ManualCorner | null {
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function getNormalizedPointFromTouch(event: React.TouchEvent, el: HTMLImageElement | null): ManualCorner | null {
    if (!el) return null;
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return null;
    const bounds = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (touch.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (touch.clientY - bounds.top) / bounds.height)),
    };
  }

  // --- Corner handlers ---

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setErrorMessage(''); setStatusMessage('Monitor-Ecken werden gesucht...');
    setUploadedFile(file); setPreviewUrl(URL.createObjectURL(file));
    setManualCorners([]); setActiveCornerIndex(null); setDraggingCornerIndex(null);
    setRectifiedPreview(null); setStep(1); setTableSubView('morph-horizontal');
    setSelectedHLines([]); setSelectedVLines([]); setFocusedLine(null); setMovingLine(false);
    setTableBuildResult(null); setExtractionResult(null); setSavedGame(null);
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
    if (!point) return;
    setErrorMessage('');
    setManualCorners((current) => {
      if (current.length < 4) return [...current, point];
      const nextCorners = [...current];
      nextCorners[activeCornerIndex ?? findNearestCornerIndex(current, point)] = point;
      return nextCorners;
    });
    setActiveCornerIndex(null);
  }

  function handleCornerMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const img = cornerImageRef.current;
    if (!img) return;
    const bounds = img.getBoundingClientRect();
    const px = event.clientX - bounds.left, py = event.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));
    setMagnifierPos({ nx, ny, px, py });
    if (draggingCornerIndex !== null) {
      setManualCorners((c) => c.map((corner, i) => (i === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function handleCornerTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();
    const point = getNormalizedPointFromTouch(event, cornerImageRef.current);
    if (!point) return;
    setManualCorners((current) => {
      if (current.length < 4) return [...current, point];
      const next = [...current];
      next[activeCornerIndex ?? findNearestCornerIndex(current, point)] = point;
      return next;
    });
    setActiveCornerIndex(null);
  }

  function handleCornerTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();
    const img = cornerImageRef.current;
    if (!img) return;
    const touch = event.touches[0];
    if (!touch) return;
    const bounds = img.getBoundingClientRect();
    const px = touch.clientX - bounds.left, py = touch.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));
    setMagnifierPos({ nx, ny, px, py });
    if (draggingCornerIndex !== null) {
      setManualCorners((c) => c.map((corner, i) => (i === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function stopCornerDrag() {
    if (draggingCornerIndex !== null) setDraggingCornerIndex(null);
    setMagnifierPos(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const img = cornerImageRef.current;
    if (!img) return;
    const bounds = img.getBoundingClientRect();
    const px = event.clientX - bounds.left, py = event.clientY - bounds.top;
    const nx = Math.min(1, Math.max(0, px / bounds.width));
    const ny = Math.min(1, Math.max(0, py / bounds.height));
    setMagnifierPos({ nx, ny, px, py });
    if (draggingCornerIndex !== null) {
      setManualCorners((c) => c.map((corner, i) => (i === draggingCornerIndex ? { x: nx, y: ny } : corner)));
    }
  }

  function handleButtonPointerDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault(); event.stopPropagation();
    try { (event.target as Element).setPointerCapture?.(event.pointerId); } catch { /* */ }
    setDraggingCornerIndex(index); setActiveCornerIndex(index);
  }

  function handleButtonPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    try { (event.target as Element).releasePointerCapture?.(event.pointerId); } catch { /* */ }
    stopCornerDrag();
  }

  async function handleConfirmCorners() {
    if (!uploadedFile || manualCorners.length !== 4) {
      setErrorMessage('Bitte genau vier Monitor-Eckpunkte setzen.');
      return;
    }
    setRectifying(true); setErrorMessage(''); setStatusMessage('Bild wird entzerrt...');
    try {
      const preview = await rectifyScorecard(uploadedFile, manualCorners);
      setRectifiedPreview(preview);
      setSelectedHLines(preview.horizontal_candidates); setSelectedVLines(preview.vertical_candidates); setFocusedLine(null);
      setTableBuildResult(null); setExtractionResult(null);
      setStep(2); setTableSubView('morph-horizontal'); setStatusMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Verarbeitung fehlgeschlagen.');
      setStatusMessage('');
    } finally {
      setRectifying(false);
    }
  }

  // --- Line selection handlers ---

  function handleMorphClick(event: React.MouseEvent<HTMLDivElement>) {
    if (movingLine) return;
    const point = getNormalizedPoint(event, morphImageRef.current);
    if (!point) return;

    const orientation = tableSubView === 'morph-horizontal' ? 'h' : 'v';
    const selected = orientation === 'h' ? selectedHLines : selectedVLines;

    let nearestSelectedIdx = -1;
    let nearestSelectedDist = Infinity;
    selected.forEach((seg, i) => {
      const d = distanceToSegment(seg, point.x, point.y);
      if (d < nearestSelectedDist) { nearestSelectedDist = d; nearestSelectedIdx = i; }
    });
    if (nearestSelectedIdx >= 0 && nearestSelectedDist < LINE_SELECT_THRESHOLD) {
      setFocusedLine({ orientation, index: nearestSelectedIdx });
      setFocusPosition({ x: point.x, y: point.y });
      return;
    }

    const morphData = orientation === 'h' ? hMorphDataRef.current : vMorphDataRef.current;
    if (!morphData) { setFocusedLine(null); return; }

    const newLine = orientation === 'h'
      ? scanHorizontalLine(morphData, point.x, point.y)
      : scanVerticalLine(morphData, point.x, point.y);

    if (newLine) {
      const tooClose = selected.some((s) => {
        if (orientation === 'h') return Math.abs((s.y1 + s.y2) / 2 - (newLine.y1 + newLine.y2) / 2) < 0.015;
        return Math.abs((s.x1 + s.x2) / 2 - (newLine.x1 + newLine.x2) / 2) < 0.015;
      });
      if (!tooClose) {
        if (orientation === 'h') setSelectedHLines((prev) => [...prev, newLine]);
        else setSelectedVLines((prev) => [...prev, newLine]);
        setFocusedLine(null);
        setTableBuildResult(null);
      }
    } else {
      setFocusedLine(null);
    }
  }

  function handleDeleteFocusedLine() {
    if (!focusedLine) return;
    if (focusedLine.orientation === 'h') {
      setSelectedHLines((prev) => prev.filter((_, i) => i !== focusedLine.index));
    } else {
      setSelectedVLines((prev) => prev.filter((_, i) => i !== focusedLine.index));
    }
    setFocusedLine(null);
    setTableBuildResult(null);
  }

  function startMoveFocusedLine() {
    if (!focusedLine) return;
    setMovingLine(true);
  }

  function handleMorphPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!focusedLine) return;
    const point = getNormalizedPoint(event, morphImageRef.current);
    if (!point) return;

    if (draggingEndpoint) {
      if (focusedLine.orientation === 'h') {
        setSelectedHLines((prev) => prev.map((line, i) => {
          if (i !== focusedLine.index) return line;
          return draggingEndpoint === 'start' ? { ...line, y1: point.y } : { ...line, y2: point.y };
        }));
      } else {
        setSelectedVLines((prev) => prev.map((line, i) => {
          if (i !== focusedLine.index) return line;
          return draggingEndpoint === 'start' ? { ...line, x1: point.x } : { ...line, x2: point.x };
        }));
      }
      return;
    }

    if (!movingLine) return;

    if (focusedLine.orientation === 'h') {
      setSelectedHLines((prev) => prev.map((line, i) => {
        if (i !== focusedLine.index) return line;
        const midY = (line.y1 + line.y2) / 2;
        const dy = point.y - midY;
        return { ...line, y1: line.y1 + dy, y2: line.y2 + dy };
      }));
    } else {
      setSelectedVLines((prev) => prev.map((line, i) => {
        if (i !== focusedLine.index) return line;
        const midX = (line.x1 + line.x2) / 2;
        const dx = point.x - midX;
        return { ...line, x1: line.x1 + dx, x2: line.x2 + dx };
      }));
    }
  }

  function handleMorphPointerUp() {
    if (movingLine) {
      setMovingLine(false);
      setTableBuildResult(null);
    }
    if (draggingEndpoint) {
      setDraggingEndpoint(null);
      setTableBuildResult(null);
    }
  }

  // --- Table build ---

  async function handleConfirmTable() {
    if (!uploadedFile || manualCorners.length !== 4) return;
    setBuildingTable(true); setErrorMessage('');
    try {
      const result = await buildTable(uploadedFile, manualCorners, selectedHLines, selectedVLines);
      setTableBuildResult(result);
      if (result.rectified_bw_data_url) setTableSubView('bw');
      if (result.warnings.length) setErrorMessage(result.warnings.join('\n'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Tabellenerstellung fehlgeschlagen.');
    } finally {
      setBuildingTable(false);
    }
  }

  // --- Navigation ---

  function goToStep(targetStep: number) {
    if (targetStep < 1 || targetStep > 2) return;
    if (targetStep >= 2 && !rectifiedPreview) return;
    setStep(targetStep);
    setErrorMessage(''); setStatusMessage('');
  }

  // --- Extract & save ---

  async function handleExtract() {
    if (!uploadedFile || manualCorners.length !== 4) return;
    setExtracting(true); setErrorMessage('');
    try {
      const [result, recentNames] = await Promise.all([
        extractScorecard(uploadedFile, manualCorners, selectedHLines, selectedVLines, bwThreshold),
        fetchRecentPlayerNames(2).catch(() => []),
      ]);
      setExtractionResult({
        ...result,
        players: result.players.map((player, idx) => {
          const detectedName = normalizePlayerName(player.name);
          const name = !detectedName || isPlaceholderPlayerName(detectedName)
            ? (recentNames[idx] ?? '')
            : detectedName;
          return { ...player, name };
        }),
      });
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
      return { ...prev, players: prev.players.filter((_, idx) => idx !== playerIdx) };
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
    setSaving(true); setErrorMessage('');
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
      setSavedGame(game); setShowSaveForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  const scoreErrors = extractionResult ? validateBowlingScores(extractionResult.players) : new Set<string>();

  const morphSrc = tableSubView === 'morph-horizontal'
    ? rectifiedPreview?.morph_horizontal_data_url
    : tableSubView === 'morph-vertical'
      ? rectifiedPreview?.morph_vertical_data_url
      : null;

  const currentOrientation = tableSubView === 'morph-horizontal' ? 'h' : tableSubView === 'morph-vertical' ? 'v' : null;
  const currentSelected = currentOrientation === 'h' ? selectedHLines : currentOrientation === 'v' ? selectedVLines : [];

  const currentWarnings = step === 1
    ? cornerWarnings
    : [...(rectifiedPreview?.warnings ?? []), ...(tableBuildResult?.warnings ?? []), ...(extractionResult?.warnings ?? [])];

  return (
    <>
      <nav className="flex items-center gap-1.5 rounded-[2rem] bg-[rgba(41,24,9,0.92)] p-2.5 text-white sm:gap-2 sm:p-3">
        {PIPELINE_STEPS.map(({ title }, index) => {
          const number = index + 1;
          const isActive = step === number;
          const isReachable = number === 1 || (number === 2 && !!rectifiedPreview);
          return (
            <button key={number} type="button"
              className={`flex-1 rounded-2xl px-2 py-2.5 text-center text-xs font-medium transition sm:px-3 sm:text-sm ${isActive ? 'bg-white/20 text-white' : isReachable ? 'text-lane-200 hover:bg-white/10' : 'cursor-not-allowed text-lane-500'}`}
              onClick={() => isReachable && goToStep(number)} disabled={!isReachable}
            >{number}. {title}</button>
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
          {step === 2 && !tableConfirmed && (
            <span className="rounded-full bg-lane-100 px-3 py-1 text-sm font-medium text-lane-700">
              H: {selectedHLines.length} / V: {selectedVLines.length}
            </span>
          )}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-[1.3rem] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-semibold">Fehler</p><p className="mt-1 whitespace-pre-wrap">{errorMessage}</p></div>
              <button className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-white" type="button" onClick={() => setErrorMessage('')}>Schließen</button>
            </div>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mb-4 rounded-[1.3rem] border border-lane-200 bg-lane-50 px-4 py-3 text-sm text-lane-700">{statusMessage}</div>
        ) : null}

        {currentWarnings.length > 0 ? (
          <ul className="mb-4 grid gap-2">
            {currentWarnings.map((warning) => (
              <li key={warning} className="rounded-[1.2rem] border border-lane-200 bg-lane-50 px-4 py-3 text-sm text-lane-800">{warning}</li>
            ))}
          </ul>
        ) : null}

        {/* Step 1: Corner selection */}
        {step === 1 && !previewUrl ? (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-lane-300 bg-white/50 px-4 py-14 text-center transition hover:border-lane-500 hover:bg-white/70">
            <span className="text-lg font-medium text-lane-800">Bild auswählen</span>
            <span className="mt-2 text-sm text-lane-600">PNG oder JPG direkt vom Bowling-Monitor</span>
            <input className="hidden" type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} />
          </label>
        ) : null}

        {step === 1 && previewUrl ? (
          <div className="rounded-[1.5rem] bg-[rgba(255,255,255,0.74)] p-4">
            <div className="relative mt-4 overflow-hidden rounded-[1.2rem] border border-lane-200 bg-white"
              onClick={handleCornerPreviewClick} onMouseMove={handleCornerMouseMove} onPointerMove={handlePointerMove}
              onMouseUp={stopCornerDrag} onMouseLeave={() => { setMagnifierPos(null); stopCornerDrag(); }}
              onTouchStart={handleCornerTouchStart} onTouchMove={handleCornerTouchMove}
              onTouchEnd={(e) => { e.preventDefault(); stopCornerDrag(); }}
              onPointerUp={stopCornerDrag} onContextMenu={(e) => e.preventDefault()}
              role="button" tabIndex={0} style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
            >
              <img ref={cornerImageRef} alt="Bowling-Monitor Farbvorschau" className="block max-h-[40rem] w-full object-contain" src={previewUrl} />
              {manualCorners.length >= 2 ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {manualCorners.length === 4
                    ? <polygon fill="rgba(31,111,235,0.10)" points={polygonPoints(manualCorners)} stroke="rgba(31,111,235,0.90)" strokeWidth="0.6" />
                    : <polyline fill="none" points={polygonPoints(manualCorners)} stroke="rgba(31,111,235,0.90)" strokeWidth="0.6" />}
                </svg>
              ) : null}
              {manualCorners.map((corner, index) => (
                <button key={`${corner.x}-${corner.y}-${index}`}
                  className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold shadow-lg ${activeCornerIndex === index ? 'bg-lane-800 text-white' : 'bg-blue-600 text-white'}`}
                  style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }} type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingCornerIndex(index); setActiveCornerIndex(index); }}
                  onPointerDown={(e) => handleButtonPointerDown(e, index)} onPointerUp={(e) => handleButtonPointerUp(e)}
                  onClick={(e) => { e.stopPropagation(); setActiveCornerIndex(index); }} onContextMenu={(e) => e.preventDefault()}
                >{index + 1}</button>
              ))}
              {magnifierPos && (
                <div className="pointer-events-none absolute z-20 overflow-hidden rounded-2xl border-2 border-white/80 shadow-xl ring-1 ring-black/10"
                  style={{ left: magnifierPos.px + (magnifierPos.px > MAGNIFIER_SIZE + 24 ? -(MAGNIFIER_SIZE + 16) : 16), top: magnifierPos.py + (magnifierPos.py > MAGNIFIER_SIZE + 24 ? -(MAGNIFIER_SIZE + 16) : 16), width: MAGNIFIER_SIZE, height: MAGNIFIER_SIZE }}>
                  <canvas ref={magnifierCanvasRef} width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} className="block bg-black" />
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={handleConfirmCorners} disabled={manualCorners.length !== 4 || rectifying}>
                {rectifying ? 'Verarbeite...' : 'Ecken bestätigen →'}
              </button>
              <button className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" type="button"
                onClick={() => { setManualCorners([]); setActiveCornerIndex(null); setDraggingCornerIndex(null); }}>Zurücksetzen</button>
              <button className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60" type="button"
                onClick={() => { setManualCorners((c) => c.slice(0, -1)); setActiveCornerIndex(null); setDraggingCornerIndex(null); }} disabled={!manualCorners.length}>Letzten Punkt entfernen</button>
              <label className="rounded-full border border-lane-300 bg-white/80 px-4 py-2 text-sm font-medium text-lane-700 cursor-pointer transition hover:bg-white">
                Neues Bild<input className="hidden" type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} />
              </label>
            </div>
          </div>
        ) : null}

        {/* Step 2: Line selection + BW/OCR */}
        {step === 2 && rectifiedPreview ? (
          <div className="grid gap-4">
            {/* Sub-view tabs */}
            <div className="flex items-center gap-2 self-start flex-wrap">
              <div className="flex items-center gap-1 rounded-full border border-lane-200 bg-white/90 p-1">
                {(['morph-horizontal', 'morph-vertical'] as const).map((key) => (
                  <button key={key} type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${tableSubView === key ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                    onClick={() => { setTableSubView(key); setFocusedLine(null); setMovingLine(false); setDraggingEndpoint(null); }}>
                    {key === 'morph-horizontal' ? `H (${selectedHLines.length}/10)` : `V (${selectedVLines.length}/12)`}
                  </button>
                ))}
                {tableConfirmed && (
                  <button type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${tableSubView === 'bw' ? 'bg-lane-800 text-white' : 'text-lane-700 hover:bg-lane-50'}`}
                    onClick={() => setTableSubView('bw')}>S/W</button>
                )}
              </div>
            </div>

            {/* Morph views */}
            {(tableSubView === 'morph-horizontal' || tableSubView === 'morph-vertical') && morphSrc ? (
              <>
                <div className="flex items-center gap-3 rounded-[1.3rem] border border-lane-200 bg-white/90 px-4 py-2.5 text-xs font-medium text-lane-600">
                  {movingLine
                    ? 'Linie verschieben: Ziehen und loslassen'
                    : 'Auf eine Morph-Linie klicken um sie auszuwählen'}
                </div>

                <div className={`relative overflow-hidden rounded-[1.3rem] border border-lane-200 bg-white ${movingLine || draggingEndpoint ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                  onClick={handleMorphClick}
                  onPointerMove={handleMorphPointerMove}
                  onPointerUp={handleMorphPointerUp}
                  style={{ touchAction: 'none' }}
                >
                  <img ref={morphImageRef} alt="Morph-Ansicht" className="block max-h-[42rem] w-full object-contain" src={morphSrc} />
                  {rectifiedPreview?.bw_image_data_url && (
                    <img alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-20 mix-blend-lighten" src={rectifiedPreview.bw_image_data_url} />
                  )}
                  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1 1">
                    {(() => {
                      const enough = currentOrientation === 'h' ? selectedHLines.length >= 10 : selectedVLines.length >= 12;
                      return currentSelected.map((seg, i) => {
                        const isFocused = focusedLine?.orientation === currentOrientation && focusedLine?.index === i;
                        const normalColor = enough ? 'rgba(0,220,80,0.85)' : 'rgba(220,50,50,0.85)';
                        return (
                          <g key={`s-${i}`}>
                            <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke="transparent" strokeWidth="0.02" style={{ cursor: 'pointer' }} />
                            <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                              stroke={isFocused ? 'rgba(255,200,0,0.95)' : normalColor}
                              strokeWidth={isFocused ? '0.006' : '0.004'} />
                          </g>
                        );
                      });
                    })()}
                  </svg>
                  {focusedLine && focusedLine.orientation === currentOrientation && currentSelected[focusedLine.index] && (() => {
                    const seg = currentSelected[focusedLine.index];
                    return (
                      <>
                        <button
                          className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-yellow-400 shadow-lg cursor-grab active:cursor-grabbing"
                          style={{ left: `${seg.x1 * 100}%`, top: `${seg.y1 * 100}%`, touchAction: 'none' }}
                          type="button"
                          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingEndpoint('start'); }}
                        />
                        <button
                          className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-yellow-400 shadow-lg cursor-grab active:cursor-grabbing"
                          style={{ left: `${seg.x2 * 100}%`, top: `${seg.y2 * 100}%`, touchAction: 'none' }}
                          type="button"
                          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingEndpoint('end'); }}
                        />
                      </>
                    );
                  })()}
                  {focusedLine && focusPosition && focusedLine.orientation === currentOrientation && (
                    <div className="absolute z-20 flex items-center gap-1 rounded-full border border-lane-300 bg-lane-200 px-1.5 py-1 shadow-lg"
                      style={{
                        left: `${Math.max(10, Math.min(90, focusPosition.x * 100))}%`,
                        top: `${focusPosition.y * 100}%`,
                        transform: focusPosition.y > 0.5 ? 'translate(-50%, calc(-100% - 14px))' : 'translate(-50%, 14px)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="rounded-full px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100" type="button" onClick={handleDeleteFocusedLine}>Löschen</button>
                      <button className="rounded-full px-2.5 py-1 text-xs font-medium text-lane-600 transition hover:bg-lane-100" type="button"
                        onClick={() => { setFocusedLine(null); setMovingLine(false); setDraggingEndpoint(null); setFocusPosition(null); }}>&#x2715;</button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" type="button" onClick={() => goToStep(1)}>← Zurück zu Monitor</button>
                  <button className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button" onClick={handleConfirmTable}
                    disabled={selectedHLines.length < 2 || selectedVLines.length < 2 || buildingTable}>
                    {buildingTable ? 'Baue Tabelle...' : 'Tabelle bestätigen →'}
                  </button>
                  {tableConfirmed && (
                    <button className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" type="button" onClick={() => setTableSubView('bw')}>Zur S/W-Ansicht →</button>
                  )}
                </div>
              </>
            ) : null}

            {/* BW view */}
            {tableSubView === 'bw' && tableConfirmed ? (
              <>
                <div className="flex items-center gap-3 rounded-[1.3rem] border border-lane-200 bg-white/90 px-4 py-2.5">
                  <label className="text-xs font-medium text-lane-700 whitespace-nowrap" htmlFor="bw-threshold">S/W Schwelle</label>
                  <input id="bw-threshold" type="range" min={10} max={240} step={1} value={bwThreshold} onChange={(e) => setBwThreshold(Number(e.target.value))} className="flex-1" />
                  <span className="min-w-[2.5rem] text-right text-xs font-mono text-lane-600">{bwThreshold}</span>
                </div>

                <div className="relative overflow-hidden rounded-[1.3rem] border border-lane-200 bg-white">
                  <canvas ref={bwCanvasRef} className={`max-h-[42rem] w-full object-contain ${bwCanvasReady ? 'block' : 'hidden'}`} />
                  {!bwCanvasReady && tableBuildResult.rectified_bw_data_url ? (
                    <img alt="S/W Vorschau" className="block max-h-[42rem] w-full object-contain" src={tableBuildResult.rectified_bw_data_url} />
                  ) : null}
                  {/* Subcell grid overlay */}
                  {tableBuildResult.sub_cells.length > 0 ? (
                    <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1 1">
                      {tableBuildResult.sub_cells.map((cell, i) => {
                        const isHeader = cell.row === 0;
                        const isName = cell.col === 0 && !isHeader;
                        const fill = isHeader ? 'rgba(59,130,246,0.12)' : isName ? 'rgba(245,158,11,0.12)' : 'none';
                        const stroke = isHeader ? 'rgba(59,130,246,0.6)' : isName ? 'rgba(245,158,11,0.6)' : 'rgba(0,180,0,0.5)';
                        return (
                          <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
                            fill={fill} stroke={stroke} strokeWidth="0.002" />
                        );
                      })}
                    </svg>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70" type="button"
                    onClick={() => { setTableSubView('morph-horizontal'); }}>← Linien anpassen</button>
                  <button className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button" onClick={handleExtract} disabled={extracting}>
                    {extracting ? 'Extrahiere...' : 'Text extrahieren'}
                  </button>
                </div>

                {/* Extraction results table */}
                {extractionResult ? (
                  <div className="mt-4 overflow-x-auto rounded-[1.3rem] border border-lane-200 bg-lane-50/80 p-4 -mx-1 sm:mx-0">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-lane-800">Textextraktion prüfen</h3>
                        <p className="mt-0.5 text-xs text-lane-600">Die Quellenbilder stehen direkt über den passenden Frame-Spalten.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-lane-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-lane-700 transition hover:bg-white">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-lane-800"
                          checked={showRowCrops}
                          onChange={(e) => setShowRowCrops(e.target.checked)}
                        />
                        Zeilenbilder anzeigen
                      </label>
                    </div>
                    <table className="min-w-[700px] w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-left font-semibold text-lane-800">Name</th>
                          {Array.from({ length: 10 }, (_, i) => (
                            <th key={i} className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">{i + 1}</th>
                          ))}
                          <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">Aktion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractionResult.players.map((player, pIdx) => (
                          <Fragment key={`player-row-${pIdx}`}>
                            {showRowCrops ? (
                              <tr key={`${pIdx}-crop`}>
                                <td className="border border-lane-200 bg-white px-2 py-2 align-middle">
                                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-lane-400">Quelle</span>
                                </td>
                                {Array.from({ length: 10 }, (_, fIdx) => {
                                  const frameCrop = player.frame_crop_data_urls?.[fIdx];
                                  return (
                                    <td key={fIdx} className="border border-lane-200 bg-white px-1 py-2 align-middle">
                                      {frameCrop ? (
                                        <a href={frameCrop} target="_blank" rel="noreferrer" title={`Frame ${fIdx + 1} groß öffnen`} className="block overflow-hidden rounded border border-lane-200 bg-white transition hover:border-lane-400">
                                          <img src={frameCrop} alt={`Quellenbild für Spielerzeile ${pIdx + 1}, Frame ${fIdx + 1}`} className="mx-auto max-h-16 w-full object-contain [image-rendering:pixelated]" />
                                        </a>
                                      ) : (
                                        <div className="min-h-10 rounded border border-dashed border-lane-200 bg-lane-50" />
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="border border-lane-200 bg-white px-2 py-2" />
                              </tr>
                            ) : null}
                            <tr key={`${pIdx}-throws`}>
                              <td rowSpan={2} className="border border-lane-200 bg-lane-50 px-2 py-1.5 align-middle">
                                <input
                                  className={`w-full border-0 px-1 py-0.5 text-xs font-medium text-lane-900 outline-none focus:ring-1 focus:ring-lane-800 ${player.name.trim() ? 'bg-lane-50' : 'bg-red-100/80 text-red-700'}`}
                                  value={player.name}
                                  onChange={(e) => updatePlayerName(pIdx, e.target.value)}
                                />
                              </td>
                              {player.frames.map((frame, fIdx) => {
                                const hasThrowError = scoreErrors.has(`${pIdx}-${fIdx}-throw1`) || scoreErrors.has(`${pIdx}-${fIdx}-throw2`) || (fIdx === 9 && scoreErrors.has(`${pIdx}-${fIdx}-throw3`));
                                return (
                                  <td
                                    key={fIdx}
                                    className={`border border-lane-200 px-2 py-1.5 text-center font-medium text-lane-800 ${hasThrowError ? 'bg-red-100/80' : 'bg-lane-50'}`}
                                  >
                                    <input
                                      className={`w-full border-0 bg-transparent text-center text-xs font-mono outline-none focus:ring-1 focus:ring-lane-800 ${hasThrowError ? 'text-red-700' : ''}`}
                                      value={formatCompactFrameInput(frame, fIdx === 9)}
                                      onChange={(e) => {
                                        const parsed = parseCompactFrameInput(e.target.value, fIdx === 9);
                                        updateFrame(pIdx, fIdx, 'throw1', parsed.throw1);
                                        updateFrame(pIdx, fIdx, 'throw2', parsed.throw2);
                                        if (fIdx === 9) updateFrame(pIdx, fIdx, 'throw3', parsed.throw3);
                                      }}
                                    />
                                  </td>
                                );
                              })}
                              <td rowSpan={2} className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center align-middle">
                                <button
                                  className="rounded px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                                  type="button"
                                  onClick={() => removePlayerRow(pIdx)}
                                >
                                  Löschen
                                </button>
                              </td>
                            </tr>
                            <tr key={`${pIdx}-cumulative`}>
                              {player.frames.map((frame, fIdx) => {
                                const hasResultError = scoreErrors.has(`${pIdx}-${fIdx}-cumulative`);
                                return (
                                  <td
                                    key={fIdx}
                                    className={`border border-lane-200 px-2 py-1.5 text-center font-medium text-lane-800 ${hasResultError ? 'bg-red-100/80' : 'bg-lane-50'}`}
                                  >
                                    <input
                                      className={`w-full border-0 bg-transparent text-center text-xs font-mono outline-none focus:ring-1 focus:ring-lane-800 ${hasResultError ? 'text-red-700' : ''}`}
                                      value={frame.cumulative}
                                      onChange={(e) => updateFrame(pIdx, fIdx, 'cumulative', e.target.value)}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {savedGame ? (
                  <div className="rounded-[1.3rem] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <p className="font-semibold">Spiel erfolgreich gespeichert!</p>
                    <p className="mt-1 text-xs opacity-80">{saveLocation} • {saveDate}</p>
                  </div>
                ) : null}

                {!savedGame && extractionResult ? (
                  <div className="grid gap-3">
                    {!showSaveForm ? (
                      <button
                        className="rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => setShowSaveForm(true)}
                        disabled={extractionResult.players.length === 0 || extractionResult.players.some((player) => !player.name.trim()) || scoreErrors.size > 0}
                      >
                        Spiel speichern
                      </button>
                    ) : (
                      <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div className="grid gap-1">
                            <label htmlFor="save-date" className="text-xs font-medium text-lane-700">
                              Datum
                            </label>
                            <input
                              id="save-date"
                              type="date"
                              value={saveDate}
                              onChange={(e) => setSaveDate(e.target.value)}
                              className="rounded-lg border border-lane-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-lane-800"
                            />
                          </div>
                          <div className="col-span-2 grid gap-1 sm:col-span-1">
                            <label htmlFor="save-location" className="text-xs font-medium text-lane-700">
                              Ort
                            </label>
                            <input
                              id="save-location"
                              type="text"
                              value={saveLocation}
                              onChange={(e) => setSaveLocation(e.target.value)}
                              className="rounded-lg border border-lane-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-lane-800"
                              placeholder="z.B. Squash House"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <button
                            className="flex-1 rounded-full bg-lane-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-lane-700 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            onClick={handleSaveGame}
                            disabled={saving}
                          >
                            {saving ? 'Speichere...' : 'Speichern'}
                          </button>
                          <button
                            className="flex-1 rounded-full border border-lane-300 px-4 py-2 text-sm font-medium text-lane-700 transition hover:bg-white/70"
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
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
