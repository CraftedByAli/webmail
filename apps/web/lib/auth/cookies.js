import { getConfig } from '@/lib/config/env';

/**
 * Cookie attributes for the session cookie. HttpOnly + SameSite=Lax + Secure
 * (in production or whenever APP_URL is https).
 */
export function sessionCookieOptions() {
  const { session, app, isProd } = getConfig();
  const secure = isProd || app.url.startsWith('https://');
  return {
    name: session.cookieName,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: session.ttlHours * 3600,
  };
}

/** Serialises the session cookie for a Set-Cookie header. */
export function serializeSessionCookie(token) {
  const o = sessionCookieOptions();
  return [
    `${o.name}=${token}`,
    `Path=${o.path}`,
    `Max-Age=${o.maxAge}`,
    'HttpOnly',
    `SameSite=${o.sameSite === 'lax' ? 'Lax' : 'Strict'}`,
    o.secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

/** Serialises an expired cookie to clear the session. */
export function serializeClearedSessionCookie() {
  const o = sessionCookieOptions();
  return [
    `${o.name}=`,
    `Path=${o.path}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    o.secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

/** Reads one cookie value from a request's Cookie header. */
export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return null;
}

/** Reads the raw session token from a request's Cookie header. */
export function readSessionToken(request) {
  return readCookie(request, getConfig().session.cookieName);
}

/**
 * The mailbox a request acts on: the `X-Mailbox` header set by the app's API
 * client, or an `account` query parameter for plain URLs (attachments,
 * inline images, the realtime stream) that cannot carry headers.
 */
export function readRequestedAccount(request, url) {
  const value =
    request.headers.get('x-mailbox') || (url || new URL(request.url)).searchParams.get('account');
  return value ? value.trim().toLowerCase().slice(0, 320) : null;
}

/** The browser's last-used mailbox (a hint only; never authorises anything). */
export function readAccountHint(request) {
  return readCookie(request, getConfig().session.accountCookieName);
}

/** Serialises the last-used-mailbox hint cookie (readable by the page, not secret). */
export function serializeAccountCookie(email) {
  const o = sessionCookieOptions();
  return [
    `${getConfig().session.accountCookieName}=${encodeURIComponent(email)}`,
    'Path=/',
    `Max-Age=${365 * 24 * 3600}`,
    'SameSite=Lax',
    o.secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}
