import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ApiClient, login } from './helpers';
import { resetMockState, mockStateFor } from '@/lib/mail/mock-provider';
import { clearAllRateLimits } from '@/lib/security/rate-limit';

const routes = {};
beforeAll(async () => {
  routes.accounts = await import('@/app/api/auth/accounts/route');
  routes.session = await import('@/app/api/auth/session/route');
  routes.sessions = await import('@/app/api/auth/sessions/route');
  routes.logout = await import('@/app/api/auth/logout/route');
  routes.logoutAll = await import('@/app/api/auth/logout-all/route');
  routes.messages = await import('@/app/api/mail/messages/route');
  routes.message = await import('@/app/api/mail/messages/[uid]/route');
  routes.attachments = await import('@/app/api/attachments/route');
  routes.send = await import('@/app/api/mail/send/route');
  routes.preferences = await import('@/app/api/preferences/route');
  routes.forwarding = await import('@/app/api/forwarding/route');
  routes.forwardingTest = await import('@/app/api/forwarding/test/route');
});

let api;
beforeEach(async () => {
  clearAllRateLimits();
  resetMockState();
  api = new ApiClient();
  await login(api);
});

const as = (account) => ({ 'x-mailbox': account });
const addSales = () =>
  api.call(routes.accounts.POST, {
    method: 'POST',
    path: '/api/auth/accounts',
    json: { email: 'sales@example.com', password: 'password123' },
  });
const inbox = (account) =>
  api.call(routes.messages.GET, {
    path: '/api/mail/messages?folder=INBOX&conversation=0',
    headers: account ? as(account) : {},
  });

describe('multiple mailboxes in one session', () => {
  it('adds a mailbox without replacing the session and rejects wrong passwords', async () => {
    const cookie = api.cookie;
    const bad = await api.call(routes.accounts.POST, {
      method: 'POST',
      path: '/api/auth/accounts',
      json: { email: 'sales@example.com', password: 'nope' },
    });
    expect(bad.status).toBe(401);

    const r = await addSales();
    expect(r.status).toBe(201);
    expect(r.data.accounts.map((a) => a.email)).toEqual(['test@example.com', 'sales@example.com']);
    expect(api.cookie).toBe(cookie);

    const again = await addSales();
    expect(again.status).toBe(200);
    expect(again.data.added).toBe(false);

    const list = await api.call(routes.accounts.GET, { path: '/api/auth/accounts' });
    expect(list.data.accounts[0].status).toMatchObject({ state: 'ok' });
    expect(list.data.accounts[1].status.unread).toBe(1);
  });

  it('keeps every mailbox’s mail separate', async () => {
    await addSales();
    const main = await inbox('test@example.com');
    const sales = await inbox('sales@example.com');
    expect(main.data.total).toBeGreaterThan(50);
    expect(sales.data.total).toBe(2);
    const mainSubjects = main.data.items.map((m) => m.subject);
    const salesSubjects = sales.data.items.map((m) => m.subject);
    expect(salesSubjects.some((s) => mainSubjects.includes(s))).toBe(false);
    expect(salesSubjects).toContain('Welcome to the sales mailbox');

    // Same UID, different mailbox → different message.
    const uid = sales.data.items[0].uid;
    const a = await api.call(routes.message.GET, {
      path: `/api/mail/messages/${uid}?folder=INBOX&markRead=0`,
      params: { uid: String(uid) },
      headers: as('sales@example.com'),
    });
    const b = await api.call(routes.message.GET, {
      path: `/api/mail/messages/${uid}?folder=INBOX&markRead=0`,
      params: { uid: String(uid) },
      headers: as('test@example.com'),
    });
    expect(a.data.subject).not.toBe(b.data.subject);
  });

  it('refuses a request for a mailbox that is not signed in instead of serving another', async () => {
    const r = await inbox('support@example.com');
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe('account_signed_out');
    expect(r.data.error.details.account).toBe('support@example.com');
  });

  it('pins attachment URLs to their mailbox so they work without headers', async () => {
    await addSales();
    const sales = await inbox('sales@example.com');
    const msg = sales.data.items.find((m) => m.hasAttachment);
    const full = await api.call(routes.message.GET, {
      path: `/api/mail/messages/${msg.uid}?folder=INBOX`,
      params: { uid: String(msg.uid) },
      headers: as('sales@example.com'),
    });
    const att = full.data.attachments[0];
    expect(att.url).toContain('account=sales%40example.com');
    const dl = await api.call(routes.attachments.GET, { path: `${att.url}&download=1` });
    expect(dl.status).toBe(200);
    const body = await dl.response.text();
    expect(body).toContain('SSO required');
    expect(Number(dl.response.headers.get('content-length'))).toBe(Buffer.byteLength(body));
  });

  it('stores preferences per mailbox', async () => {
    await addSales();
    await api.call(routes.preferences.PATCH, {
      method: 'PATCH',
      path: '/api/preferences',
      json: { inbox: { pageSize: 25 } },
      headers: as('sales@example.com'),
    });
    const sales = await api.call(routes.session.GET, {
      path: '/api/auth/session',
      headers: as('sales@example.com'),
    });
    const main = await api.call(routes.session.GET, {
      path: '/api/auth/session',
      headers: as('test@example.com'),
    });
    expect(sales.data.preferences.inbox.pageSize).toBe(25);
    expect(main.data.preferences.inbox.pageSize).toBe(50);
    expect(sales.data.accounts).toEqual(['test@example.com', 'sales@example.com']);
  });

  it('sends from the mailbox named by the request', async () => {
    await addSales();
    const r = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      headers: as('sales@example.com'),
      json: { to: [{ address: 'support@example.com' }], subject: 'From sales', html: '<p>Hi</p>' },
    });
    expect(r.status).toBe(200);
    expect(mockStateFor('sales@example.com').sentLog.at(-1).parsed.from.address).toBe(
      'sales@example.com'
    );
    expect(mockStateFor('support@example.com').folders.get('INBOX').messages.at(-1).subject).toBe(
      'From sales'
    );
    expect(
      mockStateFor('test@example.com').sentLog.some((s) => s.parsed?.subject === 'From sales')
    ).toBe(false);
  });

  it('signs one mailbox out, then the last one clears the cookie', async () => {
    await addSales();
    const r = await api.call(routes.accounts.DELETE, {
      method: 'DELETE',
      path: '/api/auth/accounts',
      json: { email: 'test@example.com' },
    });
    expect(r.data).toMatchObject({ signedOut: false, next: 'sales@example.com' });
    expect(
      (await inbox()).data.items.some((m) => m.subject === 'Welcome to the sales mailbox')
    ).toBe(true);
    expect((await inbox('test@example.com')).status).toBe(401);

    const last = await api.call(routes.accounts.DELETE, {
      method: 'DELETE',
      path: '/api/auth/accounts',
      json: { email: 'sales@example.com' },
    });
    expect(last.data.signedOut).toBe(true);
    expect(api.cookie).toBeNull();
  });

  it('"sign out everywhere" for one mailbox keeps the other signed in here', async () => {
    await addSales();
    const r = await api.call(routes.logoutAll.POST, {
      method: 'POST',
      path: '/api/auth/logout-all',
      headers: as('sales@example.com'),
    });
    expect(r.data).toMatchObject({ signedOut: false, next: 'test@example.com' });
    expect((await inbox('test@example.com')).status).toBe(200);
    expect((await inbox('sales@example.com')).status).toBe(401);
  });

  it('logout signs the browser out of every mailbox', async () => {
    await addSales();
    await api.call(routes.logout.POST, { method: 'POST', path: '/api/auth/logout' });
    const r = await api.call(routes.messages.GET, { path: '/api/mail/messages?folder=INBOX' });
    expect(r.status).toBe(401);
  });

  it('logging in again from the login route adds to the existing session', async () => {
    const cookie = api.cookie;
    const r = await login(api, 'support@example.com', 'password123');
    expect(r.status).toBe(200);
    expect(r.data.accounts).toEqual(['test@example.com', 'support@example.com']);
    expect(api.cookie).toBe(cookie);
  });
});

describe('forwarding API', () => {
  it('reads defaults, validates, saves, and forwards delivered mail', async () => {
    await addSales();
    const initial = await api.call(routes.forwarding.GET, {
      path: '/api/forwarding',
      headers: as('sales@example.com'),
    });
    expect(initial.data).toMatchObject({
      available: true,
      enabled: false,
      state: 'off',
      addresses: [],
    });

    const self = await api.call(routes.forwarding.PUT, {
      method: 'PUT',
      path: '/api/forwarding',
      headers: as('sales@example.com'),
      json: { enabled: true, addresses: ['sales@example.com'] },
    });
    expect(self.status).toBe(400);
    expect(self.data.error.message).toMatch(/itself/);

    const saved = await api.call(routes.forwarding.PUT, {
      method: 'PUT',
      path: '/api/forwarding',
      headers: as('sales@example.com'),
      json: { enabled: true, addresses: ['Support@Example.com'], keepCopy: true, skipSpam: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({
      enabled: true,
      state: 'active',
      addresses: ['support@example.com'],
    });
    expect(mockStateFor('sales@example.com').forwardingScript).toContain(
      'redirect :copy "support@example.com";'
    );

    // Forwarding is per mailbox: the main mailbox is untouched.
    const other = await api.call(routes.forwarding.GET, {
      path: '/api/forwarding',
      headers: as('test@example.com'),
    });
    expect(other.data.enabled).toBe(false);

    const before = mockStateFor('support@example.com').folders.get('INBOX').messages.length;
    const sent = await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      headers: as('test@example.com'),
      json: {
        to: [{ address: 'sales@example.com' }],
        subject: 'Order #7',
        html: '<p>New order</p>',
      },
    });
    expect(sent.status).toBe(200);
    expect(mockStateFor('sales@example.com').folders.get('INBOX').messages.at(-1).subject).toBe(
      'Order #7'
    );
    const support = mockStateFor('support@example.com').folders.get('INBOX').messages;
    expect(support.length).toBe(before + 1);
    expect(support.at(-1).subject).toBe('Order #7');

    const test = await api.call(routes.forwardingTest.POST, {
      method: 'POST',
      path: '/api/forwarding/test',
      headers: as('sales@example.com'),
    });
    expect(test.data).toMatchObject({ ok: true, forwardedTo: ['support@example.com'] });
    expect(
      mockStateFor('support@example.com').folders.get('INBOX').messages.at(-1).subject
    ).toMatch(/forwarding test/);
  });

  it('forwards without keeping a copy when asked, and turning off stops forwarding', async () => {
    await addSales();
    await api.call(routes.forwarding.PUT, {
      method: 'PUT',
      path: '/api/forwarding',
      headers: as('sales@example.com'),
      json: { enabled: true, addresses: ['support@example.com'], keepCopy: false },
    });
    const salesBefore = mockStateFor('sales@example.com').folders.get('INBOX').messages.length;
    await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: { to: [{ address: 'sales@example.com' }], subject: 'No copy', html: '<p>x</p>' },
    });
    expect(mockStateFor('sales@example.com').folders.get('INBOX').messages.length).toBe(
      salesBefore
    );
    expect(mockStateFor('support@example.com').folders.get('INBOX').messages.at(-1).subject).toBe(
      'No copy'
    );

    const off = await api.call(routes.forwarding.PUT, {
      method: 'PUT',
      path: '/api/forwarding',
      headers: as('sales@example.com'),
      json: { enabled: false, addresses: ['support@example.com'] },
    });
    expect(off.data).toMatchObject({
      enabled: false,
      state: 'off',
      addresses: ['support@example.com'],
    });
    const supportBefore = mockStateFor('support@example.com').folders.get('INBOX').messages.length;
    await api.call(routes.send.POST, {
      method: 'POST',
      path: '/api/mail/send',
      json: { to: [{ address: 'sales@example.com' }], subject: 'After off', html: '<p>x</p>' },
    });
    expect(mockStateFor('support@example.com').folders.get('INBOX').messages.length).toBe(
      supportBefore
    );
    expect(mockStateFor('sales@example.com').folders.get('INBOX').messages.at(-1).subject).toBe(
      'After off'
    );
  });

  it('refuses a forwarding test while forwarding is off', async () => {
    const r = await api.call(routes.forwardingTest.POST, {
      method: 'POST',
      path: '/api/forwarding/test',
    });
    expect(r.status).toBe(400);
  });
});
