import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Small application database. Mail itself never lives here — only session
 * records, user preferences, contacts and signatures. Deleting this file loses
 * nothing that lives in Mailcow.
 */

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        encrypted_secret TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT,
        ip TEXT,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS user_preferences (
        email TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signatures (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        html TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_signatures_email ON signatures(email);

      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        name TEXT,
        email TEXT NOT NULL,
        company TEXT,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(owner_email, email)
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_email);

      CREATE TABLE IF NOT EXISTS address_suggestions (
        owner_email TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        weight INTEGER NOT NULL DEFAULT 1,
        last_used_at INTEGER NOT NULL,
        PRIMARY KEY(owner_email, email)
      );

      CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        success INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_login_history_email ON login_history(email, created_at);
    `,
  },
];

function openDatabase() {
  const { storage } = getConfig();
  const dbPath = path.resolve(process.cwd(), storage.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version)
  );
  const apply = db.transaction((migration) => {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      Date.now()
    );
  });
  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      apply(migration);
      logger.info({ operation: 'db.migrate', version: migration.version }, 'applied migration');
    }
  }
  return db;
}

const globalKey = Symbol.for('webmail.db');

/**
 * Returns the process-wide database handle (created lazily).
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = openDatabase();
  }
  return globalThis[globalKey];
}

/** Closes the database; used by tests and graceful shutdown. */
export function closeDb() {
  const db = globalThis[globalKey];
  if (db) {
    db.close();
    globalThis[globalKey] = null;
  }
}
