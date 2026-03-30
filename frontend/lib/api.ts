import { Capabilities, LutEntry } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers as Record<string, string> };

  // Only set Content-Type for POST/PUT with body, not for DELETE or GET
  if (init.method && ['POST', 'PUT'].includes(init.method) && init.body && !headers['Content-Type']) {
    // Don't set Content-Type if body is FormData (browser will set boundary)
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

let _capabilitiesCache: Capabilities | null = null;

export async function fetchCapabilities(): Promise<Capabilities> {
  if (_capabilitiesCache) return _capabilitiesCache;
  const res = await fetch(`${API_BASE}/api/capabilities`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch capabilities');
  _capabilitiesCache = await res.json();
  return _capabilitiesCache!;
}

export async function fetchLuts(): Promise<LutEntry[]> {
  const res = await apiFetch('/api/luts');
  if (!res.ok) throw new Error('Failed to fetch LUTs');
  const data = await res.json();
  return data.luts || [];
}

