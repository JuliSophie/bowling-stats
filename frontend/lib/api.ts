import type { CornerGuessResult, ExtractionResult, GameCreate, GameRead, LineSegment, LiveEvent, ManualCorner, PlayerRenameRequest, PlayerRenameResponse, RecentPlayerNamesResponse, RectifiedPreview, StatsResponse, TableBuildResult, TrackingSession } from '@/types';


const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://bowling-api.sophiealexandra.de/api';

function resolveApiBase() {
  // Android install checks can fail when a HTTPS web app still references HTTP API origins.
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(RAW_API_BASE)) {
    // Prefer same-origin reverse proxy path in secure contexts to avoid mixed content.
    return '/api';
  }
  return RAW_API_BASE;
}

const API_BASE = resolveApiBase();


async function extractErrorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (typeof payload?.detail === 'string' && payload.detail.trim()) {
    return `HTTP ${response.status}: ${payload.detail}`;
  }

  if (Array.isArray(payload?.detail) && payload.detail.length) {
    const joinedDetails = payload.detail
      .map((item: unknown) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }

        return JSON.stringify(item);
      })
      .join(', ');

    if (joinedDetails) {
      return `HTTP ${response.status}: ${joinedDetails}`;
    }
  }

  const rawText = await response.text().catch(() => '');
  if (rawText.trim()) {
    return `HTTP ${response.status}: ${rawText.trim()}`;
  }

  return `HTTP ${response.status}: ${response.statusText || 'Die Anfrage ist fehlgeschlagen.'}`;
}


async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    console.error('API HTTP error', {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      message,
    });
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}


function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.location.pathname.startsWith('/login')) {
    return;
  }
  const from = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?from=${from}`;
}


async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    // `credentials: 'include'` sends the same-site auth cookie to the API.
    const response = await fetch(url, { credentials: 'include', ...init });
    if (response.status === 401) {
      redirectToLogin();
    }
    return await handleResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      console.error('API network error', {
        url,
        method: init?.method ?? 'GET',
        message: error.message,
      });
    }
    throw error;
  }
}


function appendJsonField(formData: FormData, key: string, value: unknown) {
  formData.append(key, JSON.stringify(value));
}


export interface SessionStatus {
  authenticated: boolean;
  required: boolean;
}

export async function login(password: string): Promise<{ authenticated: boolean }> {
  return requestJson<{ authenticated: boolean }>(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await requestJson<{ authenticated: boolean }>(`${API_BASE}/auth/logout`, { method: 'POST' });
}

export async function fetchSession(): Promise<SessionStatus> {
  return requestJson<SessionStatus>(`${API_BASE}/auth/session`);
}


export async function guessScorecardCorners(file: File): Promise<CornerGuessResult> {
  const formData = new FormData();
  formData.append('file', file);

  return requestJson<CornerGuessResult>(`${API_BASE}/upload/corners`, {
    method: 'POST',
    body: formData,
  });
}


export async function rectifyScorecard(
  file: File,
  corners: ManualCorner[],
): Promise<RectifiedPreview> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);

  return requestJson<RectifiedPreview>(`${API_BASE}/upload/rectify`, {
    method: 'POST',
    body: formData,
  });
}


export async function buildTable(
  file: File,
  corners: ManualCorner[],
  selectedHLines: LineSegment[],
  selectedVLines: LineSegment[],
): Promise<TableBuildResult> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);
  appendJsonField(formData, 'selected_h_lines', selectedHLines);
  appendJsonField(formData, 'selected_v_lines', selectedVLines);

  return requestJson<TableBuildResult>(`${API_BASE}/upload/build-table`, {
    method: 'POST',
    body: formData,
  });
}


export async function extractScorecard(
  file: File,
  corners: ManualCorner[],
  selectedHLines: LineSegment[],
  selectedVLines: LineSegment[],
  bwThreshold: number,
): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);
  appendJsonField(formData, 'selected_h_lines', selectedHLines);
  appendJsonField(formData, 'selected_v_lines', selectedVLines);
  formData.append('bw_threshold', String(bwThreshold));

  return requestJson<ExtractionResult>(`${API_BASE}/upload/extract`, {
    method: 'POST',
    body: formData,
  });
}


export async function createGame(payload: GameCreate): Promise<GameRead> {
  return requestJson<GameRead>(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}


export async function renamePlayer(payload: PlayerRenameRequest): Promise<PlayerRenameResponse> {
  return requestJson<PlayerRenameResponse>(`${API_BASE}/players/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}


export async function fetchGames(): Promise<GameRead[]> {
  return requestJson<GameRead[]>(`${API_BASE}/games`);
}


export async function fetchRecentPlayerNames(hours = 2): Promise<string[]> {
  const response = await requestJson<RecentPlayerNamesResponse>(`${API_BASE}/games/recent-player-names?hours=${encodeURIComponent(String(hours))}`);
  return response.names;
}


export async function fetchStats(): Promise<StatsResponse> {
  return requestJson<StatsResponse>(`${API_BASE}/stats`);
}


export async function createTrackingSession(playerNames: string[] = [], sessionId?: string): Promise<TrackingSession> {
  return requestJson<TrackingSession>(`${API_BASE}/tracking/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerNames, sessionId }),
  });
}


export async function fetchTrackingSession(sessionId: string): Promise<TrackingSession> {
  return requestJson<TrackingSession>(`${API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}`);
}


export async function setTrackingPlayers(sessionId: string, playerCount: number, playerNames: string[] = []): Promise<TrackingSession> {
  return requestJson<TrackingSession>(`${API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerCount, playerNames }),
  });
}


export type ThrowCorrectionAction = 'edit_last' | 'insert_before_last' | 'insert_at_end' | 'delete_last' | 'delete_at';

export async function correctTrackingThrow(
  sessionId: string,
  action: ThrowCorrectionAction,
  pinsKnockedDown?: number,
  throwIndex?: number,
): Promise<TrackingSession> {
  return requestJson<TrackingSession>(`${API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}/throws/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, pinsKnockedDown, throwIndex }),
  });
}


export async function resetTrackingSession(sessionId: string): Promise<TrackingSession> {
  return requestJson<TrackingSession>(`${API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}/reset`, {
    method: 'POST',
  });
}


export async function fetchTrackingEvents(sessionId: string): Promise<LiveEvent[]> {
  return requestJson<LiveEvent[]>(`${API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}/events`);
}


export function getTrackingWebSocketUrl(sessionId: string): string {
  const encodedSessionId = encodeURIComponent(sessionId);
  const base = API_BASE.replace(/\/$/, '');

  if (base.startsWith('http://') || base.startsWith('https://')) {
    const url = new URL(`${base}/tracking/sessions/${encodedSessionId}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${base}/tracking/sessions/${encodedSessionId}/ws`;
}


export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE.replace(/\/api$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
