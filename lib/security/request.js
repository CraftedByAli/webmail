/**
 * Helpers for reading trustworthy request metadata behind a reverse proxy.
 */

/**
 * Best-effort client IP. Honors X-Forwarded-For / X-Real-IP set by the
 * reverse proxy (Nginx, Caddy, Cloudflare). The app should only be reachable
 * through that proxy, so the first hop is trusted.
 * @param {Request} request
 */
export function getClientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Returns the origin the app is being served from, respecting
 * X-Forwarded-Proto and X-Forwarded-Host.
 * @param {Request} request
 */
export function getRequestOrigin(request) {
  const proto =
    request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host;
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}
