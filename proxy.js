import { NextResponse } from 'next/server';

/**
 * Edge proxy (Next.js 16 name for middleware):
 *  - generates a per-request CSP nonce and sets security headers
 *  - redirects unauthenticated visitors of app pages to /login (cookie
 *    presence only; real validation happens server-side in route handlers
 *    and layouts)
 *  - honours X-Forwarded-Proto for HTTPS redirects behind a reverse proxy
 */

const COOKIE = 'wm_session';
const PUBLIC_PATHS = ['/login'];

function buildCsp(nonce, isDev) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // https: is required so the user can opt in to remote images in email.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'self' blob:",
    "child-src 'self' blob:",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';

  // Force HTTPS in production when the proxy tells us the request was plain HTTP.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (!isDev && forwardedProto === 'http' && process.env.APP_URL?.startsWith('https://')) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const hasSession = !!request.cookies.get(COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // A stale cookie (session expired or revoked elsewhere) sends the layout to
  // /login?reason=expired. Drop the cookie there instead of bouncing back to
  // the inbox, which would loop forever.
  const staleSession =
    hasSession && pathname === '/login' && request.nextUrl.searchParams.has('reason');

  let response;
  if (staleSession) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  } else if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search =
      pathname !== '/' ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : '';
    response = NextResponse.redirect(url);
  } else if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/mail/inbox';
    url.search = '';
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  if (!isDev)
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
