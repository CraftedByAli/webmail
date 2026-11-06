import { ImapClient } from '@/lib/imap/client';
import { connectionManager, isConnectionError } from '@/lib/imap/connection-manager';
import { MailProvider } from '@/lib/mail/provider';
import { buildThreads, toThread } from '@/lib/mail/threading';
import {
  summarizeStructure,
  decodeText,
  unflowText,
  textToHtml,
  findPart,
  estimateDecodedSize,
} from '@/lib/mime/structure';
import { classifyPresentation, splitQuotedContent } from '@/lib/mime/html-analysis';
import { parseFullMessage } from '@/lib/mime/parse';
import { parseHeaderBlock } from '@/lib/imap/client';
import { sanitizeEmailHtml } from '@/lib/security/sanitize-html';
import { buildMessage } from '@/lib/smtp/compose';
import { sendRawMessage, verifySmtp } from '@/lib/smtp/client';
import { openUpload, deleteUpload } from '@/lib/mail/attachments';
import { parseSearchQuery, toImapSearch, isEmptyQuery } from '@/lib/search/query-parser';
import {
  mailCache,
  TTL,
  folderKey,
  mailboxKey,
  invalidateMailboxCache,
} from '@/lib/cache/mail-cache';
import { errors, mapMailError } from '@/lib/api/errors';
import { getConfig } from '@/lib/config/env';
import { logger, timed, serializeError } from '@/lib/logger';
import { rememberAddresses } from '@/lib/contacts/repository';
import { checkSieve, readForwarding, writeForwarding } from '@/lib/forwarding/service';

const MAX_THREAD_FETCH = 40;

/**
 * Generic IMAP + SMTP implementation of {@link MailProvider}. This is what
 * talks to Mailcow (Dovecot + Postfix).
 */
export class ImapSmtpProvider extends MailProvider {
  /**
   * Verifies credentials by opening and immediately closing an IMAP session.
   * @param {{ user: string, pass: string }} credentials
   */
  static async authenticate(credentials) {
    const client = new ImapClient(credentials, { disableAutoIdle: true, id: 'auth' });
    try {
      await client.connect();
      return true;
    } catch (error) {
      throw mapMailError(error);
    } finally {
      await client.disconnect().catch(() => {});
    }
  }

  /** @template T @param {(client: ImapClient) => Promise<T>} fn @returns {Promise<T>} */
  run(fn) {
    return connectionManager.withConnection(this.credentials, fn);
  }

  // ---------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------

  async listFolders() {
    return mailCache.remember(folderKey(this.email), TTL.folders, () =>
      timed('imap.listFolders', { mailbox: this.email }, () =>
        this.run((client) => client.listMailboxes())
      )
    );
  }

  /** Resolves the folder path for a role, creating standard folders on demand. */
  async folderForRole(role) {
    const { roles } = await this.listFolders();
    if (role === 'inbox') return 'INBOX';
    if (roles[role]) return roles[role];
    const path = await this.run((client) => client.ensureRoleFolder(role, roles));
    invalidateMailboxCache(this.email);
    return path;
  }

  async createFolder(path) {
    const result = await this.run(async (client) => {
      const created = await client.createFolder(path);
      await client.subscribeToMailbox(created).catch(() => {});
      return created;
    });
    invalidateMailboxCache(this.email);
    return result;
  }

  async renameFolder(path, newPath) {
    const result = await this.run((client) => client.renameFolder(path, newPath));
    invalidateMailboxCache(this.email);
    return result;
  }

  async deleteFolder(path) {
    await this.run((client) => client.deleteFolder(path));
    invalidateMailboxCache(this.email);
    return true;
  }

  async getFolderStatus(folder) {
    return this.run((client) => client.getMailboxStatus(folder));
  }

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  /**
   * Lists a page of a folder as conversations (default) or single messages.
   * @param {string} folder
   * @param {{ page?: number, pageSize?: number, conversation?: boolean, query?: string, role?: string }} options
   */
  async listMessages(folder, options = {}) {
    const { pageSizeMax } = getConfig().limits;
    const page = Math.max(0, Number(options.page) || 0);
    const pageSize = Math.min(pageSizeMax, Math.max(5, Number(options.pageSize) || 50));
    const conversation = options.conversation !== false;

    if (options.role === 'starred') return this.listStarred({ page, pageSize });

    const parsed = options.query ? parseSearchQuery(options.query) : null;
    const hasQuery = parsed && !isEmptyQuery(parsed);

    return timed(
      'imap.listMessages',
      { mailbox: this.email, folder, page, conversation, search: !!hasQuery },
      async () => {
        if (hasQuery)
          return this.listSearchResults(folder, parsed, { page, pageSize, conversation });
        if (conversation) return this.listConversations(folder, { page, pageSize });

        const result = await this.run((client) => client.listMessages(folder, { page, pageSize }));
        return {
          mode: 'messages',
          folder,
          page,
          pageSize,
          total: result.total,
          items: result.messages.map(messageItem),
        };
      }
    );
  }

  /** Conversation mode backed by the server THREAD extension when available. */
  async listConversations(folder, { page, pageSize }) {
    const threads = await this.getThreadMap(folder);
    if (!threads) {
      // Server cannot thread: fetch a slightly larger page and group locally.
      const result = await this.run((client) => client.listMessages(folder, { page, pageSize }));
      const grouped = buildThreads(result.messages);
      return {
        mode: 'threads',
        folder,
        page,
        pageSize,
        total: result.total,
        items: grouped.map(threadItem),
        localThreading: true,
      };
    }

    const total = threads.length;
    const slice = threads.slice(page * pageSize, page * pageSize + pageSize);
    if (slice.length === 0) return { mode: 'threads', folder, page, pageSize, total, items: [] };

    // Only fetch headers for the newest N messages of very long threads.
    const uidToThread = new Map();
    const uids = [];
    for (const thread of slice) {
      const sorted = [...thread].sort((a, b) => b - a).slice(0, MAX_THREAD_FETCH);
      for (const uid of sorted) {
        uids.push(uid);
        uidToThread.set(uid, thread);
      }
    }

    const summaries = await this.run((client) =>
      client.fetchHeaders(folder, uids, { previews: true })
    );
    const byThread = new Map();
    for (const summary of summaries) {
      const key = uidToThread.get(summary.uid);
      if (!key) continue;
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key).push(summary);
    }

    const items = [];
    for (const thread of slice) {
      const messages = byThread.get(thread);
      if (!messages || messages.length === 0) continue; // expunged since THREAD ran
      const item = threadItem(toThread(messages));
      item.count = thread.length; // real count even if we truncated fetching
      item.uids = [...thread].sort((a, b) => a - b);
      items.push(item);
    }
    return { mode: 'threads', folder, page, pageSize, total, items };
  }

  /**
   * Returns the server-side thread map for a folder (array of UID arrays,
   * newest thread first) or null if the server lacks THREAD support.
   */
  async getThreadMap(folder) {
    const key = mailboxKey(this.email, folder, 'threads');
    const cached = mailCache.get(key);
    if (cached !== undefined) return cached;
    const threads = await this.run((client) => client.threadMailbox(folder));
    if (threads === null) {
      mailCache.set(key, null, TTL.threads);
      return null;
    }
    threads.sort((a, b) => Math.max(...b) - Math.max(...a));
    mailCache.set(key, threads, TTL.threads);
    return threads;
  }

  async listSearchResults(folder, parsed, { page, pageSize, conversation }) {
    const targetFolder = parsed.folder
      ? await this.resolveFolderName(parsed.folder, folder)
      : folder;
    const criteria = toImapSearch(parsed);
    const cacheKey = mailboxKey(this.email, targetFolder, `search:${JSON.stringify(criteria)}`);
    const uids = await mailCache.remember(cacheKey, TTL.search, () =>
      this.run((client) => client.searchMessages(targetFolder, criteria))
    );

    const result = await this.run((client) =>
      client.listMessages(targetFolder, { page, pageSize, uids })
    );
    let messages = result.messages;
    if (parsed.hasAttachment) messages = messages.filter((m) => m.hasAttachment);

    if (conversation) {
      const grouped = buildThreads(messages);
      return {
        mode: 'threads',
        folder: targetFolder,
        page,
        pageSize,
        total: uids.length,
        items: grouped.map(threadItem),
        search: true,
      };
    }
    return {
      mode: 'messages',
      folder: targetFolder,
      page,
      pageSize,
      total: uids.length,
      items: messages.map(messageItem),
      search: true,
    };
  }

  async listStarred({ page, pageSize }) {
    const { folders, roles } = await this.listFolders();
    const candidates = folders
      .filter((f) => f.selectable && !['trash', 'junk', 'drafts'].includes(f.role || ''))
      .slice(0, 25);
    const need = (page + 1) * pageSize;

    const perFolder = await Promise.all(
      candidates.map(async (f) => {
        const key = mailboxKey(this.email, f.path, 'starred');
        const uids = await mailCache.remember(key, TTL.search, () =>
          this.run((client) => client.searchMessages(f.path, { flagged: true }))
        );
        if (uids.length === 0) return { total: 0, messages: [] };
        const result = await this.run((client) =>
          client.listMessages(f.path, { page: 0, pageSize: Math.min(need, 100), uids })
        );
        return { total: uids.length, messages: result.messages };
      })
    );

    const all = perFolder
      .flatMap((r) => r.messages)
      .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
    const total = perFolder.reduce((n, r) => n + r.total, 0);
    const items = all.slice(page * pageSize, page * pageSize + pageSize).map(messageItem);
    return {
      mode: 'messages',
      folder: roles.inbox || 'INBOX',
      role: 'starred',
      page,
      pageSize,
      total,
      items,
    };
  }

  async resolveFolderName(name, fallback) {
    const { folders, roles } = await this.listFolders();
    const lower = name.toLowerCase();
    if (roles[lower]) return roles[lower];
    if (lower === 'inbox') return 'INBOX';
    const match = folders.find(
      (f) => f.path.toLowerCase() === lower || f.name.toLowerCase() === lower
    );
    return match ? match.path : fallback;
  }

  // ---------------------------------------------------------------------------
  // Threads and messages
  // ---------------------------------------------------------------------------

  /**
   * Loads every message of a conversation, including replies the user sent
   * from the Sent folder when they reference the same conversation.
   * @param {string} folder
   * @param {number[]} uids
   */
  async getThread(folder, uids) {
    return timed(
      'imap.getThread',
      { mailbox: this.email, folder, count: uids.length },
      async () => {
        const capped = [...uids].sort((a, b) => b - a).slice(0, MAX_THREAD_FETCH);
        let messages = await this.run((client) =>
          client.fetchHeaders(folder, capped, { previews: false })
        );
        if (messages.length === 0)
          throw errors.notFound('This conversation is no longer available.');

        const { roles } = await this.listFolders();
        const sent = roles.sent;
        if (sent && sent !== folder) {
          const ids = new Set();
          for (const m of messages) {
            if (m.messageId) ids.add(m.messageId);
            for (const r of m.references) ids.add(r);
          }
          const idList = [...ids].slice(0, 12);
          if (idList.length) {
            try {
              const criteria = {
                or: idList.flatMap((id) => [
                  { header: { 'in-reply-to': id } },
                  { header: { references: id } },
                ]),
              };
              const sentUids = await this.run((client) =>
                client.searchMessages(sent, orChain(criteria.or))
              );
              if (sentUids.length) {
                const sentMessages = await this.run((client) =>
                  client.fetchHeaders(sent, sentUids.slice(0, 20))
                );
                messages = messages.concat(sentMessages);
              }
            } catch (error) {
              logger.debug({ err: serializeError(error) }, 'sent-folder thread merge failed');
            }
          }
        }

        const thread = toThread(messages);
        return { ...threadItem(thread), messages: thread.messages.map(messageItem) };
      }
    );
  }

  /** Finds the UIDs of the conversation a message belongs to. */
  async findThreadUids(folder, uid) {
    const map = await this.getThreadMap(folder);
    if (map) {
      const found = map.find((t) => t.includes(uid));
      if (found) return [...found].sort((a, b) => a - b);
    }
    return [uid];
  }

  /**
   * Loads a message body for display. HTML is sanitized; inline images are
   * rewritten to signed URLs; remote images are blocked unless requested.
   * @param {string} folder
   * @param {number} uid
   * @param {{ allowExternalImages?: boolean, sessionId: string, markRead?: boolean }} options
   */
  async getMessage(folder, uid, options) {
    return timed('imap.getMessage', { mailbox: this.email, folder, uid }, async () => {
      // One connection, one EXAMINE, two FETCHes: the body parts can only be
      // named once the structure is known, so both commands run inside a single
      // mailbox lock rather than re-selecting the folder for each of them.
      const loaded = await this.run((client) =>
        client.withMailbox(
          folder,
          async () => {
            const meta = await client.fetchDisplayMeta(uid);
            if (!meta) return null;
            const structure = summarizeStructure(meta.bodyStructure);
            const parts = await client.fetchDecodedParts(
              uid,
              [structure.html?.part, structure.text?.part].filter(Boolean)
            );
            return { meta, summary: client.toSummary(folder, meta), structure, parts };
          },
          { readOnly: true }
        )
      );
      if (!loaded) throw errors.notFound('This message is no longer available.');
      const { meta, summary, structure, parts } = loaded;

      let html = null;
      let text = null;
      let attachments = structure.attachments;
      let inline = structure.inline;
      let usedFallback = false;
      let truncated = false;

      const rawHeaders = parseHeaderBlock(meta.headers);

      // downloadMany() also requests `<part>.MIME` for every part, so only real
      // MIME part numbers may go in here (`HEADER.MIME` is rejected by Dovecot).
      const partsToFetch = [structure.html?.part, structure.text?.part].filter(Boolean);
      if (partsToFetch.length > 0) {
        try {
          const parts = await this.run((client) =>
            client.withMailbox(
              folder,
              () => client.flow.downloadMany(String(uid), partsToFetch, { uid: true }),
              { readOnly: true }
            )
          );
          if (structure.html) {
            const buf = parts?.[structure.html.part]?.content;
            if (buf) html = decodeText(buf, structure.html.charset);
          }
          if (structure.text) {
            const buf = parts?.[structure.text.part]?.content;
            if (buf) {
              text = decodeText(buf, structure.text.charset);
              if (structure.text.flowed) text = unflowText(text);
            }
          }
        } catch (error) {
          // Fall through to parsing the full source below.
          logger.warn({ err: serializeError(error), uid, folder }, 'part download failed');
        }
      }

      if (html === null && text === null) {
        // Odd structure (or single-part message): parse the full source.
        usedFallback = true;
        const src = await this.run((client) => client.fetchSource(folder, uid));
        if (src?.source) {
          truncated = src.truncated;
          try {
            const parsed = await parseFullMessage(src.source);
            html = parsed.html;
            text = parsed.text;
            // Attachments from mailparser cannot be streamed by part number; keep IMAP structure ones.
            if (attachments.length === 0) {
              attachments = parsed.attachments
                .filter((a) => !a.inline)
                .map((a, i) => ({
                  part: `fallback-${i}`,
                  type: a.contentType,
                  filename: a.filename,
                  size: a.size,
                }));
            }
          } catch (error) {
            logger.warn({ err: serializeError(error), uid, folder }, 'fallback parse failed');
            text = src.source.toString('utf8').slice(0, 20000);
          }
        }
      }

      const inlineByCid = new Map(inline.map((p) => [p.contentId, p]));
      const resolveCid = (cid) => {
        const part = inlineByCid.get(cid);
        if (!part) return null;
        return attachmentUrl({ folder, uid, part: part.part, account: this.email, inline: true });
      };

      let body;
      if (html) {
        const sanitized = sanitizeEmailHtml(html, {
          allowExternalImages: !!options.allowExternalImages,
          resolveCid,
        });
        const split = splitQuotedContent(sanitized.html);
        body = {
          kind: 'html',
          html: split.main,
          quoted: split.quoted,
          // Decides whether the reader's theme or the sender's design wins.
          presentation: classifyPresentation(sanitized.html),
          text: text || null,
          blockedImages: sanitized.blockedImages,
          hasExternalContent: sanitized.hasExternalContent,
        };
      } else {
        const split = splitQuotedContent(textToHtml(text || ''));
        body = {
          kind: 'text',
          html: split.main,
          quoted: split.quoted,
          presentation: 'app',
          text: text || '',
          blockedImages: 0,
          hasExternalContent: false,
        };
      }

      // Inline parts that the HTML never referenced should still be downloadable.
      const referenced = new Set(
        [...(html || '').matchAll(/cid:([^"'\s>]+)/gi)].map((m) => m[1].replace(/[<>]/g, ''))
      );
      const extraInline = inline.filter((p) => !referenced.has(p.contentId));

      const attachmentList = [...attachments, ...extraInline].map((p) => ({
        part: p.part,
        filename: p.filename || defaultFilename(p),
        contentType: p.type,
        size: estimateDecodedSize(p.size, p.encoding),
        inline: false,
        url: attachmentUrl({ folder, uid, part: p.part, account: this.email }),
      }));

      if (options.markRead !== false && !summary.flags.seen) {
        this.markRead(folder, [uid], true).catch((error) =>
          logger.debug({ err: serializeError(error) }, 'auto mark read failed')
        );
        summary.flags.seen = true;
      }

      const listUnsubscribe = rawHeaders['list-unsubscribe'] || null;
      const priorityHeader = rawHeaders['x-priority'] || rawHeaders['importance'] || '';
      const priority = /^(1|2|high)/i.test(priorityHeader)
        ? 'high'
        : /^(4|5|low)/i.test(priorityHeader)
          ? 'low'
          : 'normal';

      const envelope = meta.envelope || {};
      rememberAddresses(
        this.email,
        [summary.from, ...summary.to, ...summary.cc].filter(Boolean),
        'received'
      );

      return {
        ...messageItem(summary),
        bcc: [],
        replyTo: (envelope.replyTo || [])
          .map((a) => ({ name: a.name || '', address: (a.address || '').toLowerCase() }))
          .filter((a) => a.address),
        body,
        attachments: attachmentList,
        headers: { listUnsubscribe, priority, autoSubmitted: rawHeaders['auto-submitted'] || null },
        truncated,
        usedFallback,
      };
    });
  }

  /**
   * Streams an attachment part. Returns metadata and a Node readable stream
   * plus a release() callback that must run when streaming finishes.
   */
  async getAttachment(folder, uid, part) {
    if (part.startsWith('fallback-')) {
      // Attachment from the mailparser fallback path: re-parse the source.
      const index = Number(part.slice(9));
      const src = await this.run((client) => client.fetchSource(folder, uid));
      if (!src?.source) throw errors.notFound('Attachment not found.');
      const parsed = await parseFullMessage(src.source);
      const att = parsed.attachments.filter((a) => !a.inline)[index];
      if (!att) throw errors.notFound('Attachment not found.');
      const { Readable } = await import('node:stream');
      return {
        meta: {
          filename: att.filename,
          contentType: att.contentType,
          size: att.content.length,
          exactSize: att.content.length,
        },
        stream: Readable.from([att.content]),
        release: () => {},
      };
    }

    const client = await connectionManager.getConnection(this.credentials);
    // The pool hands a released client to the next waiter, so releasing twice
    // would let two requests drive the same socket. Guard every exit path.
    let released = false;
    const releaseClient = () => {
      if (released) return;
      released = true;
      connectionManager.releaseConnection(client);
    };
    try {
      const meta = await client.fetchBodyStructure(folder, uid);
      const info = meta ? findPart(meta.bodyStructure, part) : null;
      if (!info) throw errors.notFound('Attachment not found.');
      const download = await client.downloadPart(folder, uid, part);
      if (!download) throw errors.notFound('Attachment not found.');
      return {
        meta: {
          filename: info.filename || download.meta.filename || defaultFilename(info),
          contentType: info.type,
          // Transfer-decoded size is unknown until the stream ends.
          size: estimateDecodedSize(info.size, info.encoding),
        },
        stream: download.content,
        release: () => {
          download.release();
          releaseClient();
        },
      };
    } catch (error) {
      if (isConnectionError(error)) client.closed = true;
      releaseClient();
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Sending and drafts
  // ---------------------------------------------------------------------------

  /**
   * Resolves compose attachment references (uploads or parts of existing
   * messages) into buffers for MailComposer.
   * @param {Array<{ source: 'upload'|'message', id?: string, folder?: string, uid?: number, part?: string, filename?: string, cid?: string }>} refs
   * @param {string} sessionId
   */
  async resolveAttachments(refs, sessionId) {
    const out = [];
    for (const ref of refs || []) {
      if (ref.source === 'upload' && ref.id) {
        const upload = await openUpload(sessionId, ref.id);
        out.push({
          filename: upload.meta.filename,
          contentType: upload.meta.contentType,
          content: upload.stream,
          cid: ref.cid,
          size: upload.meta.size,
          uploadId: ref.id,
        });
      } else if (ref.source === 'message' && ref.folder && ref.uid && ref.part) {
        const att = await this.getAttachment(ref.folder, Number(ref.uid), String(ref.part));
        try {
          const chunks = [];
          for await (const chunk of att.stream) chunks.push(chunk);
          out.push({
            filename: ref.filename || att.meta.filename,
            contentType: att.meta.contentType,
            content: Buffer.concat(chunks),
            cid: ref.cid,
            size: att.meta.size,
          });
        } finally {
          att.release();
        }
      }
    }
    const { maxMessageBytes } = getConfig().limits;
    const totalSize = out.reduce((n, a) => n + (a.size || 0), 0);
    if (totalSize > maxMessageBytes)
      throw errors.tooLarge('The attachments are too large to send in one message.');
    return out;
  }

  /**
   * Sends a message via SMTP, appends it to Sent, marks the original as
   * answered/forwarded and removes the draft it was composed from.
   * @param {object} payload compose payload (see API route)
   * @param {{ sessionId: string, fromName?: string }} context
   */
  async sendMessage(payload, context) {
    return timed('mail.send', { mailbox: this.email }, async () => {
      const attachments = await this.resolveAttachments(payload.attachments, context.sessionId);
      const from = { name: context.fromName || '', address: this.email };
      const built = await buildMessage({ from, payload: { ...payload, attachments } });

      await sendRawMessage(this.credentials, built);

      // Copy to Sent (Postfix does not do this for us).
      try {
        const sent = await this.folderForRole('sent');
        await this.run((client) => client.appendMessage(sent, built.raw, ['\\Seen']));
        invalidateMailboxCache(this.email, sent);
      } catch (error) {
        logger.warn(
          { err: serializeError(error), mailbox: this.email },
          'failed to append to Sent'
        );
      }

      if (payload.inReplyToRef?.folder && payload.inReplyToRef?.uid) {
        const flag = payload.inReplyToRef.mode === 'forward' ? 'forwarded' : 'answered';
        this.run((client) =>
          client.setFlags(
            payload.inReplyToRef.folder,
            [Number(payload.inReplyToRef.uid)],
            [flag],
            true
          )
        ).catch(() => {});
      }

      if (payload.draftUid) {
        this.deleteDraft(Number(payload.draftUid)).catch(() => {});
      }
      for (const a of attachments)
        if (a.uploadId) deleteUpload(context.sessionId, a.uploadId).catch(() => {});

      rememberAddresses(
        this.email,
        [...(payload.to || []), ...(payload.cc || []), ...(payload.bcc || [])],
        'sent'
      );
      return { messageId: built.messageId };
    });
  }

  /**
   * Saves (or replaces) a draft in the Drafts folder. Returns the new UID.
   * @param {object} payload
   * @param {number|null} existingUid
   * @param {{ sessionId: string, fromName?: string }} context
   */
  async saveDraft(payload, existingUid, context) {
    return timed('mail.saveDraft', { mailbox: this.email }, async () => {
      const attachments = await this.resolveAttachments(payload.attachments, context.sessionId);
      const from = { name: context.fromName || '', address: this.email };
      const built = await buildMessage({
        from,
        payload: { ...payload, attachments },
        isDraft: true,
      });
      const drafts = await this.folderForRole('drafts');
      const uid = await this.run(async (client) => {
        const newUid = await client.appendMessage(drafts, built.raw, ['\\Draft', '\\Seen']);
        if (existingUid) {
          await client.deleteMessage(drafts, [existingUid]).catch(() => {});
        }
        return newUid;
      });
      invalidateMailboxCache(this.email, drafts);
      return { uid, folder: drafts, messageId: built.messageId };
    });
  }

  async deleteDraft(uid) {
    const drafts = await this.folderForRole('drafts');
    await this.run((client) => client.deleteMessage(drafts, [uid]));
    invalidateMailboxCache(this.email, drafts);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Flags / moves
  // ---------------------------------------------------------------------------

  async markRead(folder, uids, read = true) {
    await this.run((client) =>
      read ? client.markRead(folder, uids) : client.markUnread(folder, uids)
    );
    invalidateFolderCounts(this.email, folder);
    return true;
  }

  async star(folder, uids, starred = true) {
    await this.run((client) =>
      starred ? client.starMessage(folder, uids) : client.unstarMessage(folder, uids)
    );
    mailCache.deletePrefix(`mailbox:${this.email}:`); // starred view spans folders
    return true;
  }

  async moveMessage(folder, uids, destination) {
    const result = await this.run((client) => client.moveMessage(folder, uids, destination));
    invalidateMailboxCache(this.email, folder);
    invalidateMailboxCache(this.email, destination);
    return result;
  }

  async archive(folder, uids) {
    const archive = await this.folderForRole('archive');
    return this.moveMessage(folder, uids, archive);
  }

  async spam(folder, uids) {
    const junk = await this.folderForRole('junk');
    return this.moveMessage(folder, uids, junk);
  }

  async notSpam(folder, uids) {
    return this.moveMessage(folder, uids, 'INBOX');
  }

  /**
   * Deletes messages: moves to Trash, or expunges permanently when already in
   * Trash / Junk or when `permanent` is requested.
   */
  async deleteMessage(folder, uids, { permanent = false } = {}) {
    const { roles } = await this.listFolders();
    const isTrashLike = folder === roles.trash || folder === roles.junk;
    if (permanent || isTrashLike) {
      await this.run((client) => client.deleteMessage(folder, uids));
      invalidateMailboxCache(this.email, folder);
      return { permanent: true };
    }
    const trash = await this.folderForRole('trash');
    await this.moveMessage(folder, uids, trash);
    return { permanent: false, destination: trash };
  }

  // ---------------------------------------------------------------------------
  // Search / diagnostics
  // ---------------------------------------------------------------------------

  async search(query, options = {}) {
    const folder = options.folder || 'INBOX';
    return this.listMessages(folder, { ...options, query });
  }

  // ---------------------------------------------------------------------------
  // Forwarding (Sieve via ManageSieve)
  // ---------------------------------------------------------------------------

  async getForwarding() {
    return readForwarding(this.credentials);
  }

  async setForwarding(input) {
    return writeForwarding(this.credentials, input);
  }

  async status() {
    const imap = await connectionManager
      .healthCheck(this.credentials)
      .catch((error) => ({ ok: false, error: mapMailError(error).message }));
    const [smtp, sieve] = await Promise.all([
      verifySmtp(this.credentials),
      checkSieve(this.credentials),
    ]);
    return { imap, smtp, sieve };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function invalidateFolderCounts(email, folder) {
  mailCache.delete(folderKey(email));
  mailCache.deletePrefix(`mailbox:${email}:${folder}:search`);
}

function orChain(clauses) {
  if (clauses.length === 1) return clauses[0];
  // imapflow `or` takes an array of 2+ clauses.
  return { or: clauses };
}

const DEFAULT_EXTENSIONS = {
  'message/rfc822': 'eml',
  'text/plain': 'txt',
  'text/calendar': 'ics',
  'text/vcard': 'vcf',
  'text/x-vcard': 'vcf',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

function defaultFilename(part) {
  const type = (part.type || '').toLowerCase();
  if (type === 'message/rfc822') {
    const subject = (part.subject || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim();
    return `${subject.slice(0, 80) || 'message'}.eml`;
  }
  const ext = DEFAULT_EXTENSIONS[type] || type.split('/')[1]?.split('+')[0] || 'bin';
  return `attachment.${ext}`;
}

/**
 * URL of a message part. `account` pins the mailbox: these URLs are loaded by
 * <img>, <a> and iframes that cannot send the X-Mailbox header, and must never
 * resolve against whichever mailbox happens to be the browser default.
 */
export function attachmentUrl({ folder, uid, part, account, inline = false }) {
  const params = new URLSearchParams({ folder, uid: String(uid), part: String(part) });
  if (account) params.set('account', account);
  return `/api/attachments${inline ? '/inline' : ''}?${params.toString()}`;
}

/** Public shape of a message summary. */
export function messageItem(m) {
  return {
    type: 'message',
    id: `${m.folder}:${m.uid}`,
    uid: m.uid,
    folder: m.folder,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    subject: m.subject,
    from: m.from,
    to: m.to,
    cc: m.cc,
    date: m.date,
    size: m.size,
    flags: m.flags,
    hasAttachment: m.hasAttachment,
    preview: m.preview,
  };
}

/** Public shape of a conversation row. */
export function threadItem(t) {
  return {
    type: 'thread',
    id: t.id,
    folder: t.latest.folder,
    subject: t.subject,
    count: t.count,
    unread: t.unread,
    starred: t.starred,
    hasAttachment: t.hasAttachment,
    participants: t.participants,
    date: t.date,
    preview: t.latest.preview,
    latestUid: t.latest.uid,
    uids: t.uids,
    flags: t.latest.flags,
  };
}
