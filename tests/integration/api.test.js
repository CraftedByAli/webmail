import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ApiClient, login } from './helpers';
import { resetMockState, mockState } from '@/lib/mail/mock-provider';
import { clearAllRateLimits } from '@/lib/security/rate-limit';

const routes = {};
beforeAll(async () => {
  routes.login = await import('@/app/api/auth/login/route');
  routes.logout = await import('@/app/api/auth/logout/route');
  routes.logoutAll = await import('@/app/api/auth/logout-all/route');
  routes.session = await import('@/app/api/auth/session/route');
  routes.sessions = await import('@/app/api/auth/sessions/route');
  routes.folders = await import('@/app/api/folders/route');
  routes.messages = await import('@/app/api/mail/messages/route');
  routes.message = await import('@/app/api/mail/messages/[uid]/route');
  routes.messageThread = await import('@/app/api/mail/messages/[uid]/thread/route');
  routes.threads = await import('@/app/api/mail/threads/route');
  routes.actions = await import('@/app/api/mail/actions/route');
  routes.send = await import('@/app/api/mail/send/route');
  routes.drafts = await import('@/app/api/drafts/route');
  routes.attachments = await import('@/app/api/attachments/route');
  routes.inline = await import('@/app/api/attachments/inline/route');
  routes.upload = await import('@/app/api/attachments/upload/route');
  routes.search = await import('@/app/api/search/route');
  routes.contacts = await import('@/app/api/contacts/route');
  routes.suggest = await import('@/app/api/contacts/suggest/route');
  routes.preferences = await import('@/app/api/preferences/route');
  routes.signatures = await import('@/app/api/signatures/route');
  routes.health = await import('@/app/api/health/route');
  routes.ready = await import('@/app/api/ready/route');
  routes.diagnostics = await import('@/app/api/admin/diagnostics/route');
});

let api;
beforeEach(() => {
  clearAllRateLimits();
  resetMockState();
  api = new ApiClient();
});

describe('authentication', () => {
  it('rejects invalid credentials without setting a cookie', async () => {
    const r = await login(api, 'test@example.com', 'wrong');
    expect(r.status).toBe(401);
    expect(r.data.error.message).toMatch(/Incorrect/);
    expect(api.cookie).toBeNull();
  });

  it('logs in, sets an HttpOnly cookie and never returns the password', async () => {
    const r = await login(api);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.data)).not.toContain('password123');
    const cookie = r.response.headers.get('set-cookie');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const s = await api.call(routes.session.GET, { path: '/api/auth/session' });
    expect(s.data.user.email).toBe('test@example.com');
    expect(s.data.preferences.inbox.pageSize).toBe(50);
  });

  it('protects routes and enforces CSRF', async () => {
    expect((await api.call(routes.folders.GET, { path: '/api/folders' })).status).toBe(401);
    await login(api);
    const noHeader = await api.call(routes.actions.POST, {
      method: 'POST',
      path: '/api/mail/actions',
      json: {},
      headers: { 'x-requested-with': 'nope' },
    });
    expect(noHeader.status).toBe(403);
  });

  it('throttles repeated failed logins', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await login(api, 'test@example.com', 'wrong');
    expect(last.status).toBe(429);
    expect(last.response.headers.get('retry-after')).toBeTruthy();
  });

  it('supports logout, session listing and logout-all', async () => {
    await login(api);
    const before = (await api.call(routes.sessions.GET, { path: '/api/auth/sessions' })).data
      .sessions.length;
    const other = new ApiClient();
    await login(other);
    const list = await api.call(routes.sessions.GET, { path: '/api/auth/sessions' });
    expect(list.data.sessions.length).toBe(before + 1);
    expect(list.data.sessions.filter((s) => s.current)).toHaveLength(1);
    await api.call(routes.logoutAll.POST, { method: 'POST', path: '/api/auth/logout-all' });
    expect((await other.call(routes.folders.GET, { path: '/api/folders' })).status).toBe(401);
    expect(api.cookie).toBeNull();
  });
});

describe('mail', () => {
  beforeEach(() => login(api));

  it('lists folders with roles and unread counts', async () => {
    const r = await api.call(routes.folders.GET, { path: '/api/folders' });
    expect(r.status).toBe(200);
    expect(r.data.roles).toMatchObject({
      inbox: 'INBOX',
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Trash',
      junk: 'Junk',
    });
    expect(r.data.folders.find((f) => f.path === 'INBOX').unread).toBeGreaterThan(0);
  });

  it('lists the inbox as conversations, newest first, headers only', async () => {
    const r = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=INBOX&pageSize=10',
    });
    expect(r.data.mode).toBe('threads');
    expect(r.data.items.length).toBe(10);
    expect(r.data.total).toBeGreaterThan(10);
    const thread = r.data.items.find((i) => i.subject === 'Meeting tomorrow');
    expect(thread.count).toBe(2);
    expect(thread.uids.length).toBe(2);
    expect(r.data.items[0]).not.toHaveProperty('body');
    const page2 = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=INBOX&pageSize=10&page=1',
    });
    expect(page2.data.items[0].id).not.toBe(r.data.items[0].id);
  });

  it('reads a message safely and marks it read', async () => {
    const r = await api.call(routes.message.GET, {
      path: '/api/mail/messages/1?folder=INBOX',
      params: { uid: '1' },
    });
    expect(r.status).toBe(200);
    expect(r.data.body.kind).toBe('html');
    expect(r.data.body.html).not.toContain('<script');
    expect(r.data.body.blockedImages).toBe(1);
    expect(r.data.flags.seen).toBe(true);
    const withImages = await api.call(routes.message.GET, {
      path: '/api/mail/messages/1?folder=INBOX&images=1',
      params: { uid: '1' },
    });
    expect(withImages.data.body.html).toContain('src="https://tracker.example/pixel.png"');
  });

  it('loads a conversation including sent replies', async () => {
    const list = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=INBOX&pageSize=20',
    });
    const thread = list.data.items.find((i) => i.subject === 'Meeting tomorrow');
    const r = await api.call(routes.threads.GET, {
      path: `/api/mail/threads?folder=INBOX&uids=${thread.uids.join(',')}`,
    });
    expect(r.data.messages.length).toBe(3);
    expect(r.data.messages.map((m) => m.folder)).toContain('Sent');
    const viaMessage = await api.call(routes.messageThread.GET, {
      path: `/api/mail/messages/${thread.uids[0]}/thread?folder=INBOX`,
      params: { uid: String(thread.uids[0]) },
    });
    expect(viaMessage.data.messages.length).toBe(3);
  });

  it('streams attachments with safe headers and refuses non-images inline', async () => {
    const msg = await api.call(routes.message.GET, {
      path: '/api/mail/messages/4?folder=INBOX',
      params: { uid: '4' },
    });
    const att = msg.data.attachments[0];
    expect(att.filename).toBe('agenda.pdf');
    const dl = await api.call(routes.attachments.GET, {
      path: `/api/attachments?folder=INBOX&uid=4&part=${att.part}`,
    });
    expect(dl.status).toBe(200);
    expect(dl.response.headers.get('content-disposition')).toContain(
      'attachment; filename="agenda.pdf"'
    );
    expect(dl.response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await dl.response.text()).toContain('mock agenda');
    const inline = await api.call(routes.inline.GET, {
      path: `/api/attachments/inline?folder=INBOX&uid=4&part=${att.part}`,
    });
    expect(inline.status).toBe(404);
  });

  it('uploads, validates and sends attachments; sends land in Sent', async () => {
    const form = new FormData();
    form.append('file', new File(['hello world'], 'notes.txt', { type: 'text/plain' }));
    const up = await api.call(routes.upload.POST, {
      method: 'POST',
      path: '/api/attachments/upload',
      body: form,
    });
    expect(up.status).toBe(201);
    expect(up.data.contentType).toBe('text/plain');

    const bad = new FormData();
    bad.append('file', new File(['MZ'], 'virus.exe'));
    expect(
      (
        await api.call(routes.upload.POST, {
          method: 'POST',
          path: '/api/attachments/upload',
          body: bad,
        })
      ).status
    ).toBe(400);

    const send = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: {
        to: [{ address: 'john@example.com' }],
        subject: 'With file',
        html: '<p>See attached</p>',
        attachments: [
          { source: 'upload', id: up.data.id },
          { source: 'message', folder: 'INBOX', uid: 4, part: '2' },
        ],
      },
    });
    expect(send.status).toBe(200);
    const sent = mockState.sentLog.at(-1);
    expect(sent.envelope.to).toEqual(['john@example.com']);
    expect(sent.parsed.attachments.map((a) => a.filename)).toEqual(['notes.txt', 'agenda.pdf']);
    const list = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=Sent&conversation=0&pageSize=5',
    });
    expect(list.data.items[0].subject).toBe('With file');
    expect(list.data.items[0].hasAttachment).toBe(true);
  });

  it('rejects invalid send payloads with friendly errors', async () => {
    const r = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: { to: [{ address: 'not-an-email' }], subject: 'x' },
    });
    expect(r.status).toBe(400);
    expect(r.data.error.message).toMatch(/not a valid email/);
    const none = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: { to: [], subject: 'x' },
    });
    expect(none.status).toBe(400);
  });

  it('replies with threading headers and marks the original answered', async () => {
    const orig = await api.call(routes.message.GET, {
      path: '/api/mail/messages/2?folder=INBOX',
      params: { uid: '2' },
    });
    const r = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: {
        to: [orig.data.from],
        subject: `Re: ${orig.data.subject}`,
        html: '<p>ok</p>',
        inReplyTo: orig.data.messageId,
        references: [...orig.data.references, orig.data.messageId],
        inReplyToRef: { folder: 'INBOX', uid: 2, mode: 'reply' },
      },
    });
    expect(r.status).toBe(200);
    const raw = mockState.sentLog.at(-1).raw;
    expect(raw).toContain(`In-Reply-To: <${orig.data.messageId}>`);
    expect(raw).toContain(`References: <${orig.data.messageId}>`);
    const after = await api.call(routes.message.GET, {
      path: '/api/mail/messages/2?folder=INBOX',
      params: { uid: '2' },
    });
    expect(after.data.flags.answered).toBe(true);
  });

  it('forwards attachments from an existing message', async () => {
    const r = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: {
        to: [{ address: 'x@example.com' }],
        subject: 'Fwd: Invoice',
        html: '<p>fyi</p>',
        attachments: [
          { source: 'message', folder: 'INBOX', uid: 5, part: '2', filename: 'invoice-1042.pdf' },
        ],
        inReplyToRef: { folder: 'INBOX', uid: 5, mode: 'forward' },
      },
    });
    expect(r.status).toBe(200);
    expect(mockState.sentLog.at(-1).parsed.attachments[0].filename).toBe('invoice-1042.pdf');
  });

  it('saves drafts without duplicates, restores and deletes them', async () => {
    const first = await api.call(routes.drafts.POST, {
      method: 'POST',
      path: '/api/drafts',
      json: { to: [], subject: 'Draft v1', html: '<p>a</p>' },
    });
    expect(first.status).toBe(200);
    const second = await api.call(routes.drafts.POST, {
      method: 'POST',
      path: '/api/drafts',
      json: {
        to: [{ address: 'a@example.com' }],
        subject: 'Draft v2',
        html: '<p>ab</p>',
        draftUid: first.data.uid,
      },
    });
    const list = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=Drafts&conversation=0',
    });
    expect(list.data.items.map((i) => i.subject)).toEqual(['Draft v2']);
    const restored = await api.call(routes.message.GET, {
      path: `/api/mail/messages/${second.data.uid}?folder=Drafts`,
      params: { uid: String(second.data.uid) },
    });
    expect(restored.data.to[0].address).toBe('a@example.com');
    expect(restored.data.body.html).toContain('ab');
    await api.call(routes.drafts.DELETE, {
      method: 'DELETE',
      path: '/api/drafts',
      json: { uid: second.data.uid },
    });
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Drafts&conversation=0',
        })
      ).data.total
    ).toBe(0);
  });

  it('sending a draft removes it', async () => {
    const d = await api.call(routes.drafts.POST, {
      method: 'POST',
      path: '/api/drafts',
      json: { to: [{ address: 'a@example.com' }], subject: 'To send', html: '<p>x</p>' },
    });
    await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: {
        to: [{ address: 'a@example.com' }],
        subject: 'To send',
        html: '<p>x</p>',
        draftUid: d.data.uid,
      },
    });
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Drafts&conversation=0',
        })
      ).data.total
    ).toBe(0);
  });

  it('applies flag, archive, spam, trash and delete actions', async () => {
    const act = (json) =>
      api.call(routes.actions.POST, { method: 'POST', path: '/api/mail/actions', json });
    expect((await act({ action: 'unread', folder: 'INBOX', uids: [1] })).status).toBe(200);
    expect(
      (
        await api.call(routes.message.GET, {
          path: '/api/mail/messages/1?folder=INBOX&markRead=0',
          params: { uid: '1' },
        })
      ).data.flags.seen
    ).toBe(false);
    await act({ action: 'star', folder: 'INBOX', uids: [1] });
    const starred = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=INBOX&role=starred',
    });
    expect(starred.data.items.map((i) => i.uid)).toContain(1);

    await act({ action: 'archive', folder: 'INBOX', uids: [1] });
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Archive&conversation=0',
        })
      ).data.items.map((i) => i.uid)
    ).toEqual([1]);

    await act({ action: 'spam', folder: 'INBOX', uids: [5] });
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Junk&conversation=0',
        })
      ).data.items.map((i) => i.uid)
    ).toEqual([5]);
    await act({ action: 'notSpam', folder: 'Junk', uids: [5] });

    const trash = await act({ action: 'trash', folder: 'INBOX', uids: [5] });
    expect(trash.data.permanent).toBe(false);
    const forever = await act({ action: 'trash', folder: 'Trash', uids: [5] });
    expect(forever.data.permanent).toBe(true);
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Trash&conversation=0',
        })
      ).data.total
    ).toBe(0);

    await act({ action: 'move', folder: 'INBOX', uids: [2], destination: 'Projects' });
    expect(
      (
        await api.call(routes.messages.GET, {
          path: '/api/mail/messages?folder=Projects&conversation=0',
        })
      ).data.items.map((i) => i.uid)
    ).toContain(2);
    expect((await act({ action: 'bogus', folder: 'INBOX', uids: [1] })).status).toBe(400);
    expect((await act({ action: 'read', folder: 'INBOX', uids: [] })).status).toBe(400);
  });

  it('searches with operators', async () => {
    const r = await api.call(routes.search.GET, {
      path: '/api/search?q=from%3Ajohn%20has%3Aattachment&folder=INBOX',
    });
    expect(r.status).toBe(200);
    expect(r.data.total).toBe(1);
    expect(r.data.items[0].subject).toMatch(/Meeting tomorrow/);
    expect(r.data.parsed.from).toEqual(['john']);
    const unread = await api.call(routes.messages.GET, {
      path: '/api/mail/messages?folder=INBOX&q=is%3Aunread&conversation=0',
    });
    expect(unread.data.items.every((i) => !i.flags.seen)).toBe(true);
  });

  it('creates, renames and deletes custom folders but protects system ones', async () => {
    expect(
      (
        await api.call(routes.folders.POST, {
          method: 'POST',
          path: '/api/folders',
          json: { name: 'Receipts' },
        })
      ).status
    ).toBe(201);
    expect(
      (
        await api.call(routes.folders.POST, {
          method: 'POST',
          path: '/api/folders',
          json: { name: 'Receipts' },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await api.call(routes.folders.PATCH, {
          method: 'PATCH',
          path: '/api/folders',
          json: { path: 'Receipts', name: 'Bills' },
        })
      ).data.path
    ).toBe('Bills');
    expect(
      (
        await api.call(routes.folders.PATCH, {
          method: 'PATCH',
          path: '/api/folders',
          json: { path: 'INBOX', name: 'X' },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await api.call(routes.folders.DELETE, {
          method: 'DELETE',
          path: '/api/folders',
          json: { path: 'Trash' },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await api.call(routes.folders.DELETE, {
          method: 'DELETE',
          path: '/api/folders',
          json: { path: 'Bills' },
        })
      ).status
    ).toBe(200);
    expect(
      (
        await api.call(routes.folders.POST, {
          method: 'POST',
          path: '/api/folders',
          json: { name: 'a/b*c' },
        })
      ).status
    ).toBe(400);
  });
});

describe('preferences, contacts, signatures, ops', () => {
  beforeEach(() => login(api));

  it('validates preference updates', async () => {
    const r = await api.call(routes.preferences.PATCH, {
      method: 'PATCH',
      path: '/api/preferences',
      json: {
        appearance: { theme: 'dark', density: 'huge' },
        inbox: { pageSize: 25 },
        evil: { x: 1 },
      },
    });
    expect(r.data.appearance).toEqual({ theme: 'dark', density: 'comfortable' });
    expect(r.data.inbox.pageSize).toBe(25);
    expect(r.data.evil).toBeUndefined();
  });

  it('manages contacts and suggests addresses from mail activity', async () => {
    const c = await api.call(routes.contacts.POST, {
      method: 'POST',
      path: '/api/contacts',
      json: { name: 'Jane Doe', email: 'jane@example.com', company: 'ACME' },
    });
    expect(c.status).toBe(201);
    expect(
      (
        await api.call(routes.contacts.POST, {
          method: 'POST',
          path: '/api/contacts',
          json: { email: 'bad' },
        })
      ).status
    ).toBe(400);
    await api.call(routes.message.GET, {
      path: '/api/mail/messages/2?folder=INBOX',
      params: { uid: '2' },
    });
    const s = await api.call(routes.suggest.GET, { path: '/api/contacts/suggest?q=j' });
    const addresses = s.data.suggestions.map((x) => x.address);
    expect(addresses).toContain('jane@example.com');
    expect(addresses).toContain('john@example.com');
  });

  it('manages signatures with sanitized html', async () => {
    const r = await api.call(routes.signatures.POST, {
      method: 'POST',
      path: '/api/signatures',
      json: { name: 'Work', html: '<p>Best,<script>x</script> Me</p>', isDefault: true },
    });
    expect(r.status).toBe(201);
    expect(r.data.html).not.toContain('script');
    expect(r.data.isDefault).toBe(true);
  });

  it('exposes health, readiness and admin diagnostics', async () => {
    expect((await routes.health.GET()).status).toBe(200);
    const ready = await routes.ready.GET();
    expect((await ready.json()).status).toBe('ready');
    const d = await api.call(routes.diagnostics.GET, { path: '/api/admin/diagnostics' });
    expect(d.status).toBe(200);
    expect(d.data.imap.ok).toBe(true);
    expect(JSON.stringify(d.data)).not.toContain('password');
  });
});
