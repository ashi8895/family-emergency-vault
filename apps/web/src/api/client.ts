/**
 * Tiny fetch wrapper. The access token lives only in memory (never localStorage), so an XSS
 * payload cannot read it from storage. The refresh token is an httpOnly cookie the JS cannot see.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) return false;
  accessToken = (await res.json()).accessToken;
  return true;
}

async function send(path: string, init: RequestInit & { json?: unknown }, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`/api${path}`, { ...init, headers, body, credentials: 'same-origin' });

  const isAuthRoute = path.startsWith('/auth/');
  if (res.status === 401 && retry && !isAuthRoute) {
    if (await refresh()) return send(path, init, false);
    onSessionLost?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // No message from our API usually means the request never reached it (server stopped or restarting; the dev
    // proxy then answers with an empty 500/502/504). Say so, and include the code so it can be diagnosed.
    const fallback =
      res.status >= 500
        ? `The server did not answer properly (code ${res.status}). Check that the server window is still running.`
        : `Request failed (code ${res.status})`;
    throw new ApiError(res.status, data.error ?? fallback);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => send(path, { method: 'GET' }).then((r) => parse<T>(r)),
  post: <T>(path: string, json?: unknown) => send(path, { method: 'POST', json }).then((r) => parse<T>(r)),
  put: <T>(path: string, json: unknown) => send(path, { method: 'PUT', json }).then((r) => parse<T>(r)),
  patch: <T>(path: string, json: unknown) => send(path, { method: 'PATCH', json }).then((r) => parse<T>(r)),
  delete: (path: string) => send(path, { method: 'DELETE' }).then((r) => parse<void>(r)),
  upload: <T>(path: string, form: FormData) => send(path, { method: 'POST', body: form }).then((r) => parse<T>(r)),
  raw: async (path: string) => {
    const res = await send(path, { method: 'GET' });
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res;
  },
};
