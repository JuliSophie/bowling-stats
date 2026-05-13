import type { CornerGuessResult, ExtractionResult, GameCreate, GameRead, ManualCorner, PlayerRenameRequest, PlayerRenameResponse, RectifiedPreview, StatsResponse } from '@/types';


const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://bowling-api.sophiealexandra.de/api';


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


async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, init);
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


export async function guessScorecardCorners(file: File): Promise<CornerGuessResult> {
  const formData = new FormData();
  formData.append('file', file);

  return requestJson<CornerGuessResult>(`${API_BASE}/upload/corners`, {
    method: 'POST',
    body: formData,
  });
}


export async function rectifyScorecard(file: File, corners: ManualCorner[], bwThreshold?: number): Promise<RectifiedPreview> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);
  if (bwThreshold !== undefined) {
    formData.append('bw_threshold', String(bwThreshold));
  }

  return requestJson<RectifiedPreview>(`${API_BASE}/upload/rectify`, {
    method: 'POST',
    body: formData,
  });
}


export async function extractScorecard(file: File, corners: ManualCorner[], bwThreshold?: number): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);
  if (bwThreshold !== undefined) {
    formData.append('bw_threshold', String(bwThreshold));
  }

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


export async function fetchStats(): Promise<StatsResponse> {
  return requestJson<StatsResponse>(`${API_BASE}/stats`);
}
