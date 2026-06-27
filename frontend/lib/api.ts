import { LutEntry } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers as Record<string, string> };

  if (init.method && ['POST', 'PUT'].includes(init.method) && init.body && !headers['Content-Type']) {
    if (!(init.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
}

export async function fetchLuts(): Promise<LutEntry[]> {
  const res = await apiFetch('/api/luts');
  if (!res.ok) throw new Error('Failed to fetch LUTs');
  const data = await res.json();
  return data.luts || [];
}
