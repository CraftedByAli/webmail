import { getConfig } from '@/lib/config/env';

/**
 * Helpers for reading trustworthy request metadata behind a reverse proxy.
 */

/**
 * Client IP as seen by the outermost trusted reverse proxy.
 *
 * X-Forwarded-For is a list every proxy appends to, and its left end is
 * whatever the client chose to send. Reading the first entry would let anyone
 * pick their own IP and walk around login throttling, so the address is taken
 * `TRUST_PROXY_HOPS` entries from the right — the one our own proxy wrote.
 * CF-Connecting-IP is only believed when TRUST_CLOUDFLARE=true.
 *
 * @param {Request} request
 * @param {{ hops?: number, trustCloudflare?: boolean }} [options] defaults to the config
 */
export function getClientIp(request, options) {
  const { hops, trustCloudflare } = options || getConfig().proxy;
  if (trustCloudflare) {
    const cf = request.headers.get('cf-connecting-ip');
    if (cf) return cf.trim();
  }
  if (hops > 0) {
    const xff = (request.headers.get('x-forwarded-for') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (xff.length) return xff[Math.max(0, xff.length - hops)];
    // One proxy that sets X-Real-IP (from $remote_addr) but not X-Forwarded-For.
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
  }
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
