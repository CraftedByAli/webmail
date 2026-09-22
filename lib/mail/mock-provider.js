import { Readable } from 'node:stream';
import { MailProvider } from '@/lib/mail/provider';
import { buildThreads, toThread } from '@/lib/mail/threading';
import { messageItem, threadItem } from '@/lib/mail/imap-smtp-provider';
import { sanitizeEmailHtml } from '@/lib/security/sanitize-html';
import { textToHtml } from '@/lib/mime/structure';
import { parseSearchQuery, isEmptyQuery } from '@/lib/search/query-parser';
import { buildMessage } from '@/lib/smtp/compose';
import { openUpload } from '@/lib/mail/attachments';
import { parseFullMessage } from '@/lib/mime/parse';
import { errors } from '@/lib/api/errors';
import { realtimeHub } from '@/lib/realtime/hub';
import { rememberAddresses } from '@/lib/contacts/repository';

/**
 * In-memory MailProvider used by the test suites (unit, integration and
 * Playwright) so CI never needs a real Mailcow. Refused in production by the
 * config loader. Behaviour mirrors the IMAP provider closely enough that the
 * UI cannot tell the difference.
 */

export const MOCK_USER = process.env.MOCK_MAIL_USER || 'test@example.com';
export const MOCK_PASSWORD = process.env.MOCK_MAIL_PASSWORD || 'password123';

const state = globalThis[Symbol.for('webmail.mockState')] || createState();
globalThis[Symbol.for('webmail.mockState')] = state;

function createState() {
  const s = { folders: new Map(), nextUid: 1, sentLog: [] };
  const mk = (path, role) => s.folders.set(path, { path, role, messages: [] });
  mk('INBOX', 'inbox');
  mk('Sent', 'sent');
  mk('Drafts', 'drafts');
  mk('Junk', 'junk');
  mk('Trash', 'trash');
  mk('Archive', 'archive');
  mk('Projects', null);
  seed(s);
  return s;
}

function addMessage(s, folder, m) {
  const uid = s.nextUid++;
  const msg = {
    uid,
    folder,
    messageId: m.messageId || `mock-${uid}@example.com`,
    inReplyTo: m.inReplyTo || null,
    references: m.references || [],
    subject: m.subject || '',
    from: m.from || { name: 'Mock Sender', address: 'sender@example.com' },
    to: m.to || [{ name: '', address: MOCK_USER }],
    cc: m.cc || [],
    bcc: m.bcc || [],
    date: m.date || new Date().toISOString(),
    size: m.size || 2048,
    flags: {
      seen: false,
      flagged: false,
      answered: false,
      draft: false,
      deleted: false,
      forwarded: false,
      ...(m.flags || {}),
    },
    hasAttachment: !!(m.attachments && m.attachments.length),
    preview: (m.text || '').slice(0, 120),
    html: m.html || null,
    text: m.text || '',
    attachments: (m.attachments || []).map((a, i) => ({ part: String(i + 2), ...a })),
  };
  s.folders.get(folder).messages.push(msg);
  return msg;
}

function seed(s) {
  const day = 86400000;
  const now = Date.now();
  addMessage(s, 'INBOX', {
    subject: 'Welcome to your new webmail',
    from: { name: 'Mailcow Team', address: 'team@mailcow.example' },
    date: new Date(now - 5 * day).toISOString(),
    html: '<p>Hello!</p><p>This is a <b>test</b> message with an <a href="https://example.com">external link</a> and a blocked image <img src="https://tracker.example/pixel.png" width="200" height="100"></p><script>alert(1)</script>',
    text: 'Hello! This is a test message.',
    flags: { seen: true },
  });
  const root = addMessage(s, 'INBOX', {
    messageId: 'thread-root@example.com',
    subject: 'Meeting tomorrow',
    from: { name: 'John Smith', address: 'john@example.com' },
    date: new Date(now - 2 * day).toISOString(),
    text: 'Can we meet tomorrow at 10?',
    flags: { seen: true },
  });
  addMessage(s, 'Sent', {
    messageId: 'thread-reply-1@example.com',
    inReplyTo: root.messageId,
    references: [root.messageId],
    subject: 'Re: Meeting tomorrow',
    from: { name: 'Me', address: MOCK_USER },
    to: [{ name: 'John Smith', address: 'john@example.com' }],
    date: new Date(now - 2 * day + 3600000).toISOString(),
    text: 'Sure, 10 works.',
    flags: { seen: true },
  });
  addMessage(s, 'INBOX', {
    messageId: 'thread-reply-2@example.com',
    inReplyTo: 'thread-reply-1@example.com',
    references: [root.messageId, 'thread-reply-1@example.com'],
    subject: 'Re: Meeting tomorrow',
    from: { name: 'John Smith', address: 'john@example.com' },
    date: new Date(now - day).toISOString(),
    text: 'Great, see you then. Agenda attached.',
    attachments: [
      {
        filename: 'agenda.pdf',
        contentType: 'application/pdf',
        size: 1024,
        content: Buffer.from('%PDF-1.4 mock agenda'),
      },
    ],
  });
  addMessage(s, 'INBOX', {
    subject: 'Invoice #1042',
    from: { name: 'Ali', address: 'ali@example.com' },
    date: new Date(now - 3600000).toISOString(),
    text: 'Please find the invoice attached. Total: $1,200.',
    attachments: [
      {
        filename: 'invoice-1042.pdf',
        contentType: 'application/pdf',
        size: 4096,
        content: Buffer.from('%PDF-1.4 mock invoice'),
      },
    ],
    flags: { flagged: true },
  });
  for (let i = 0; i < 60; i++) {
    addMessage(s, 'INBOX', {
      subject: `Newsletter issue #${i + 1}`,
      from: { name: 'Weekly Digest', address: 'digest@example.com' },
      date: new Date(now - (10 + i) * day).toISOString(),
      text: `Issue ${i + 1} of the weekly digest. Lorem ipsum dolor sit amet.`,
      flags: { seen: i % 3 !== 0 },
    });
  }
  addMessage(s, 'Projects', {
    subject: 'Project kickoff notes',
    from: { name: 'Sarah', address: 'sarah@example.com' },
    date: new Date(now - 4 * day).toISOString(),
    text: 'Notes from the kickoff meeting.',
  });
}

export class MockMailProvider extends MailProvider {
  static async authenticate(credentials) {
    if (credentials.user.toLowerCase() === MOCK_USER && credentials.pass === MOCK_PASSWORD)
      return true;
    throw errors.unauthorized('Incorrect email or password.');
  }

  folder(path) {
    const f = state.folders.get(path);
    if (!f) throw errors.notFound('That folder no longer exists.');
    return f;
  }

  async listFolders() {
    const folders = [...state.folders.values()].map((f) => ({
      id: f.path,
      path: f.path,
      name: f.path === 'INBOX' ? 'Inbox' : f.path,
      delimiter: '/',
      parentPath: '',
      role: f.role,
      selectable: true,
      subscribed: true,
      total: f.messages.length,
      unread: f.messages.filter((m) => !m.flags.seen).length,
    }));
    const roles = {};
    for (const f of folders) if (f.role) roles[f.role] = f.path;
    return { folders, roles };
  }

  async createFolder(path) {
    if (state.folders.has(path)) throw errors.badRequest('A folder with that name already exists.');
    state.folders.set(path, { path, role: null, messages: [] });
    return path;
  }
  async renameFolder(path, newPath) {
    const f = this.folder(path);
    state.folders.delete(path);
    f.path = newPath;
    for (const m of f.messages) m.folder = newPath;
    state.folders.set(newPath, f);
    return newPath;
  }
  async deleteFolder(path) {
    this.folder(path);
    state.folders.delete(path);
    return true;
  }
  async getFolderStatus(folder) {
    const f = this.folder(folder);
    return {
      path: folder,
      total: f.messages.length,
      unread: f.messages.filter((m) => !m.flags.seen).length,
    };
  }

  async listMessages(folder, options = {}) {
    const page = Number(options.page) || 0;
    const pageSize = Number(options.pageSize) || 50;
    const conversation = options.conversation !== false;
    let messages;
    if (options.role === 'starred') {
      messages = [...state.folders.values()].flatMap((f) =>
        f.messages.filter((m) => m.flags.flagged)
      );
    } else {
      messages = [...this.folder(folder).messages];
    }
    const parsed = options.query ? parseSearchQuery(options.query) : null;
    if (parsed && !isEmptyQuery(parsed)) messages = messages.filter((m) => matches(m, parsed));
    messages.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    if (conversation && options.role !== 'starred') {
      const threads = buildThreads(messages);
      const slice = threads.slice(page * pageSize, page * pageSize + pageSize);
      return {
        mode: 'threads',
        folder,
        page,
        pageSize,
        total: threads.length,
        items: slice.map(threadItem),
      };
    }
    const slice = messages.slice(page * pageSize, page * pageSize + pageSize);
    return {
      mode: 'messages',
      folder,
      page,
      pageSize,
      total: messages.length,
      items: slice.map(messageItem),
    };
  }

  async getThread(folder, uids) {
    const f = this.folder(folder);
    let messages = f.messages.filter((m) => uids.includes(m.uid));
    if (messages.length === 0) throw errors.notFound('This conversation is no longer available.');
    const ids = new Set(messages.flatMap((m) => [m.messageId, ...m.references]));
    const sent = state.folders.get('Sent');
    if (sent && folder !== 'Sent') {
      messages = messages.concat(sent.messages.filter((m) => m.inReplyTo && ids.has(m.inReplyTo)));
    }
    const thread = toThread(messages);
    return { ...threadItem(thread), messages: thread.messages.map(messageItem) };
  }

  async findThreadUids(folder, uid) {
    const list = await this.listMessages(folder, { conversation: true, pageSize: 100 });
    const t = list.items.find((i) => i.uids.includes(uid));
    return t ? t.uids : [uid];
  }

  async getMessage(folder, uid, options = {}) {
    const m = this.folder(folder).messages.find((x) => x.uid === Number(uid));
    if (!m) throw errors.notFound('This message is no longer available.');
    if (options.markRead !== false) m.flags.seen = true;
    rememberAddresses(this.email, [m.from, ...m.to, ...m.cc].filter(Boolean), 'received');
    let body;
    if (m.html) {
      const s = sanitizeEmailHtml(m.html, {
        allowExternalImages: !!options.allowExternalImages,
        resolveCid: (cid) => {
          const a = m.attachments.find((x) => x.contentId === cid);
          return a
            ? `/api/attachments/inline?folder=${encodeURIComponent(folder)}&uid=${uid}&part=${a.part}`
            : null;
        },
      });
      body = {
        kind: 'html',
        html: s.html,
        text: m.text,
        blockedImages: s.blockedImages,
        hasExternalContent: s.hasExternalContent,
      };
    } else {
      body = {
        kind: 'text',
        html: textToHtml(m.text),
        text: m.text,
        blockedImages: 0,
        hasExternalContent: false,
      };
    }
    return {
      ...messageItem(m),
      bcc: m.bcc,
      replyTo: [],
      body,
      attachments: m.attachments.map((a) => ({
        part: a.part,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        inline: false,
        url: `/api/attachments?folder=${encodeURIComponent(folder)}&uid=${uid}&part=${a.part}`,
      })),
      headers: { listUnsubscribe: null, priority: 'normal', autoSubmitted: null },
      truncated: false,
      usedFallback: false,
    };
  }

  async getAttachment(folder, uid, part) {
    const m = this.folder(folder).messages.find((x) => x.uid === Number(uid));
    const a = m?.attachments.find((x) => x.part === part);
    if (!a) throw errors.notFound('Attachment not found.');
    return {
      meta: { filename: a.filename, contentType: a.contentType, size: a.size },
      stream: Readable.from(a.content),
      release: () => {},
    };
  }

  async resolveAttachments(refs, sessionId) {
    const out = [];
    for (const ref of refs || []) {
      if (ref.source === 'upload') {
        const up = await openUpload(sessionId, ref.id);
        const chunks = [];
        for await (const c of up.stream) chunks.push(c);
        out.push({
          filename: up.meta.filename,
          contentType: up.meta.contentType,
          content: Buffer.concat(chunks),
          size: up.meta.size,
        });
      } else if (ref.source === 'message') {
        const att = await this.getAttachment(ref.folder, ref.uid, String(ref.part));
        const chunks = [];
        for await (const c of att.stream) chunks.push(c);
        out.push({
          filename: ref.filename || att.meta.filename,
          contentType: att.meta.contentType,
          content: Buffer.concat(chunks),
          size: att.meta.size,
        });
      }
    }
    return out;
  }

  async sendMessage(payload, context) {
    const attachments = await this.resolveAttachments(payload.attachments, context.sessionId);
    const built = await buildMessage({
      from: { name: context.fromName || '', address: this.email },
      payload: { ...payload, attachments },
    });
    const parsed = await parseFullMessage(built.raw);
    state.sentLog.push({ raw: built.raw.toString('utf8'), envelope: built.envelope, parsed });
    addMessage(state, 'Sent', {
      messageId: built.messageId,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
      subject: payload.subject,
      from: { name: context.fromName || '', address: this.email },
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      html: parsed.html,
      text: parsed.text,
      flags: { seen: true },
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
      })),
    });
    if (payload.inReplyToRef?.folder && payload.inReplyToRef?.uid) {
      const orig = state.folders
        .get(payload.inReplyToRef.folder)
        ?.messages.find((m) => m.uid === Number(payload.inReplyToRef.uid));
      if (orig)
        orig.flags[payload.inReplyToRef.mode === 'forward' ? 'forwarded' : 'answered'] = true;
    }
    if (payload.draftUid) await this.deleteDraft(Number(payload.draftUid)).catch(() => {});
    rememberAddresses(
      this.email,
      [...(payload.to || []), ...(payload.cc || []), ...(payload.bcc || [])],
      'sent'
    );
    // Simulate a delivery loop-back so realtime can be tested: mail to self lands in INBOX.
    if ((payload.to || []).some((t) => t.address === this.email)) {
      const msg = addMessage(state, 'INBOX', {
        subject: payload.subject,
        from: { name: context.fromName || '', address: this.email },
        text: parsed.text || '',
        html: parsed.html,
      });
      realtimeHub.publish(this.email, {
        type: 'new_mail',
        folder: 'INBOX',
        count: state.folders.get('INBOX').messages.length,
        messages: [
          {
            uid: msg.uid,
            subject: msg.subject,
            from: msg.from,
            date: msg.date,
            preview: msg.preview,
            flags: msg.flags,
          },
        ],
        at: Date.now(),
      });
    }
    return { messageId: built.messageId };
  }

  async saveDraft(payload, existingUid, context) {
    const attachments = await this.resolveAttachments(payload.attachments, context.sessionId);
    const built = await buildMessage({
      from: { name: context.fromName || '', address: this.email },
      payload: { ...payload, attachments },
      isDraft: true,
    });
    const parsed = await parseFullMessage(built.raw);
    const drafts = state.folders.get('Drafts');
    if (existingUid) drafts.messages = drafts.messages.filter((m) => m.uid !== Number(existingUid));
    const msg = addMessage(state, 'Drafts', {
      messageId: built.messageId,
      subject: payload.subject,
      from: { name: context.fromName || '', address: this.email },
      to: payload.to || [],
      cc: payload.cc || [],
      bcc: payload.bcc || [],
      html: parsed.html,
      text: parsed.text,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
      flags: { seen: true, draft: true },
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
      })),
    });
    return { uid: msg.uid, folder: 'Drafts', messageId: built.messageId };
  }

  async deleteDraft(uid) {
    const drafts = state.folders.get('Drafts');
    drafts.messages = drafts.messages.filter((m) => m.uid !== Number(uid));
    return true;
  }

  async markRead(folder, uids, read = true) {
    for (const m of this.folder(folder).messages) if (uids.includes(m.uid)) m.flags.seen = read;
    return true;
  }
  async star(folder, uids, starred = true) {
    for (const m of this.folder(folder).messages)
      if (uids.includes(m.uid)) m.flags.flagged = starred;
    return true;
  }
  async moveMessage(folder, uids, destination) {
    const src = this.folder(folder);
    const dst = this.folder(destination);
    const moving = src.messages.filter((m) => uids.includes(m.uid));
    src.messages = src.messages.filter((m) => !uids.includes(m.uid));
    for (const m of moving) {
      m.folder = destination;
      dst.messages.push(m);
    }
    return { uidMap: null };
  }
  async archive(folder, uids) {
    return this.moveMessage(folder, uids, 'Archive');
  }
  async spam(folder, uids) {
    return this.moveMessage(folder, uids, 'Junk');
  }
  async notSpam(folder, uids) {
    return this.moveMessage(folder, uids, 'INBOX');
  }
  async deleteMessage(folder, uids, { permanent = false } = {}) {
    const f = this.folder(folder);
    if (permanent || f.role === 'trash' || f.role === 'junk') {
      f.messages = f.messages.filter((m) => !uids.includes(m.uid));
      return { permanent: true };
    }
    await this.moveMessage(folder, uids, 'Trash');
    return { permanent: false, destination: 'Trash' };
  }
  async search(query, options = {}) {
    return this.listMessages(options.folder || 'INBOX', { ...options, query });
  }
  async status() {
    return { imap: { ok: true, latencyMs: 1 }, smtp: { ok: true, latencyMs: 1 } };
  }
}

function matches(m, q) {
  const has = (list, v) =>
    list.some((x) => `${x.name} ${x.address}`.toLowerCase().includes(v.toLowerCase()));
  if (q.from.some((v) => !has([m.from], v))) return false;
  if (q.to.some((v) => !has(m.to, v))) return false;
  if (q.subject.some((v) => !m.subject.toLowerCase().includes(v.toLowerCase()))) return false;
  if (
    q.text.some(
      (v) =>
        !`${m.subject} ${m.text} ${m.from.name} ${m.from.address}`
          .toLowerCase()
          .includes(v.toLowerCase())
    )
  )
    return false;
  if (q.hasAttachment && !m.hasAttachment) return false;
  if (q.unread === true && m.flags.seen) return false;
  if (q.unread === false && !m.flags.seen) return false;
  if (q.starred === true && !m.flags.flagged) return false;
  if (q.after && Date.parse(m.date) < Date.parse(q.after)) return false;
  if (q.before && Date.parse(m.date) > Date.parse(q.before)) return false;
  return true;
}

/** Test hooks. */
export const mockState = state;
export function resetMockState() {
  const fresh = createState();
  state.folders = fresh.folders;
  state.nextUid = fresh.nextUid;
  state.sentLog = [];
}
