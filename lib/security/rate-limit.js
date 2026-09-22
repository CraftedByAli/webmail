/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for a single-instance deployment (the default for this webmail).
 * For horizontally scaled deployments, swap the store for Redis; the public
 * API is intentionally minimal to make that trivial.
 */

const globalKey = Symbol.for('webmail.ratelimit');
if (!globalThis[globalKey]) globalThis[globalKey] = new Map();
/** @type {Map<string, number[]>} */
const store = globalThis[globalKey];

let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, timestamps] of store) {
    const fresh = timestamps.filter((t) => now - t < 15 * 60_000);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}

/**
 * @param {string} key unique bucket key (e.g. `login:<ip>`)
 * @param {{ limit: number, windowMs: number }} options
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  sweep(now);
  const timestamps = (store.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    store.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }
  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, remaining: limit - timestamps.length, retryAfterSeconds: 0 };
}

/** Clears a bucket, e.g. after a successful login. */
export function resetRateLimit(key) {
  store.delete(key);
}

/** Test helper. */
export function clearAllRateLimits() {
  store.clear();
}

export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  loginPerAccount: { limit: 12, windowMs: 15 * 60_000 },
  api: { limit: 600, windowMs: 60_000 },
  send: { limit: 60, windowMs: 60 * 60_000 },
  upload: { limit: 120, windowMs: 60 * 60_000 },
};
