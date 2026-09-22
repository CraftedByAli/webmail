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

/** Reads the raw session token from a request's Cookie header. */
export function readSessionToken(request) {
  const { session } = getConfig();
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === session.cookieName) return rest.join('=');
  }
  return null;
}
