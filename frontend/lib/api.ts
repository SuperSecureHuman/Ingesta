import { Capabilities } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
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

