const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export function makeShareFetch(jwt: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        ...init.headers,
      },
    });
}
