/**
 * Browser-side fetch wrapper for the app's own API.
 *  - always sends the CSRF header expected by the server
 *  - throws {@link ApiError} with the user-safe message from the server
 *  - redirects to /login on 401
 */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const GENERIC = 'Something went wrong. Please try again.';

/**
 * @param {string} path
 * @param {RequestInit & { json?: any, query?: Record<string, any> }} [options]
 */
export async function api(path, options = {}) {
  const { json, query, headers, ...rest } = options;
  let url = path;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const init = {
    credentials: 'same-origin',
    ...rest,
    headers: {
      'X-Requested-With': 'webmail',
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
  };
  if (json !== undefined) init.body = JSON.stringify(json);

  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(
      0,
      'network',
      'You appear to be offline. Check your connection and try again.'
    );
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const err = data?.error || {};
    if (
      response.status === 401 &&
      err.code === 'unauthorized' &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}&reason=expired`);
    }
    throw new ApiError(response.status, err.code || 'error', err.message || GENERIC, err.details);
  }
  return data;
}

export const apiGet = (path, query) => api(path, { method: 'GET', query });
export const apiPost = (path, json) => api(path, { method: 'POST', json });
export const apiPatch = (path, json) => api(path, { method: 'PATCH', json });
export const apiPut = (path, json) => api(path, { method: 'PUT', json });
export const apiDelete = (path, json) => api(path, { method: 'DELETE', json });
