import { ImapClient } from '@/lib/imap/client';
import { getConfig } from '@/lib/config/env';
import { logger, serializeError } from '@/lib/logger';
import { mapMailError } from '@/lib/api/errors';

/**
 * ImapConnectionManager
 *
 * Maintains a small pool of authenticated IMAP connections per mailbox so
 * that concurrent API requests from the same user reuse sockets instead of
 * performing a fresh TLS handshake + LOGIN each time.
 *
 *  - Pools are keyed by mailbox address.
 *  - A pool never exceeds IMAP_POOL_SIZE connections; extra callers wait.
 *  - Connections idle longer than IMAP_IDLE_TIMEOUT_SECONDS are logged out.
 *  - Dead connections are detected on acquire and replaced.
 *  - Reconnect attempts use exponential backoff to avoid hammering Dovecot.
 */

const ACQUIRE_TIMEOUT_MS = 30_000;
const SWEEP_INTERVAL_MS = 30_000;

class Pool {
  constructor(email) {
    this.email = email;
    /** @type {ImapClient[]} */
    this.clients = [];
    /** @type {Array<{ resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this.waiters = [];
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.log = logger.child({ component: 'imap-pool', mailbox: email });
  }

  get size() {
    return this.clients.length;
  }

  /**
   * @param {{ user: string, pass: string }} credentials
   * @returns {Promise<ImapClient>}
   */
  async acquire(credentials) {
    // Reuse an idle, healthy connection.
    for (const client of this.clients) {
      if (!client.busy && client.usable) {
        client.busy = true;
        client.lastUsed = Date.now();
        return client;
      }
    }

    // Drop dead connections.
    this.clients = this.clients.filter((c) => c.usable || c.busy);

    const { poolSize } = getConfig().imap;
    if (this.clients.length < poolSize) {
      return this.open(credentials);
    }

    // Pool exhausted: wait for a release.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error('Timed out waiting for an IMAP connection'));
      }, ACQUIRE_TIMEOUT_MS);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  async open(credentials) {
    const now = Date.now();
    if (now < this.nextAttemptAt) {
      const err = new Error('Mail server temporarily unavailable, retrying later');
      err.code = 'EBACKOFF';
      throw err;
    }

    const client = new ImapClient(credentials, { disableAutoIdle: true });
    client.busy = true;
    this.clients.push(client);
    try {
      await client.connect();
      this.failures = 0;
      this.nextAttemptAt = 0;
      this.log.debug({ cid: client.id, poolSize: this.clients.length }, 'imap connection opened');
      return client;
    } catch (error) {
      this.clients = this.clients.filter((c) => c !== client);
      if (!error?.authenticationFailed) {
        // Transient failure: back off exponentially (1s, 2s, 4s ... max 60s).
        this.failures += 1;
        const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.failures - 1, 6));
        this.nextAttemptAt = Date.now() + delay;
        this.log.warn(
          { err: serializeError(error), failures: this.failures, retryInMs: delay },
          'imap connect failed'
        );
      } else {
        this.log.info('imap authentication failed');
      }
      throw error;
    }
  }

  release(client) {
    client.busy = false;
    client.lastUsed = Date.now();
    if (!client.usable) {
      this.clients = this.clients.filter((c) => c !== client);
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      if (client.usable) {
        client.busy = true;
        waiter.resolve(client);
      } else {
        // Let the waiter open a fresh connection instead.
        waiter.reject(Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }));
      }
    }
  }

  async closeIdle(maxIdleMs) {
    const now = Date.now();
    const idle = this.clients.filter((c) => !c.busy && (now - c.lastUsed > maxIdleMs || !c.usable));
    this.clients = this.clients.filter((c) => !idle.includes(c));
    await Promise.all(idle.map((c) => c.disconnect().catch(() => {})));
    return idle.length;
  }

  async closeAll() {
    const all = this.clients;
    this.clients = [];
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Pool closed'));
    }
    this.waiters = [];
    await Promise.all(all.map((c) => c.disconnect().catch(() => {})));
  }
}

class ImapConnectionManager {
  constructor() {
    /** @type {Map<string, Pool>} */
    this.pools = new Map();
    this.sweeper = setInterval(
      () => this.closeIdleConnections().catch(() => {}),
      SWEEP_INTERVAL_MS
    );
    if (this.sweeper.unref) this.sweeper.unref();
  }

  poolFor(email) {
    const key = email.toLowerCase();
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new Pool(key);
      this.pools.set(key, pool);
    }
    return pool;
  }

  /**
   * Acquires a connection for the given credentials.
   * @param {{ user: string, pass: string }} credentials
   */
  async getConnection(credentials) {
    const pool = this.poolFor(credentials.user);
    try {
      return await pool.acquire(credentials);
    } catch (error) {
      throw mapMailError(error);
    }
  }

  releaseConnection(client) {
    const pool = this.poolFor(client.user);
    pool.release(client);
  }

  /**
   * Runs `fn` with a pooled connection, retrying once if the connection turned
   * out to be stale (server dropped it while idle).
   * @template T
   * @param {{ user: string, pass: string }} credentials
   * @param {(client: ImapClient) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withConnection(credentials, fn) {
    let attempt = 0;

    while (true) {
      const client = await this.getConnection(credentials);
      try {
        return await fn(client);
      } catch (error) {
        const stale = isConnectionError(error) && attempt === 0;
        if (stale) {
          client.closed = true;
          attempt += 1;
          logger.debug(
            { mailbox: credentials.user, err: serializeError(error) },
            'retrying on fresh imap connection'
          );
          continue;
        }
        throw error;
      } finally {
        this.releaseConnection(client);
      }
    }
  }

  /** Reconnect helper for callers that detected a dead client. */
  async reconnect(credentials) {
    const pool = this.poolFor(credentials.user);
    await pool.closeIdle(0);
    return pool.open(credentials);
  }

  async closeIdleConnections() {
    const { idleTimeoutMs } = getConfig().imap;
    let closed = 0;
    for (const [key, pool] of this.pools) {
      closed += await pool.closeIdle(idleTimeoutMs);
      if (pool.size === 0 && pool.waiters.length === 0) this.pools.delete(key);
    }
    if (closed > 0) logger.debug({ closed }, 'closed idle imap connections');
    return closed;
  }

  /** Closes every connection for a mailbox (used on logout-all). */
  async closeForUser(email) {
    const pool = this.pools.get(email.toLowerCase());
    if (pool) {
      await pool.closeAll();
      this.pools.delete(email.toLowerCase());
    }
  }

  async healthCheck(credentials) {
    const started = Date.now();
    return this.withConnection(credentials, async (client) => {
      const ok = await client.healthCheck();
      return { ok, latencyMs: Date.now() - started };
    });
  }

  stats() {
    let connections = 0;
    let busy = 0;
    for (const pool of this.pools.values()) {
      connections += pool.size;
      busy += pool.clients.filter((c) => c.busy).length;
    }
    return { mailboxes: this.pools.size, connections, busy };
  }

  async shutdown() {
    clearInterval(this.sweeper);
    for (const pool of this.pools.values()) await pool.closeAll();
    this.pools.clear();
  }
}

export function isConnectionError(error) {
  const code = String(error?.code || '');
  const text = String(error?.message || '');
  return (
    [
      'ECONNRESET',
      'EPIPE',
      'ETIMEDOUT',
      'EConnectionClosed',
      'NoConnection',
      'ECONNCLOSED',
    ].includes(code) || /connection (closed|not available|lost)/i.test(text)
  );
}

const globalKey = Symbol.for('webmail.imapConnectionManager');
if (!globalThis[globalKey]) globalThis[globalKey] = new ImapConnectionManager();

/** @type {ImapConnectionManager} */
export const connectionManager = globalThis[globalKey];
