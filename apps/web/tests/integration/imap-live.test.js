import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Optional live test against a real Mailcow/Dovecot mailbox. Skipped unless
 * LIVE_IMAP_USER / LIVE_IMAP_PASS (and MAIL_IMAP_HOST etc.) are set:
 *
 *   LIVE_IMAP_USER=you@example.com LIVE_IMAP_PASS=... MAIL_IMAP_HOST=mail.example.com \
 *   MAIL_SMTP_HOST=mail.example.com npm run test:integration
 *
 * It only reads mail and appends/deletes a draft in the Drafts folder.
 */
const live = !!(process.env.LIVE_IMAP_USER && process.env.LIVE_IMAP_PASS);

describe.skipIf(!live)('live IMAP (Mailcow)', () => {
  let provider;
  let ImapSmtpProvider;
  let connectionManager;

  beforeAll(async () => {
    process.env.MAIL_PROVIDER = 'imap';
    const { resetConfigForTests } = await import('@/lib/config/env');
    resetConfigForTests();
    ({ ImapSmtpProvider } = await import('@/lib/mail/imap-smtp-provider'));
    ({ connectionManager } = await import('@/lib/imap/connection-manager'));
    const credentials = { user: process.env.LIVE_IMAP_USER, pass: process.env.LIVE_IMAP_PASS };
    await ImapSmtpProvider.authenticate(credentials);
    provider = new ImapSmtpProvider(credentials);
  });

  afterAll(async () => {
    await connectionManager?.shutdown();
  });

  it('rejects bad credentials', async () => {
    await expect(
      ImapSmtpProvider.authenticate({ user: process.env.LIVE_IMAP_USER, pass: 'definitely-wrong' })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('lists folders with roles', async () => {
    const { folders, roles } = await provider.listFolders();
    expect(folders.some((f) => f.path === 'INBOX')).toBe(true);
    expect(roles.inbox).toBe('INBOX');
  });

  it('lists inbox conversations and reads a message', async () => {
    const list = await provider.listMessages('INBOX', { page: 0, pageSize: 10 });
    expect(list.total).toBeGreaterThanOrEqual(0);
    if (list.items.length) {
      const first = list.items[0];
      const uid = first.type === 'thread' ? first.latestUid : first.uid;
      const message = await provider.getMessage('INBOX', uid, {
        sessionId: 'live',
        markRead: false,
      });
      expect(message.uid).toBe(uid);
      expect(message.body.html).toBeDefined();
    }
  });

  it('saves and deletes a draft', async () => {
    const draft = await provider.saveDraft(
      { to: [], subject: `Live test ${Date.now()}`, html: '<p>draft</p>', attachments: [] },
      null,
      { sessionId: 'live' }
    );
    expect(draft.uid).toBeGreaterThan(0);
    await provider.deleteDraft(draft.uid);
  });

  it('searches', async () => {
    const result = await provider.search('is:unread', { folder: 'INBOX', page: 0, pageSize: 5 });
    expect(Array.isArray(result.items)).toBe(true);
  });
});
