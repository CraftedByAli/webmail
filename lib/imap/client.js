import { ImapFlow } from 'imapflow';
import { searchCompiler } from 'imapflow/lib/search-compiler';
import { getConfig } from '@/lib/config/env';
import { logger, serializeError } from '@/lib/logger';
import { buildFolderModel, DEFAULT_ROLE_NAMES } from '@/lib/imap/folders';
import { normalizeAddressList } from '@/lib/mime/address';
import { decodePreview } from '@/lib/mime/preview';

/**
 * Thin, promise-based wrapper around a single ImapFlow connection.
 *
 * All IMAP protocol knowledge lives here (and in the sibling modules); API
 * routes only ever talk to the MailProvider, which delegates to this class via
 * the connection manager.
 *
 * @typedef {Object} MessageSummary
 * @property {number} uid
 * @property {number} seq
 * @property {string} folder
 * @property {string|null} messageId
 * @property {string|null} inReplyTo
 * @property {string[]} references
 * @property {string} subject
 * @property {import('@/lib/mime/address').Address|null} from
 * @property {import('@/lib/mime/address').Address[]} to
 * @property {import('@/lib/mime/address').Address[]} cc
 * @property {string|null} date ISO date
 * @property {number} size
 * @property {{ seen: boolean, flagged: boolean, answered: boolean, draft: boolean, deleted: boolean, forwarded: boolean }} flags
 * @property {boolean} hasAttachment
 * @property {string} preview
 */

const HEADER_FIELDS = ['references', 'in-reply-to', 'x-priority', 'list-unsubscribe'];

/**
 * Header set for the reading pane. A named-field FETCH is far cheaper than
 * pulling the whole HEADER block, and asking for these here means opening a
 * message needs no separate header round trip at all.
 */
const DISPLAY_HEADER_FIELDS = [...HEADER_FIELDS, 'importance', 'auto-submitted'];
const CLIENT_INFO = { name: 'Mailcow Webmail', version: '0.1.0' };

/** Translates our user-facing flag names to IMAP system flags. */
export const FLAG_MAP = {
  seen: '\\Seen',
  flagged: '\\Flagged',
  answered: '\\Answered',
  draft: '\\Draft',
  deleted: '\\Deleted',
  forwarded: '$Forwarded',
};

export class ImapClient {
  /**
   * @param {{ user: string, pass: string }} credentials
   * @param {{ disableAutoIdle?: boolean, id?: string }} [options]
   */
  constructor(credentials, options = {}) {
    const { imap } = getConfig();
    this.id = options.id || Math.random().toString(36).slice(2, 8);
    this.user = credentials.user;
    this.log = logger.child({ component: 'imap', cid: this.id, mailbox: credentials.user });
    this.lastUsed = Date.now();
    this.busy = false;
    this.closed = false;

    this.flow = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.tls,
      auth: { user: credentials.user, pass: credentials.pass },
      clientInfo: CLIENT_INFO,
      logger: false,
      disableAutoIdle: options.disableAutoIdle ?? true,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 5 * 60_000,
      tls: { rejectUnauthorized: imap.rejectUnauthorized, minVersion: 'TLSv1.2' },
    });

    this.flow.on('error', (err) => {
      this.log.warn({ err: serializeError(err) }, 'imap connection error');
      this.closed = true;
    });
    this.flow.on('close', () => {
      this.closed = true;
    });
  }

  get usable() {
    return !this.closed && this.flow.usable;
  }

  async connect() {
    await this.flow.connect();
    this.closed = false;
    this.capabilities = this.flow.capabilities;
    return this;
  }

  async disconnect() {
    this.closed = true;
    try {
      await this.flow.logout();
    } catch {
      this.flow.close();
    }
  }

  /** Runs a NOOP to verify the connection is alive. */
  async healthCheck() {
    if (!this.usable) return false;
    try {
      await this.flow.noop();
      return true;
    } catch {
      this.closed = true;
      return false;
    }
  }

  hasCapability(name) {
    return this.flow.capabilities?.has(name) || false;
  }

  // ---------------------------------------------------------------------------
  // Mailboxes / folders
  // ---------------------------------------------------------------------------

  /** Lists folders with unread counts and detected roles. */
  async listMailboxes() {
    const entries = await this.flow.list({ statusQuery: { messages: true, unseen: true } });
    return buildFolderModel(entries);
  }

  async getMailboxStatus(path) {
    const status = await this.flow.status(path, {
      messages: true,
      unseen: true,
      uidNext: true,
      uidValidity: true,
    });
    return {
      path,
      total: status.messages ?? 0,
      unread: status.unseen ?? 0,
      uidNext: status.uidNext,
      uidValidity: status.uidValidity ? String(status.uidValidity) : null,
    };
  }

  async createFolder(path) {
    const res = await this.flow.mailboxCreate(path);
    return res.path;
  }

  async renameFolder(path, newPath) {
    const res = await this.flow.mailboxRename(path, newPath);
    return res.newPath;
  }

  async deleteFolder(path) {
    await this.flow.mailboxDelete(path);
    return true;
  }

  async subscribeToMailbox(path) {
    return this.flow.mailboxSubscribe(path);
  }

  /**
   * Ensures a folder exists for the given role, creating it with the default
   * name if the server does not have one. Returns the folder path.
   */
  async ensureRoleFolder(role, roles) {
    if (roles[role]) return roles[role];
    const name = DEFAULT_ROLE_NAMES[role];
    if (!name) throw new Error(`No default folder name for role ${role}`);
    try {
      const path = await this.createFolder(name);
      await this.subscribeToMailbox(path).catch(() => {});
      return path;
    } catch (error) {
      if (/ALREADYEXISTS|already exists/i.test(String(error?.responseText || error?.message)))
        return name;
      throw error;
    }
  }

  /**
   * Runs `fn` with the mailbox selected under an exclusive lock.
   * @template T
   * @param {string} path
   * @param {(mailbox: import('imapflow').MailboxObject) => Promise<T>} fn
   * @param {{ readOnly?: boolean }} [options]
   * @returns {Promise<T>}
   */
  async withMailbox(path, fn, options = {}) {
    const lock = await this.flow.getMailboxLock(path, { readOnly: options.readOnly ?? false });
    try {
      return await fn(this.flow.mailbox);
    } finally {
      lock.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Message listing
  // ---------------------------------------------------------------------------

  /**
   * Lists a page of message summaries, newest first, without loading bodies.
   * @param {string} path
   * @param {{ page?: number, pageSize?: number, uids?: number[] | null, previews?: boolean }} options
   */
  async listMessages(path, options = {}) {
    const { pageSizeMax } = getConfig().limits;
    const page = Math.max(0, options.page || 0);
    const pageSize = Math.min(pageSizeMax, Math.max(1, options.pageSize || 50));

    return this.withMailbox(
      path,
      async (mailbox) => {
        let range;
        let total;
        let uidMode = false;

        if (Array.isArray(options.uids)) {
          // Explicit UID list (search results / starred view): already sorted desc by caller.
          total = options.uids.length;
          const slice = options.uids.slice(page * pageSize, page * pageSize + pageSize);
          if (slice.length === 0)
            return {
              messages: [],
              total,
              page,
              pageSize,
              uidValidity: String(mailbox.uidValidity),
            };
          range = slice.join(',');
          uidMode = true;
        } else {
          total = mailbox.exists;
          if (total === 0)
            return {
              messages: [],
              total,
              page,
              pageSize,
              uidValidity: String(mailbox.uidValidity),
            };
          const end = total - page * pageSize;
          if (end < 1)
            return {
              messages: [],
              total,
              page,
              pageSize,
              uidValidity: String(mailbox.uidValidity),
            };
          const start = Math.max(1, end - pageSize + 1);
          range = `${start}:${end}`;
        }

        const messages = await this.fetchSummaries(path, range, {
          uid: uidMode,
          previews: options.previews !== false,
        });
        messages.sort((a, b) => b.uid - a.uid);
        return { messages, total, page, pageSize, uidValidity: String(mailbox.uidValidity) };
      },
      { readOnly: true }
    );
  }

  /**
   * Fetches summaries for a range. Must be called with the mailbox selected.
   * @param {string} path
   * @param {string} range
   * @param {{ uid?: boolean, previews?: boolean }} options
   * @returns {Promise<MessageSummary[]>}
   */
  async fetchSummaries(path, range, options = {}) {
    const results = [];
    const previewTargets = new Map(); // partKey -> [{ uid, encoding, charset, type }]

    for await (const msg of this.flow.fetch(
      range,
      {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        size: true,
        internalDate: true,
        headers: HEADER_FIELDS,
      },
      { uid: !!options.uid }
    )) {
      const summary = this.toSummary(path, msg);
      results.push(summary);

      if (options.previews !== false && msg.bodyStructure) {
        const textPart = findPreviewPart(msg.bodyStructure);
        if (textPart) {
          const key = textPart.part || '1';
          if (!previewTargets.has(key)) previewTargets.set(key, []);
          previewTargets.get(key).push({
            uid: msg.uid,
            encoding: textPart.encoding,
            charset: textPart.parameters?.charset,
            type: textPart.type,
          });
        }
      }
    }

    if (previewTargets.size > 0) {
      await this.fillPreviews(results, previewTargets);
    }
    return results;
  }

  /**
   * Second pass: fetch the first ~1.5KB of each message's text part, grouped
   * by MIME part number so the whole page costs only a couple of FETCHes.
   */
  async fillPreviews(results, previewTargets) {
    const byUid = new Map(results.map((r) => [r.uid, r]));
    for (const [partKey, targets] of previewTargets) {
      const meta = new Map(targets.map((t) => [t.uid, t]));
      const uids = targets.map((t) => t.uid).join(',');
      try {
        for await (const msg of this.flow.fetch(
          uids,
          { uid: true, bodyParts: [{ key: partKey, start: 0, maxLength: 1536 }] },
          { uid: true }
        )) {
          const raw = msg.bodyParts?.get(partKey) || msg.bodyParts?.get(partKey.toLowerCase());
          const info = meta.get(msg.uid);
          const summary = byUid.get(msg.uid);
          if (raw && info && summary) {
            summary.preview = decodePreview(raw, info);
          }
        }
      } catch (error) {
        this.log.debug({ err: serializeError(error), partKey }, 'preview fetch failed');
      }
    }
  }

  /**
   * Fetches summaries for specific UIDs (used by thread views).
   * @param {string} path
   * @param {number[]} uids
   */
  async fetchHeaders(path, uids, { previews = false } = {}) {
    if (uids.length === 0) return [];
    return this.withMailbox(
      path,
      () => this.fetchSummaries(path, uids.join(','), { uid: true, previews }),
      {
        readOnly: true,
      }
    );
  }

  /**
   * @param {string} path
   * @param {import('imapflow').FetchMessageObject} msg
   * @returns {MessageSummary}
   */
  toSummary(path, msg) {
    const envelope = msg.envelope || {};
    const flags = msg.flags || new Set();
    const headers = parseHeaderBlock(msg.headers);
    const references = splitMessageIds(headers['references']);
    const inReplyTo = envelope.inReplyTo
      ? cleanMessageId(envelope.inReplyTo)
      : splitMessageIds(headers['in-reply-to'])[0] || null;
    return {
      uid: msg.uid,
      seq: msg.seq,
      folder: path,
      messageId: envelope.messageId ? cleanMessageId(envelope.messageId) : null,
      inReplyTo,
      references,
      subject: envelope.subject || '',
      from: normalizeAddressList(envelope.from)[0] || null,
      to: normalizeAddressList(envelope.to),
      cc: normalizeAddressList(envelope.cc),
      date: toIso(envelope.date) || toIso(msg.internalDate),
      internalDate: toIso(msg.internalDate),
      size: msg.size || 0,
      flags: {
        seen: flags.has('\\Seen'),
        flagged: flags.has('\\Flagged'),
        answered: flags.has('\\Answered'),
        draft: flags.has('\\Draft'),
        deleted: flags.has('\\Deleted'),
        forwarded: flags.has('$Forwarded'),
      },
      hasAttachment: msg.bodyStructure ? hasAttachmentNode(msg.bodyStructure) : false,
      preview: '',
    };
  }

  // ---------------------------------------------------------------------------
  // Single messages
  // ---------------------------------------------------------------------------

  /**
   * Downloads the full RFC822 source of a message as a Buffer (bounded by
   * MAX_MESSAGE_SIZE_MB). Used for parsing the message body for display.
   */
  async fetchSource(path, uid) {
    const { maxMessageBytes } = getConfig().limits;
    return this.withMailbox(
      path,
      async () => {
        const msg = await this.flow.fetchOne(
          String(uid),
          { uid: true, size: true, source: { maxLength: maxMessageBytes } },
          { uid: true }
        );
        if (!msg) return null;
        return { source: msg.source, size: msg.size, truncated: (msg.size || 0) > maxMessageBytes };
      },
      { readOnly: true }
    );
  }

  /**
   * FETCHes everything the reading pane needs about a message except its body:
   * structure, envelope, flags, size and the display headers, in one command.
   *
   * The mailbox must already be selected — this is a building block for
   * `getMessage`, which runs both of its FETCHes under a single lock so that
   * opening a message costs one EXAMINE instead of one per helper.
   * @param {number} uid
   */
  async fetchDisplayMeta(uid) {
    const msg = await this.flow.fetchOne(
      String(uid),
      {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        size: true,
        internalDate: true,
        headers: DISPLAY_HEADER_FIELDS,
      },
      { uid: true }
    );
    return msg || null;
  }

  /**
   * Downloads the given MIME parts in one FETCH, content-transfer-decoded.
   * The mailbox must already be selected (see `fetchDisplayMeta`).
   *
   * Only numbered body parts belong here: `downloadMany` asks for a companion
   * `<part>.MIME` item for each key, and a non-numeric key such as `HEADER`
   * would become the invalid section `HEADER.MIME` and fail the whole FETCH.
   * @param {number} uid
   * @param {string[]} parts
   */
  async fetchDecodedParts(uid, parts) {
    if (parts.length === 0) return {};
    return this.flow.downloadMany(String(uid), parts, { uid: true });
  }

  /** Fetches only the body structure of a message (cheap). */
  async fetchBodyStructure(path, uid) {
    return this.withMailbox(
      path,
      async () => {
        const msg = await this.flow.fetchOne(
          String(uid),
          { uid: true, bodyStructure: true, envelope: true, flags: true, size: true, headers: true },
          { uid: true }
        );
        return msg || null;
      },
      { readOnly: true }
    );
  }

  /**
   * Streams a single MIME part (attachment) from the server. The caller must
   * consume or destroy `content` and then call `release()`.
   * @param {string} path
   * @param {number} uid
   * @param {string} part
   */
  async downloadPart(path, uid, part) {
    const lock = await this.flow.getMailboxLock(path, { readOnly: true });
    try {
      const result = await this.flow.download(String(uid), part, { uid: true });
      if (!result || !result.content) {
        lock.release();
        return null;
      }
      return { meta: result.meta, content: result.content, release: () => lock.release() };
    } catch (error) {
      lock.release();
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Flags
  // ---------------------------------------------------------------------------

  async setFlags(path, uids, flagNames, add = true) {
    const imapFlags = flagNames.map((f) => FLAG_MAP[f] || f);
    return this.withMailbox(path, async () => {
      const range = uids.join(',');
      if (add) await this.flow.messageFlagsAdd(range, imapFlags, { uid: true });
      else await this.flow.messageFlagsRemove(range, imapFlags, { uid: true });
      return true;
    });
  }

  markRead(path, uids) {
    return this.setFlags(path, uids, ['seen'], true);
  }
  markUnread(path, uids) {
    return this.setFlags(path, uids, ['seen'], false);
  }
  starMessage(path, uids) {
    return this.setFlags(path, uids, ['flagged'], true);
  }
  unstarMessage(path, uids) {
    return this.setFlags(path, uids, ['flagged'], false);
  }

  // ---------------------------------------------------------------------------
  // Move / copy / delete
  // ---------------------------------------------------------------------------

  async moveMessage(path, uids, destination) {
    if (path === destination) return { uidMap: null };
    return this.withMailbox(path, async () => {
      const res = await this.flow.messageMove(uids.join(','), destination, { uid: true });
      return { uidMap: res && res.uidMap ? Object.fromEntries(res.uidMap) : null };
    });
  }

  async copyMessage(path, uids, destination) {
    return this.withMailbox(path, async () => {
      const res = await this.flow.messageCopy(uids.join(','), destination, { uid: true });
      return { uidMap: res && res.uidMap ? Object.fromEntries(res.uidMap) : null };
    });
  }

  /** Permanently deletes messages (flag \Deleted + expunge). */
  async deleteMessage(path, uids) {
    return this.withMailbox(path, async () => {
      await this.flow.messageDelete(uids.join(','), { uid: true });
      return true;
    });
  }

  /**
   * Appends a message to a folder and returns the new UID (requires UIDPLUS,
   * which Dovecot supports).
   */
  async appendMessage(path, buffer, flags = [], date = new Date()) {
    const res = await this.flow.append(path, buffer, flags, date);
    return res && res.uid ? res.uid : null;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Runs an IMAP SEARCH and returns matching UIDs sorted newest first.
   * @param {string} path
   * @param {import('imapflow').SearchObject} criteria
   */
  async searchMessages(path, criteria) {
    return this.withMailbox(
      path,
      async () => {
        const result = await this.flow.search(criteria, { uid: true });
        const uids = Array.isArray(result) ? result : [];
        uids.sort((a, b) => b - a);
        return uids;
      },
      { readOnly: true }
    );
  }

  // ---------------------------------------------------------------------------
  // Threading (server-side THREAD extension when available)
  // ---------------------------------------------------------------------------

  /** Returns the THREAD algorithm supported by the server, if any. */
  threadAlgorithm() {
    for (const algo of ['REFS', 'REFERENCES', 'ORDEREDSUBJECT']) {
      if (this.hasCapability(`THREAD=${algo}`)) return algo;
    }
    return null;
  }

  /**
   * Asks the server to thread the whole mailbox. Returns an array of threads,
   * each a flat array of UIDs (server order), or null if unsupported.
   * @param {string} path
   * @param {import('imapflow').SearchObject} [criteria]
   * @returns {Promise<number[][] | null>}
   */
  async threadMailbox(path, criteria) {
    const algo = this.threadAlgorithm();
    if (!algo) return null;

    return this.withMailbox(
      path,
      async () => {
        const threads = [];
        const attributes = [
          { type: 'ATOM', value: algo },
          { type: 'ATOM', value: 'UTF-8' },
          ...(criteria ? compileCriteria(this.flow, criteria) : [{ type: 'ATOM', value: 'ALL' }]),
        ];
        const response = await this.flow.exec('UID THREAD', attributes, {
          untagged: {
            THREAD: async (untagged) => {
              if (!untagged || !Array.isArray(untagged.attributes)) return;
              for (const node of untagged.attributes) {
                const uids = [];
                flattenThreadNode(node, uids);
                if (uids.length) threads.push(uids);
              }
            },
          },
        });
        response.next();
        return threads;
      },
      { readOnly: true }
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function compileCriteria(flow, criteria) {
  // Reuse imapflow's own search compiler so query semantics match SEARCH.
  return searchCompiler(flow, criteria);
}

function flattenThreadNode(node, out) {
  if (Array.isArray(node)) {
    for (const child of node) flattenThreadNode(child, out);
  } else if (node && typeof node.value === 'string') {
    const n = Number(node.value);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function cleanMessageId(value) {
  if (!value) return null;
  const m = String(value).match(/<([^>]+)>/);
  return (m ? m[1] : String(value)).trim() || null;
}

export function splitMessageIds(value) {
  if (!value) return [];
  return [...String(value).matchAll(/<([^>]+)>/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * Parses the raw header block returned by imapflow into a lowercase map.
 * @param {Buffer | undefined} buffer
 */
export function parseHeaderBlock(buffer) {
  const out = {};
  if (!buffer) return out;
  const text = buffer.toString('utf8').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    out[key] = out[key] ? `${out[key]} ${value}` : value;
  }
  return out;
}

/** True if the body structure contains a non-inline attachment. */
export function hasAttachmentNode(node) {
  if (!node) return false;
  const type = (node.type || '').toLowerCase();
  const disposition = (node.disposition || '').toLowerCase();
  if (disposition === 'attachment') return true;
  if (node.childNodes) {
    if (type === 'multipart/alternative') {
      return node.childNodes.some((child) => child.childNodes && hasAttachmentNode(child));
    }
    return node.childNodes.some(hasAttachmentNode);
  }
  if (type.startsWith('text/') || type === 'multipart/alternative') return false;
  if (type.startsWith('image/') && disposition === 'inline' && node.id) return false;
  if (type === 'application/pgp-signature' || type === 'application/pkcs7-signature') return false;
  return (
    !!node.dispositionParameters?.filename || !!node.parameters?.name || type === 'message/rfc822'
  );
}

/** Finds the best text part to use for a list preview. */
export function findPreviewPart(node) {
  if (!node) return null;
  const type = (node.type || '').toLowerCase();
  if (node.childNodes && node.childNodes.length) {
    if (type === 'multipart/alternative') {
      // Prefer plain text for previews; fall back to HTML.
      const plain = node.childNodes.find((c) => (c.type || '').toLowerCase() === 'text/plain');
      if (plain) return plain;
      for (const child of node.childNodes) {
        const found = findPreviewPart(child);
        if (found) return found;
      }
      return null;
    }
    for (const child of node.childNodes) {
      const found = findPreviewPart(child);
      if (found) return found;
    }
    return null;
  }
  if (
    (type === 'text/plain' || type === 'text/html') &&
    (node.disposition || '').toLowerCase() !== 'attachment'
  ) {
    return node;
  }
  return null;
}