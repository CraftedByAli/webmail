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
 * @property {string} email  the mailbox this request acts on
 * @property {number} createdAt
 * @property {number} lastSeenAt
 * @property {number} expiresAt
 * @property {string|null} userAgent
 * @property {string|null} ip
 */

/**
 * @typedef {Object} SessionAccount
 * @property {string} email
 * @property {number} position
 * @property {number} addedAt
 * @property {number} lastUsedAt
 */

/**
 * @typedef {Session & {
 *   credentials: { user: string, pass: string },
 *   token: string,
 *   accounts: SessionAccount[],
 *   primaryEmail: string,
 *   requestedAccountMissing?: boolean,
 * }} AuthenticatedSession
 */

const TOUCH_INTERVAL_MS = 60 * 1000;

const ACCOUNT_COLUMNS = 'email, position, added_at, last_used_at';

function toAccount(row) {
  return {
    email: row.email,
    position: row.position,
    addedAt: row.added_at,
    lastUsedAt: row.last_used_at,
  };
}

/** Every mailbox signed in to a session, in display order. */
export function listSessionAccounts(sessionId) {
  return getDb()
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM session_accounts WHERE session_id = ? ORDER BY position, added_at`
    )
    .all(sessionId)
    .map(toAccount);
}

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

  db.transaction(() => {
    // `sessions.email` records who opened the session; credentials live only
    // in session_accounts.
    db.prepare(
      `INSERT INTO sessions (id, token_hash, email, encrypted_secret, created_at, last_seen_at, expires_at, user_agent, ip)
       VALUES (@id, @tokenHash, @email, '', @createdAt, @lastSeenAt, @expiresAt, @userAgent, @ip)`
    ).run({ ...session, tokenHash: hashToken(token) });
    db.prepare(
      `INSERT INTO session_accounts (session_id, email, encrypted_secret, position, added_at, last_used_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    ).run(session.id, session.email, encryptSecret(password, token), now, now);
  })();

  return { token, session };
}

/**
 * Adds a mailbox to an existing session (or refreshes its stored password if
 * it is already there). The credential must have been verified already.
 *
 * @param {AuthenticatedSession} session
 * @param {{ email: string, password: string }} params
 * @returns {{ added: boolean, accounts: SessionAccount[] }}
 */
export function addSessionAccount(session, { email, password }) {
  const db = getDb();
  const normalized = email.toLowerCase();
  const now = Date.now();
  const { maxAccounts } = getConfig().session;

  return db.transaction(() => {
    const existing = db
      .prepare('SELECT 1 FROM session_accounts WHERE session_id = ? AND email = ?')
      .get(session.id, normalized);
    const secret = encryptSecret(password, session.token);
    if (existing) {
      db.prepare(
        'UPDATE session_accounts SET encrypted_secret = ?, last_used_at = ? WHERE session_id = ? AND email = ?'
      ).run(secret, now, session.id, normalized);
      return { added: false, accounts: listSessionAccounts(session.id) };
    }
    const { count, maxPosition } = db
      .prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(position), -1) AS maxPosition FROM session_accounts WHERE session_id = ?'
      )
      .get(session.id);
    if (count >= maxAccounts) {
      const error = new Error('mailbox limit reached');
      error.code = 'ACCOUNT_LIMIT';
      error.limit = maxAccounts;
      throw error;
    }
    db.prepare(
      `INSERT INTO session_accounts (session_id, email, encrypted_secret, position, added_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(session.id, normalized, secret, maxPosition + 1, now, now);
    return { added: true, accounts: listSessionAccounts(session.id) };
  })();
}

/**
 * Removes one mailbox from a session. When it was the last one the whole
 * session is revoked. Returns what is left.
 *
 * @param {string} sessionId
 * @param {string} email
 * @returns {{ removed: boolean, remaining: number }}
 */
export function removeSessionAccount(sessionId, email) {
  const db = getDb();
  return db.transaction(() => {
    const result = db
      .prepare('DELETE FROM session_accounts WHERE session_id = ? AND email = ?')
      .run(sessionId, email.toLowerCase());
    const { remaining } = db
      .prepare('SELECT COUNT(*) AS remaining FROM session_accounts WHERE session_id = ?')
      .get(sessionId);
    if (remaining === 0) {
      db.prepare(
        'UPDATE sessions SET revoked_at = ?, encrypted_secret = ? WHERE id = ? AND revoked_at IS NULL'
      ).run(Date.now(), '', sessionId);
    }
    return { removed: result.changes > 0, remaining };
  })();
}

/** Revokes a whole browser session (all its mailboxes). */
export function revokeSessionEntirely(sessionId) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM session_accounts WHERE session_id = ?').run(sessionId);
    db.prepare('UPDATE sessions SET revoked_at = ?, encrypted_secret = ? WHERE id = ?').run(
      Date.now(),
      '',
      sessionId
    );
  })();
}

/** Reorders the mailboxes of a session. Unknown addresses are ignored. */
export function reorderSessionAccounts(sessionId, emails) {
  const db = getDb();
  const update = db.prepare(
    'UPDATE session_accounts SET position = ? WHERE session_id = ? AND email = ?'
  );
  db.transaction(() => {
    emails.forEach((email, index) => update.run(index, sessionId, String(email).toLowerCase()));
  })();
  return listSessionAccounts(sessionId);
}

/** Whether any live session still holds this mailbox (to decide on closing its IMAP pool). */
export function isMailboxSignedInAnywhere(email) {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM session_accounts a JOIN sessions s ON s.id = a.session_id
       WHERE a.email = ? AND s.revoked_at IS NULL AND s.expires_at > ? LIMIT 1`
    )
    .get(email.toLowerCase(), Date.now());
  return !!row;
}

/**
 * Resolves a session from a raw cookie token. Returns null if the session is
 * missing, expired or revoked.
 *
 * `account` picks which signed-in mailbox the request acts on; without it the
 * `preferred` mailbox (the browser's last-used hint) or the first one is used.
 * If `account` names a mailbox that is not in the session, the default is
 * returned with `requestedAccountMissing: true` — callers that act on mail
 * must refuse such a request rather than silently use another mailbox.
 *
 * @param {string | undefined | null} token
 * @param {{ account?: string | null, preferred?: string | null }} [options]
 * @returns {AuthenticatedSession | null}
 */
export function resolveSession(token, { account = null, preferred = null } = {}) {
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

  const accountRows = db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS}, encrypted_secret FROM session_accounts WHERE session_id = ? ORDER BY position, added_at`
    )
    .all(row.id);
  if (accountRows.length === 0) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now, row.id);
    return null;
  }

  const requested = account ? String(account).trim().toLowerCase() : null;
  const hint = preferred ? String(preferred).trim().toLowerCase() : null;
  let selected = requested ? accountRows.find((a) => a.email === requested) : null;
  const requestedAccountMissing = !!requested && !selected;
  if (!selected && hint) selected = accountRows.find((a) => a.email === hint);
  if (!selected) selected = accountRows[0];

  let pass;
  try {
    pass = decryptSecret(selected.encrypted_secret, token);
  } catch {
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
  if (now - selected.last_used_at > TOUCH_INTERVAL_MS) {
    db.prepare(
      'UPDATE session_accounts SET last_used_at = ? WHERE session_id = ? AND email = ?'
    ).run(now, row.id, selected.email);
  }

  return {
    id: row.id,
    email: selected.email,
    primaryEmail: accountRows[0].email,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ip: row.ip,
    token,
    credentials: { user: selected.email, pass },
    accounts: accountRows.map(toAccount),
    requestedAccountMissing,
  };
}

/**
 * Decrypts the credentials of every mailbox in a session (realtime needs one
 * IDLE connection per mailbox). Mailboxes whose secret cannot be decrypted
 * are skipped.
 * @param {AuthenticatedSession} session
 * @returns {Array<{ user: string, pass: string }>}
 */
export function getAllSessionCredentials(session) {
  const rows = getDb()
    .prepare(
      'SELECT email, encrypted_secret FROM session_accounts WHERE session_id = ? ORDER BY position, added_at'
    )
    .all(session.id);
  const out = [];
  for (const r of rows) {
    try {
      out.push({ user: r.email, pass: decryptSecret(r.encrypted_secret, session.token) });
    } catch {
      // unreadable secret: skip this mailbox
    }
  }
  return out;
}

/**
 * Signs a mailbox out of one session (identified by id). Other mailboxes in
 * that session stay signed in; an emptied session is revoked.
 */
export function revokeSession(sessionId, email) {
  return removeSessionAccount(sessionId, email).removed;
}

/**
 * Signs a mailbox out of every session ("sign out everywhere"). Sessions that
 * held only this mailbox are revoked. Returns the number of sessions affected.
 */
export function revokeAllSessions(email, { exceptId } = {}) {
  const db = getDb();
  const normalized = email.toLowerCase();
  const sessionIds = db
    .prepare(
      `SELECT a.session_id AS id FROM session_accounts a JOIN sessions s ON s.id = a.session_id
       WHERE a.email = ? AND s.revoked_at IS NULL`
    )
    .all(normalized)
    .map((r) => r.id)
    .filter((id) => id !== exceptId);
  for (const id of sessionIds) removeSessionAccount(id, normalized);
  return sessionIds.length;
}

/**
 * Lists active sessions a mailbox is signed in to (never includes secrets or
 * the other mailboxes of those sessions — only how many there are).
 * @param {string} email
 * @returns {Array<Session & { mailboxCount: number }>}
 */
export function listSessions(email) {
  const now = Date.now();
  return getDb()
    .prepare(
      `SELECT s.id, s.created_at, s.last_seen_at, s.expires_at, s.user_agent, s.ip,
              (SELECT COUNT(*) FROM session_accounts x WHERE x.session_id = s.id) AS mailbox_count
       FROM sessions s JOIN session_accounts a ON a.session_id = s.id
       WHERE a.email = ? AND s.revoked_at IS NULL AND s.expires_at > ?
       ORDER BY s.last_seen_at DESC`
    )
    .all(email.toLowerCase(), now)
    .map((row) => ({
      id: row.id,
      email: email.toLowerCase(),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      ip: row.ip,
      mailboxCount: row.mailbox_count,
    }));
}

/** Removes expired and revoked sessions (accounts cascade). Safe to run periodically. */
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
