import crypto from 'node:crypto';
import { getConfig } from '@/lib/config/env';

/**
 * Cryptographic helpers for session tokens and at-rest protection of the
 * mailbox credential.
 *
 * Design: the browser only ever holds an opaque random session token. The
 * database only holds `sha256(token)` for lookup plus the mailbox password
 * encrypted with a key derived from BOTH the server secret and the token.
 * Neither the cookie alone nor the database alone can recover the password.
 */

const ALGO = 'aes-256-gcm';

/** Generates a cryptographically random URL-safe token. */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Random identifier for records. */
export function generateId() {
  return crypto.randomUUID();
}

/** One-way hash of a token for database lookup. */
export function hashToken(token) {
  return crypto.createHmac('sha256', getConfig().session.secret).update(token).digest('hex');
}

/**
 * Derives a per-session encryption key from the server secret and the token.
 * @param {string} token
 */
function deriveKey(token) {
  const { secret } = getConfig().session;
  return Buffer.from(crypto.hkdfSync('sha256', token, secret, 'webmail-session-key', 32));
}

/**
 * Encrypts a secret for storage. Output: base64url(iv | tag | ciphertext).
 * @param {string} plaintext
 * @param {string} token session token (never stored server-side)
 */
export function encryptSecret(plaintext, token) {
  const key = deriveKey(token);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Reverses {@link encryptSecret}. Throws if the token or data is wrong.
 * @param {string} payload
 * @param {string} token
 */
export function decryptSecret(payload, token) {
  const key = deriveKey(token);
  const buf = Buffer.from(payload, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Signs an arbitrary payload (used for short-lived attachment URLs).
 * @param {Record<string, string|number>} payload
 * @param {number} ttlSeconds
 */
export function signPayload(payload, ttlSeconds) {
  const data = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getConfig().session.secret)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verifies a payload created with {@link signPayload}.
 * @param {string} token
 * @returns {Record<string, any> | null}
 */
export function verifyPayload(token) {
  if (typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto
    .createHmac('sha256', getConfig().session.secret)
    .update(body)
    .digest('base64url');
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
