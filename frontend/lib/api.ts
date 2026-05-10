import type { GameDraft, StatsResponse, UploadResult } from '@/types';


const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';


async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail ?? 'Die Anfrage ist fehlgeschlagen.');
  }

  return response.json() as Promise<T>;
}


export async function fetchStats(): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE}/stats`, { cache: 'no-store' });
  return handleResponse<StatsResponse>(response);
}


export async function uploadScorecard(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<UploadResult>(response);
}


export async function saveGame(payload: GameDraft): Promise<void> {
  const response = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}
