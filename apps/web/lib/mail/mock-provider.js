import { Readable } from 'node:stream';
import { MailProvider } from '@/lib/mail/provider';
import { buildThreads, toThread } from '@/lib/mail/threading';
import { messageItem, threadItem, attachmentUrl } from '@/lib/mail/imap-smtp-provider';
import { sanitizeEmailHtml } from '@/lib/security/sanitize-html';
import { textToHtml } from '@/lib/mime/structure';
import { classifyPresentation, splitQuotedContent } from '@/lib/mime/html-analysis';
import { parseSearchQuery, isEmptyQuery } from '@/lib/search/query-parser';
import { buildMessage } from '@/lib/smtp/compose';
import { openUpload } from '@/lib/mail/attachments';
import { parseFullMessage } from '@/lib/mime/parse';
import { errors } from '@/lib/api/errors';
import { realtimeHub } from '@/lib/realtime/hub';
import { getConfig } from '@/lib/config/env';
import { buildForwardingScript } from '@/lib/sieve/forwarding-script';
import { rememberAddresses } from '@/lib/contacts/repository';

/**
 * In-memory MailProvider used by the test suites (unit, integration and
 * Playwright) so CI never needs a real Mailcow. Refused in production by the
 * config loader. Behaviour mirrors the IMAP provider closely enough that the
 * UI cannot tell the difference.
 */

export const MOCK_USER = process.env.MOCK_MAIL_USER || 'test@example.com';
export const MOCK_PASSWORD = process.env.MOCK_MAIL_PASSWORD || 'password123';

/**
 * Extra mailboxes on the same mock "domain", so multi-mailbox sign-in can be
 * exercised. Each mailbox has its own isolated store, like a real server.
 */
export const MOCK_EXTRA_USERS = (
  process.env.MOCK_MAIL_EXTRA_USERS || 'sales@example.com,support@example.com'
)
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

const statesKey = Symbol.for('webmail.mockStates');
/** @type {Map<string, ReturnType<typeof createState>>} */
const states = globalThis[statesKey] || new Map();
globalThis[statesKey] = states;

function stateFor(email) {
  const key = email.toLowerCase();
  if (!states.has(key)) states.set(key, createState(key));
  return states.get(key);
}

function createState(owner = MOCK_USER) {
  const s = { owner, folders: new Map(), nextUid: 1, sentLog: [], forwarding: null };
  const mk = (path, role) => s.folders.set(path, { path, role, messages: [] });
  mk('INBOX', 'inbox');
  mk('Sent', 'sent');
  mk('Drafts', 'drafts');
  mk('Junk', 'junk');
  mk('Trash', 'trash');
  mk('Archive', 'archive');
  if (owner === MOCK_USER) {
    mk('Projects', null);
    seed(s);
  } else {
    seedExtra(s);
  }
  return s;
}

function seedExtra(s) {
  const now = Date.now();
  const local = s.owner.split('@')[0];
  addMessage(s, 'INBOX', {
    subject: `Welcome to the ${local} mailbox`,
    from: { name: 'OsmicMails', address: 'hello@osmicmails.example' },
    to: [{ name: '', address: s.owner }],
    date: new Date(now - 2 * 3600000).toISOString(),
    text: `This message only exists in ${s.owner}.`,
  });
  addMessage(s, 'INBOX', {
    subject: `Quote request for ${local}`,
    from: { name: 'Priya Patel', address: 'priya@customer.example' },
    to: [{ name: '', address: s.owner }],
    date: new Date(now - 26 * 3600000).toISOString(),
    text: 'Could you send us a quote for 40 seats?',
    attachments: [
      {
        filename: 'requirements.txt',
        contentType: 'text/plain',
        size: 42,
        content: Buffer.from('40 seats\nSSO required\nAnnual billing\n'),
      },
    ],
    flags: { seen: true },
  });
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
    to: m.to || [{ name: '', address: s.owner }],
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
  // A designed HTML newsletter: exercises the 'sender' presentation path,
  // where the message brings its own colours and must not be recoloured.
  addMessage(s, 'INBOX', {
    subject: 'Your weekly deploy report',
    from: { name: 'Build Pipeline', address: 'reports@ci.example' },
    date: new Date(now - 6 * 3600000).toISOString(),
    text: 'Deploy report: 14 successful, 2 failed.',
    html: `<table width="600" cellpadding="0" cellspacing="0" bgcolor="#f4f6fb" style="background-color:#f4f6fb;font-family:Helvetica,Arial,sans-serif">
      <tr><td style="padding:24px 28px 8px">
        <h1 style="margin:0;font-size:20px;color:#101828">Weekly deploy report</h1>
        <p style="margin:6px 0 0;color:#475467;font-size:14px">15&ndash;21 September</p>
      </td></tr>
      <tr><td style="padding:12px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border-radius:8px">
          <tr>
            <td style="padding:16px;color:#101828;font-size:13px">Successful deploys</td>
            <td style="padding:16px;text-align:right;color:#067647;font-size:20px;font-weight:700">14</td>
          </tr>
          <tr>
            <td style="padding:16px;border-top:1px solid #eaecf0;color:#101828;font-size:13px">Failed deploys</td>
            <td style="padding:16px;border-top:1px solid #eaecf0;text-align:right;color:#b42318;font-size:20px;font-weight:700">2</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 28px 28px">
        <a href="https://ci.example/reports/latest" style="display:inline-block;background:#175cd3;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">View full report</a>
      </td></tr>
    </table>`,
    flags: { seen: false },
  });

  // Plain correspondence with a long reply chain: exercises quote trimming.
  addMessage(s, 'INBOX', {
    messageId: 'quoted-chain@example.com',
    subject: 'Re: Server migration window',
    from: { name: 'Sarah Chen', address: 'sarah@example.com' },
    date: new Date(now - 9 * 3600000).toISOString(),
    text: 'Friday after 18:00 works on our side. I will let the team know.',
    html: `<div>Friday after 18:00 works on our side. I will let the team know.</div><div class="gmail_quote"><div>On Fri, 19 Sept 2026 at 09:14, Ali &lt;ali@example.com&gt; wrote:</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex"><div>We need a two-hour window to move the mail server to the new host. Could your team live with Friday evening, after 18:00? Everything should be back before midnight.</div></blockquote></div>`,
    flags: { seen: true },
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
  constructor(credentials) {
    super(credentials);
    this.state = stateFor(this.email);
  }

  static async authenticate(credentials) {
    const user = credentials.user.toLowerCase();
    if (
      (user === MOCK_USER || MOCK_EXTRA_USERS.includes(user)) &&
      credentials.pass === MOCK_PASSWORD
    )
      return true;
    throw errors.unauthorized('Incorrect email or password.');
  }

  folder(path) {
    const f = this.state.folders.get(path);
    if (!f) throw errors.notFound('That folder no longer exists.');
    return f;
  }

  async listFolders() {
    const folders = [...this.state.folders.values()].map((f) => ({
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
    if (this.state.folders.has(path))
      throw errors.badRequest('A folder with that name already exists.');
    this.state.folders.set(path, { path, role: null, messages: [] });
    return path;
  }
  async renameFolder(path, newPath) {
    const f = this.folder(path);
    this.state.folders.delete(path);
    f.path = newPath;
    for (const m of f.messages) m.folder = newPath;
    this.state.folders.set(newPath, f);
    return newPath;
  }
  async deleteFolder(path) {
    this.folder(path);
    this.state.folders.delete(path);
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
      messages = [...this.state.folders.values()].flatMap((f) =>
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
    const sent = this.state.folders.get('Sent');
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
            ? attachmentUrl({ folder, uid, part: a.part, account: this.email, inline: true })
            : null;
        },
      });
      const split = splitQuotedContent(s.html);
      body = {
        kind: 'html',
        html: split.main,
        quoted: split.quoted,
        presentation: classifyPresentation(s.html),
        text: m.text,
        blockedImages: s.blockedImages,
        hasExternalContent: s.hasExternalContent,
      };
    } else {
      const split = splitQuotedContent(textToHtml(m.text));
      body = {
        kind: 'text',
        html: split.main,
        quoted: split.quoted,
        presentation: 'app',
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
        url: attachmentUrl({ folder, uid, part: a.part, account: this.email }),
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
      meta: {
        filename: a.filename,
        contentType: a.contentType,
        size: a.content.length,
        exactSize: a.content.length,
      },
      stream: Readable.from([a.content]),
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
    this.state.sentLog.push({ raw: built.raw.toString('utf8'), envelope: built.envelope, parsed });
    addMessage(this.state, 'Sent', {
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
      const orig = this.state.folders
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
    // Simulate delivery to local mock mailboxes (including yourself) so
    // realtime, multi-mailbox isolation and forwarding can be tested.
    const recipients = [...(payload.to || []), ...(payload.cc || []), ...(payload.bcc || [])]
      .map((r) => String(r.address || '').toLowerCase())
      .filter((a, i, all) => a && all.indexOf(a) === i);
    for (const address of recipients) {
      deliverLocally(address, {
        subject: payload.subject,
        from: { name: context.fromName || '', address: this.email },
        to: payload.to || [],
        text: parsed.text || '',
        html: parsed.html,
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
    const drafts = this.state.folders.get('Drafts');
    if (existingUid) drafts.messages = drafts.messages.filter((m) => m.uid !== Number(existingUid));
    const msg = addMessage(this.state, 'Drafts', {
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
    const drafts = this.state.folders.get('Drafts');
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
    return {
      imap: { ok: true, latencyMs: 1 },
      smtp: { ok: true, latencyMs: 1 },
      sieve: { ok: true, latencyMs: 1 },
    };
  }

  async getForwarding() {
    const f = this.state.forwarding;
    const { sieve } = getConfig();
    const on = !!f?.enabled && f.addresses.length > 0;
    return {
      available: sieve.forwardingEnabled,
      ...(sieve.forwardingEnabled
        ? {}
        : { message: 'Mail forwarding has been turned off by your administrator.' }),
      enabled: on,
      state: on ? 'active' : 'off',
      addresses: f?.addresses || [],
      keepCopy: f?.keepCopy ?? true,
      skipSpam: f?.skipSpam ?? true,
      otherScript: null,
      updatedAt: f?.updatedAt || null,
      limits: {
        maxAddresses: sieve.maxForwardAddresses,
        allowedDomains: sieve.forwardingAllowedDomains,
      },
    };
  }

  async setForwarding(input) {
    if (!getConfig().sieve.forwardingEnabled) {
      throw errors.forbidden('Mail forwarding has been turned off by your administrator.');
    }
    // Build the real script so the mock exercises the same generator.
    this.state.forwardingScript = buildForwardingScript(input);
    this.state.forwarding = { ...input, updatedAt: Date.now() };
    return this.getForwarding();
  }
}

function isMockMailbox(address) {
  return address === MOCK_USER || MOCK_EXTRA_USERS.includes(address);
}

/**
 * Delivers a message into a mock mailbox and applies its forwarding rule the
 * way the Sieve script would on Dovecot (one hop; spam is never forwarded).
 */
function deliverLocally(address, message, { hops = 0 } = {}) {
  if (!isMockMailbox(address)) return;
  const s = stateFor(address);
  const forwarding = s.forwarding;
  const forwards = forwarding?.enabled ? forwarding.addresses : [];
  const keep = !forwards.length || forwarding.keepCopy !== false;
  if (keep) {
    const msg = addMessage(s, 'INBOX', { ...message, date: new Date().toISOString() });
    realtimeHub.publish(address, {
      type: 'new_mail',
      folder: 'INBOX',
      count: s.folders.get('INBOX').messages.length,
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
  if (hops > 0) return;
  for (const target of forwards) {
    s.sentLog.push({ forwardedTo: target, subject: message.subject });
    deliverLocally(target, message, { hops: hops + 1 });
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
export const mockState = stateFor(MOCK_USER);
export function mockStateFor(email) {
  return stateFor(email);
}
export function resetMockState() {
  for (const [email, current] of states) {
    const fresh = createState(email);
    Object.assign(current, fresh);
  }
}
