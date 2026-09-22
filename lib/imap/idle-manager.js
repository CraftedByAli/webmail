import { ImapClient } from '@/lib/imap/client';
import { realtimeHub } from '@/lib/realtime/hub';
import { logger, serializeError } from '@/lib/logger';
import { invalidateMailboxCache } from '@/lib/cache/mail-cache';

/**
 * IdleManager
 *
 * Keeps exactly one dedicated IMAP IDLE connection per signed-in mailbox
 * (not per browser tab). The connection watches INBOX and translates Dovecot
 * notifications into realtime events for the hub. It starts when the first
 * SSE subscriber appears and is torn down shortly after the last one leaves.
 */

const STOP_GRACE_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

class IdleListener {
  constructor(email, credentials) {
    this.email = email;
    this.credentials = credentials;
    this.refs = 0;
    this.client = null;
    this.stopping = false;
    this.failures = 0;
    this.reconnectTimer = null;
    this.stopTimer = null;
    this.log = logger.child({ component: 'imap-idle', mailbox: email });
    this.lastExists = null;
  }

  retain(credentials) {
    this.credentials = credentials;
    this.refs += 1;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (!this.client && !this.reconnectTimer) this.connect();
  }

  release() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0 && !this.stopTimer) {
      this.stopTimer = setTimeout(() => this.stop(), STOP_GRACE_MS);
    }
  }

  async connect() {
    if (this.stopping) return;
    const client = new ImapClient(this.credentials, { disableAutoIdle: false, id: 'idle' });
    this.client = client;
    try {
      await client.connect();
      const mailbox = await client.flow.mailboxOpen('INBOX', { readOnly: true });
      this.lastExists = mailbox.exists;
      this.failures = 0;

      client.flow.on('exists', (data) => this.handleExists(data));
      client.flow.on('expunge', (data) =>
        this.emit({ type: 'expunge', folder: 'INBOX', seq: data.seq, uid: data.uid })
      );
      client.flow.on('flags', (data) =>
        this.emit({
          type: 'flags',
          folder: 'INBOX',
          uid: data.uid,
          seq: data.seq,
          flags: data.flags ? [...data.flags] : [],
        })
      );
      client.flow.on('close', () => this.scheduleReconnect());
      client.flow.on('error', () => this.scheduleReconnect());

      this.log.info('idle listener connected');
      this.emit({ type: 'connected' });
    } catch (error) {
      this.log.warn({ err: serializeError(error) }, 'idle listener failed to connect');
      this.client = null;
      if (error?.authenticationFailed) {
        // Credentials no longer valid; stop trying, the session will be rejected on next request.
        this.emit({ type: 'auth_failed' });
        return;
      }
      this.scheduleReconnect();
    }
  }

  async handleExists(data) {
    const previous = this.lastExists ?? data.prevCount ?? 0;
    this.lastExists = data.count;
    invalidateMailboxCache(this.email, 'INBOX');
    if (data.count <= previous) {
      this.emit({ type: 'mailbox_changed', folder: 'INBOX', count: data.count });
      return;
    }
    // Fetch headers for the newly arrived messages so the UI can show a toast.
    try {
      const range = `${previous + 1}:${data.count}`;
      const messages = await this.client.fetchSummaries('INBOX', range, {
        uid: false,
        previews: false,
      });
      this.emit({
        type: 'new_mail',
        folder: 'INBOX',
        count: data.count,
        messages: messages.map(toEventMessage),
      });
    } catch (error) {
      this.log.debug({ err: serializeError(error) }, 'failed to fetch new message headers');
      this.emit({ type: 'new_mail', folder: 'INBOX', count: data.count, messages: [] });
    }
  }

  emit(event) {
    realtimeHub.publish(this.email, { ...event, at: Date.now() });
  }

  scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    if (this.client) {
      const old = this.client;
      this.client = null;
      old.disconnect().catch(() => {});
    }
    if (this.refs === 0) return;
    this.failures += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.min(this.failures - 1, 7));
    this.log.info({ delay, failures: this.failures }, 'scheduling idle reconnect');
    this.emit({ type: 'disconnected', retryInMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  async stop() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    const client = this.client;
    this.client = null;
    if (client) await client.disconnect().catch(() => {});
    idleManager.listeners.delete(this.email);
    this.log.info('idle listener stopped');
  }
}

function toEventMessage(m) {
  return {
    uid: m.uid,
    subject: m.subject,
    from: m.from,
    date: m.date,
    preview: m.preview,
    flags: m.flags,
  };
}

class IdleManager {
  constructor() {
    /** @type {Map<string, IdleListener>} */
    this.listeners = new Map();
  }

  /**
   * Registers interest in realtime updates for a mailbox. Returns a release
   * function that must be called when the subscriber disconnects.
   */
  retain(credentials) {
    const email = credentials.user.toLowerCase();
    let listener = this.listeners.get(email);
    if (!listener || listener.stopping) {
      listener = new IdleListener(email, credentials);
      this.listeners.set(email, listener);
    }
    listener.retain(credentials);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      listener.release();
    };
  }

  status(email) {
    const l = this.listeners.get(email.toLowerCase());
    if (!l) return { active: false };
    return { active: !!l.client, refs: l.refs, failures: l.failures };
  }

  async shutdown() {
    for (const listener of this.listeners.values()) await listener.stop();
  }
}

const globalKey = Symbol.for('webmail.idleManager');
if (!globalThis[globalKey]) globalThis[globalKey] = new IdleManager();

/** @type {IdleManager} */
export const idleManager = globalThis[globalKey];
