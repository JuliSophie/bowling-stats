import type { CornerGuessResult, ExtractionResult, ManualCorner, RectifiedPreview } from '@/types';


const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';


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
    throw new Error(await extractErrorMessage(response));
  }

  return response.json() as Promise<T>;
}


function appendJsonField(formData: FormData, key: string, value: unknown) {
  formData.append(key, JSON.stringify(value));
}


export async function guessScorecardCorners(file: File): Promise<CornerGuessResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload/corners`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<CornerGuessResult>(response);
}


export async function rectifyScorecard(file: File, corners: ManualCorner[]): Promise<RectifiedPreview> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);

  const response = await fetch(`${API_BASE}/upload/rectify`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<RectifiedPreview>(response);
}


export async function extractScorecard(file: File, corners: ManualCorner[], bwThreshold?: number): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('file', file);
  appendJsonField(formData, 'corners', corners);
  if (bwThreshold !== undefined) {
    formData.append('bw_threshold', String(bwThreshold));
  }

  const response = await fetch(`${API_BASE}/upload/extract`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<ExtractionResult>(response);
}
