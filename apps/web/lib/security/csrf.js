import { getRequestOrigin } from '@/lib/security/request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated API routes.
 *
 * Layers:
 *  1. Session cookie is SameSite=Lax, so cross-site POSTs never carry it.
 *  2. Mutating requests must carry `X-Requested-With: webmail` — a custom
 *     header that cannot be set by cross-origin HTML forms.
 *  3. If Origin / Sec-Fetch-Site headers are present they must match.
 *
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyCsrf(request) {
  if (SAFE_METHODS.has(request.method)) return { ok: true };

  const requestedWith = request.headers.get('x-requested-with');
  if (requestedWith !== 'webmail') {
    return { ok: false, reason: 'missing custom header' };
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return { ok: false, reason: `sec-fetch-site=${fetchSite}` };
  }

  const origin = request.headers.get('origin');
  if (origin) {
    const expected = getRequestOrigin(request);
    if (origin !== expected) {
      return { ok: false, reason: 'origin mismatch' };
    }
  }

  return { ok: true };
}
