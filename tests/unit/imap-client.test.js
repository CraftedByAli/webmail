import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises ImapClient against a fake ImapFlow so the IMAP command mapping
 * (ranges, flags, UID mode, THREAD parsing) is verified without a server.
 */

const calls = [];
class FakeImapFlow {
  constructor(options) {
    this.options = options;
    this.usable = true;
    this.capabilities = new Map([
      ['THREAD=REFS', true],
      ['UIDPLUS', true],
    ]);
    this.mailbox = { path: 'INBOX', exists: 120, uidValidity: 1n };
    this.handlers = {};
    this.messages = new Map();
    for (let i = 1; i <= 120; i++) {
      this.messages.set(i, {
        seq: i,
        uid: i,
        size: 100 + i,
        flags: new Set(i % 2 ? ['\\Seen'] : []),
        envelope: {
          subject: `Subject ${i}`,
          messageId: `<m${i}@x>`,
          from: [{ name: 'A', address: 'a@x.com' }],
          to: [{ address: 'me@x.com' }],
          date: new Date(2024, 0, 1, 0, i),
        },
        bodyStructure: {
          part: '1',
          type: 'text/plain',
          encoding: '7bit',
          parameters: { charset: 'utf-8' },
        },
        internalDate: new Date(2024, 0, 1, 0, i),
        headers: Buffer.from(`References: <m${i - 1}@x>\r\n`),
      });
    }
  }
  on(event, fn) {
    this.handlers[event] = fn;
  }
  async connect() {
    calls.push(['connect', this.options.auth.user]);
    if (this.options.auth.pass === 'bad') {
      const err = new Error('AUTHENTICATIONFAILED');
      err.authenticationFailed = true;
      throw err;
    }
  }
  async logout() {
    calls.push(['logout']);
  }
  close() {}
  async noop() {}
  async list() {
    return [
      {
        path: 'INBOX',
        name: 'INBOX',
        delimiter: '/',
        parent: [],
        flags: new Set(),
        status: { messages: 120, unseen: 60 },
        specialUse: '\\Inbox',
      },
      {
        path: 'Sent',
        name: 'Sent',
        delimiter: '/',
        parent: [],
        flags: new Set(),
        specialUse: '\\Sent',
        specialUseSource: 'extension',
      },
      { path: 'Projects', name: 'Projects', delimiter: '/', parent: [], flags: new Set() },
    ];
  }
  async mailboxCreate(path) {
    calls.push(['create', path]);
    return { path };
  }
  async mailboxSubscribe() {
    return true;
  }
  async getMailboxLock(path) {
    calls.push(['lock', path]);
    return { path, release: () => calls.push(['release', path]) };
  }
  async *fetch(range, query, options) {
    calls.push(['fetch', range, Object.keys(query).sort().join(','), !!options?.uid]);
    const ids = expand(range, this.mailbox.exists);
    for (const id of ids) {
      const m = this.messages.get(id);
      if (!m) continue;
      if (query.bodyParts) {
        yield {
          seq: m.seq,
          uid: m.uid,
          bodyParts: new Map([[query.bodyParts[0].key, Buffer.from(`Body of ${m.uid}`)]]),
        };
      } else {
        yield m;
      }
    }
  }
  async messageFlagsAdd(range, flags, options) {
    calls.push(['flagsAdd', range, flags, !!options.uid]);
    return true;
  }
  async messageFlagsRemove(range, flags, options) {
    calls.push(['flagsRemove', range, flags, !!options.uid]);
    return true;
  }
  async messageMove(range, destination, options) {
    calls.push(['move', range, destination, !!options.uid]);
    return { uidMap: new Map([[1, 500]]) };
  }
  async messageDelete(range, options) {
    calls.push(['delete', range, !!options.uid]);
    return true;
  }
  async append(path, content, flags) {
    calls.push(['append', path, content.length, flags]);
    return { uid: 999 };
  }
  async search(query, options) {
    calls.push(['search', JSON.stringify(query), !!options.uid]);
    return [3, 1, 2];
  }
  async exec(command, attributes, options) {
    calls.push(['exec', command, attributes.map((a) => a.value)]);
    await options.untagged.THREAD({
      attributes: [
        [{ value: '1' }, [{ value: '2' }, [{ value: '3' }]]],
        [{ value: '4' }],
        [{ value: 'bogus' }],
      ],
    });
    return { next() {} };
  }
}

function expand(range, exists) {
  const out = [];
  for (const part of String(range).split(',')) {
    if (part.includes(':')) {
      const [a, b] = part.split(':').map((v) => (v === '*' ? exists : Number(v)));
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    } else out.push(Number(part));
  }
  return out;
}

vi.mock('imapflow', () => ({ ImapFlow: FakeImapFlow }));
vi.mock('imapflow/lib/search-compiler', () => ({
  searchCompiler: () => [{ type: 'ATOM', value: 'ALL' }],
}));

const { ImapClient } = await import('@/lib/imap/client');
const { connectionManager } = await import('@/lib/imap/connection-manager');

describe('ImapClient', () => {
  let client;
  beforeEach(async () => {
    calls.length = 0;
    client = new ImapClient({ user: 'me@x.com', pass: 'ok' });
    await client.connect();
  });

  it('lists folders with roles and counts', async () => {
    const { folders, roles } = await client.listMailboxes();
    expect(roles).toEqual({ inbox: 'INBOX', sent: 'Sent' });
    expect(folders[0].unread).toBe(60);
  });

  it('pages newest-first by sequence range and fetches previews in a second pass', async () => {
    const page = await client.listMessages('INBOX', { page: 1, pageSize: 10 });
    expect(page.total).toBe(120);
    expect(page.messages.map((m) => m.uid)).toEqual([
      110, 109, 108, 107, 106, 105, 104, 103, 102, 101,
    ]);
    expect(page.messages[0].preview).toBe('Body of 110');
    expect(page.messages[0].references).toEqual(['m109@x']);
    expect(page.messages[0].flags.seen).toBe(false);
    const fetches = calls.filter((c) => c[0] === 'fetch');
    expect(fetches[0][1]).toBe('101:110');
    expect(fetches[1][3]).toBe(true); // preview pass by UID
    expect(calls.filter((c) => c[0] === 'release')).toHaveLength(1);
  });

  it('returns empty pages beyond the end', async () => {
    const page = await client.listMessages('INBOX', { page: 50, pageSize: 10 });
    expect(page.messages).toEqual([]);
  });

  it('lists explicit UID sets (search results) in UID mode', async () => {
    const page = await client.listMessages('INBOX', {
      page: 0,
      pageSize: 2,
      uids: [7, 5, 3],
      previews: false,
    });
    expect(page.total).toBe(3);
    expect(page.messages.map((m) => m.uid)).toEqual([7, 5]);
    expect(calls.find((c) => c[0] === 'fetch')[3]).toBe(true);
  });

  it('maps flag operations to IMAP system flags in UID mode', async () => {
    await client.markRead('INBOX', [1, 2]);
    await client.unstarMessage('INBOX', [3]);
    expect(calls).toContainEqual(['flagsAdd', '1,2', ['\\Seen'], true]);
    expect(calls).toContainEqual(['flagsRemove', '3', ['\\Flagged'], true]);
  });

  it('moves, deletes, appends and searches', async () => {
    expect(await client.moveMessage('INBOX', [1], 'Archive')).toEqual({ uidMap: { 1: 500 } });
    expect(await client.moveMessage('INBOX', [1], 'INBOX')).toEqual({ uidMap: null });
    await client.deleteMessage('Trash', [4, 5]);
    expect(await client.appendMessage('Drafts', Buffer.from('x'), ['\\Draft'])).toBe(999);
    expect(await client.searchMessages('INBOX', { seen: false })).toEqual([3, 2, 1]);
    expect(calls).toContainEqual(['delete', '4,5', true]);
  });

  it('parses server THREAD responses into flat UID lists', async () => {
    expect(client.threadAlgorithm()).toBe('REFS');
    const threads = await client.threadMailbox('INBOX');
    expect(threads).toEqual([[1, 2, 3], [4]]);
    expect(calls.find((c) => c[0] === 'exec')[1]).toBe('UID THREAD');
  });

  it('creates missing role folders on demand', async () => {
    expect(await client.ensureRoleFolder('archive', { sent: 'Sent' })).toBe('Archive');
    expect(await client.ensureRoleFolder('sent', { sent: 'Sent' })).toBe('Sent');
    expect(calls).toContainEqual(['create', 'Archive']);
  });
});

describe('connectionManager', () => {
  it('reuses idle connections and enforces the pool size', async () => {
    calls.length = 0;
    const creds = { user: 'pool@x.com', pass: 'ok' };
    const a = await connectionManager.getConnection(creds);
    connectionManager.releaseConnection(a);
    const b = await connectionManager.getConnection(creds);
    expect(b).toBe(a);
    connectionManager.releaseConnection(b);
    expect(calls.filter((c) => c[0] === 'connect')).toHaveLength(1);
    const stats = connectionManager.stats();
    expect(stats.connections).toBeGreaterThanOrEqual(1);
    await connectionManager.closeForUser('pool@x.com');
  });

  it('maps authentication failures to a 401 AppError', async () => {
    await expect(
      connectionManager.getConnection({ user: 'bad@x.com', pass: 'bad' })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('retries once on a stale connection', async () => {
    let attempts = 0;
    const result = await connectionManager.withConnection(
      { user: 'retry@x.com', pass: 'ok' },
      async () => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
        return 'done';
      }
    );
    expect(result).toBe('done');
    expect(attempts).toBe(2);
    await connectionManager.closeForUser('retry@x.com');
  });
});
