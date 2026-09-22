import { getDb } from '@/lib/db';
import { getConfig } from '@/lib/config/env';
import {
  decryptSecret,
  encryptSecret,
  generateId,
  generateToken,
  hashToken,
} from '@/lib/security/crypto';
import { logger } from '@/lib/logger';

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} email
 * @property {number} createdAt
 * @property {number} lastSeenAt
 * @property {number} expiresAt
 * @property {string|null} userAgent
 * @property {string|null} ip
 */

/**
 * @typedef {Session & { credentials: { user: string, pass: string }, token: string }} AuthenticatedSession
 */

const TOUCH_INTERVAL_MS = 60 * 1000;

/**
 * Creates a new session after the mailbox credentials have been verified.
 * Returns the raw token that must be placed in the HTTP-only cookie.
 *
 * @param {{ email: string, password: string, userAgent?: string, ip?: string }} params
 * @returns {{ token: string, session: Session }}
 */
export function createSession({ email, password, userAgent, ip }) {
  const db = getDb();
  const { ttlHours } = getConfig().session;
  const token = generateToken(32);
  const now = Date.now();
  const session = {
    id: generateId(),
    email: email.toLowerCase(),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + ttlHours * 3600 * 1000,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
    ip: ip || null,
  };

  db.prepare(
    `INSERT INTO sessions (id, token_hash, email, encrypted_secret, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES (@id, @tokenHash, @email, @encryptedSecret, @createdAt, @lastSeenAt, @expiresAt, @userAgent, @ip)`
  ).run({
    ...session,
    tokenHash: hashToken(token),
    encryptedSecret: encryptSecret(password, token),
  });

  return { token, session };
}

/**
 * Resolves a session from a raw cookie token. Returns null if the session is
 * missing, expired or revoked.
 *
 * @param {string | undefined | null} token
 * @returns {AuthenticatedSession | null}
 */
export function resolveSession(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL`)
    .get(hashToken(token));
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }

  let pass;
  try {
    pass = decryptSecret(row.encrypted_secret, token);
  } catch (error) {
    logger.warn(
      { operation: 'auth.resolveSession', sessionId: row.id },
      'failed to decrypt session secret'
    );
    return null;
  }

  // Sliding expiration, throttled to once a minute to avoid write amplification.
  if (now - row.last_seen_at > TOUCH_INTERVAL_MS) {
    const { ttlHours } = getConfig().session;
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      now,
      now + ttlHours * 3600 * 1000,
      row.id
    );
  }

  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ip: row.ip,
    token,
    credentials: { user: row.email, pass },
  };
}

/** Revokes a single session by id (must belong to the given email). */
export function revokeSession(sessionId, email) {
  const result = getDb()
    .prepare('UPDATE sessions SET revoked_at = ?, encrypted_secret = ? WHERE id = ? AND email = ?')
    .run(Date.now(), '', sessionId, email.toLowerCase());
  return result.changes > 0;
}

/** Revokes every session for a mailbox. Returns the number revoked. */
export function revokeAllSessions(email, { exceptId } = {}) {
  const db = getDb();
  const result = exceptId
    ? db
        .prepare(
          'UPDATE sessions SET revoked_at = ?, encrypted_secret = ? WHERE email = ? AND revoked_at IS NULL AND id != ?'
        )
        .run(Date.now(), '', email.toLowerCase(), exceptId)
    : db
        .prepare(
          'UPDATE sessions SET revoked_at = ?, encrypted_secret = ? WHERE email = ? AND revoked_at IS NULL'
        )
        .run(Date.now(), '', email.toLowerCase());
  return result.changes;
}

/**
 * Lists active sessions for a mailbox (never includes secrets).
 * @param {string} email
 * @returns {Session[]}
 */
export function listSessions(email) {
  const now = Date.now();
  return getDb()
    .prepare(
      `SELECT id, email, created_at, last_seen_at, expires_at, user_agent, ip
       FROM sessions WHERE email = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY last_seen_at DESC`
    )
    .all(email.toLowerCase(), now)
    .map((row) => ({
      id: row.id,
      email: row.email,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      ip: row.ip,
    }));
}

/** Removes expired and revoked sessions. Safe to run periodically. */
export function pruneSessions() {
  const cutoff = Date.now();
  const result = getDb()
    .prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL')
    .run(cutoff);
  return result.changes;
}

/** Records a login attempt for the security settings page and throttling. */
export function recordLogin({ email, success, ip, userAgent }) {
  getDb()
    .prepare(
      'INSERT INTO login_history (email, success, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      email.toLowerCase(),
      success ? 1 : 0,
      ip || null,
      userAgent ? userAgent.slice(0, 512) : null,
      Date.now()
    );
}

/** Returns the last successful login before the current one, if any. */
export function getLoginHistory(email, limit = 10) {
  return getDb()
    .prepare(
      'SELECT success, ip, user_agent, created_at FROM login_history WHERE email = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(email.toLowerCase(), limit)
    .map((r) => ({ success: !!r.success, ip: r.ip, userAgent: r.user_agent, at: r.created_at }));
}
