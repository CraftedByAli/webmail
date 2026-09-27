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
 * The mailbox requests act on unless a caller names one. Components inside a
 * mailbox scope use {@link bindApi} (via `useApi()`) so their requests are
 * pinned to their own mailbox even while the user switches to another.
 */
let activeAccount = null;
let accountSignedOutHandler = null;

export function setActiveAccountForRequests(email) {
  activeAccount = email || null;
}

export function getActiveAccountForRequests() {
  return activeAccount;
}

/** Called when the server says a mailbox is no longer signed in on this device. */
export function onAccountSignedOut(handler) {
  accountSignedOutHandler = handler;
}

/**
 * @param {string} path
 * @param {RequestInit & { json?: any, query?: Record<string, any>, account?: string | null }} [options]
 *   `account`: mailbox to act on; `undefined` = the active mailbox, `null` = none.
 */
export async function api(path, options = {}) {
  const { json, query, headers, account, ...rest } = options;
  const mailbox = account === undefined ? activeAccount : account;
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
      ...(mailbox ? { 'X-Mailbox': mailbox } : {}),
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
    if (response.status === 401 && err.code === 'account_signed_out' && accountSignedOutHandler) {
      accountSignedOutHandler(err.details?.account || mailbox);
    } else if (
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

/**
 * API helpers pinned to one mailbox.
 * @param {string | null | undefined} account
 */
export function bindApi(account) {
  return {
    account,
    get: (path, query) => api(path, { method: 'GET', query, account }),
    post: (path, json) => api(path, { method: 'POST', json, account }),
    patch: (path, json) => api(path, { method: 'PATCH', json, account }),
    put: (path, json) => api(path, { method: 'PUT', json, account }),
    delete: (path, json) => api(path, { method: 'DELETE', json, account }),
  };
}

export const apiGet = (path, query) => api(path, { method: 'GET', query });
export const apiPost = (path, json) => api(path, { method: 'POST', json });
export const apiPatch = (path, json) => api(path, { method: 'PATCH', json });
export const apiPut = (path, json) => api(path, { method: 'PUT', json });
export const apiDelete = (path, json) => api(path, { method: 'DELETE', json });
