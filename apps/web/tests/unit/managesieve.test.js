import net from 'node:net';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ManageSieveClient,
  parseLines,
  quote,
  literal,
  withManageSieve,
} from '@/lib/sieve/managesieve';
import {
  FORWARDING_SCRIPT_NAME,
  buildForwardingScript,
  parseForwardingScript,
  sieveString,
} from '@/lib/sieve/forwarding-script';
import { mapSieveError, normalizeForwardingInput } from '@/lib/forwarding/service';

describe('ManageSieve wire parsing', () => {
  it('parses atoms, quoted strings with escapes and response codes', () => {
    const { lines, rest } = parseLines(
      Buffer.from('"SIEVE" "fileinto copy"\r\nNO (QUOTA/MAXSIZE) "Too \\"big\\" \\\\ here"\r\n')
    );
    expect(rest.length).toBe(0);
    expect(lines[0]).toEqual([{ string: 'SIEVE' }, { string: 'fileinto copy' }]);
    expect(lines[1][0]).toEqual({ atom: 'NO' });
    expect(lines[1][1]).toEqual([{ atom: 'QUOTA/MAXSIZE' }]);
    expect(lines[1][2]).toEqual({ string: 'Too "big" \\ here' });
  });

  it('parses literals, including multi-line and UTF-8 content', () => {
    const body = 'require "copy";\r\n# héllo\r\n';
    const bytes = Buffer.byteLength(body);
    const { lines } = parseLines(Buffer.from(`{${bytes}}\r\n${body}\r\nOK\r\n`));
    expect(lines[0]).toEqual([{ string: body }]);
    expect(lines[1]).toEqual([{ atom: 'OK' }]);
  });

  it('waits for more data when a line or literal is incomplete', () => {
    const partial = parseLines(Buffer.from('{10}\r\nabc'));
    expect(partial.lines).toHaveLength(0);
    expect(partial.rest.toString()).toBe('{10}\r\nabc');
    const quoted = parseLines(Buffer.from('"unterminated'));
    expect(quoted.lines).toHaveLength(0);
  });

  it('rejects malformed input instead of looping', () => {
    expect(() => parseLines(Buffer.from('OK\rX\r\n'))).toThrow();
    expect(() => parseLines(Buffer.from('{abc}\r\nx\r\n'))).toThrow();
  });

  it('quotes arguments and encodes non-synchronising literals by byte length', () => {
    expect(quote('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(literal('é').toString()).toBe('{2+}\r\né');
  });
});

/**
 * A tiny in-memory ManageSieve server good enough to exercise the client and
 * the forwarding service end to end (no TLS: requireTLS is off in tests).
 */
function createFakeServer({
  user = 'u@example.com',
  pass = 'pw',
  extensions = 'fileinto copy include',
} = {}) {
  const state = { scripts: new Map(), active: null, log: [] };
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let authed = false;
    const send = (s) => socket.write(s);
    const caps = () =>
      `"IMPLEMENTATION" "Fake"\r\n"SASL" "PLAIN"\r\n"SIEVE" "${extensions}"\r\n"VERSION" "1.0"\r\nOK "ready"\r\n`;
    send(caps());

    const handle = (line, lit) => {
      const [cmd] = line.split(' ');
      state.log.push(cmd.toUpperCase());
      const arg = (i = 0) =>
        [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)][i]?.[1]?.replace(/\\(.)/g, '$1');
      switch (cmd.toUpperCase()) {
        case 'AUTHENTICATE': {
          const [, u, p] = Buffer.from(arg(1), 'base64').toString().split('\u0000');
          if (u === user && p === pass) {
            authed = true;
            return send('OK "Logged in."\r\n');
          }
          return send('NO "Authentication failed."\r\n');
        }
        case 'LOGOUT':
          send('OK "Bye."\r\n');
          return socket.end();
      }
      if (!authed) return send('NO "Not authenticated"\r\n');
      switch (cmd.toUpperCase()) {
        case 'LISTSCRIPTS': {
          let out = '';
          for (const name of state.scripts.keys()) {
            // Mix quoted and literal names like real servers may.
            out += name.includes(' ') ? `{${Buffer.byteLength(name)}}\r\n${name}` : `"${name}"`;
            out += state.active === name ? ' ACTIVE\r\n' : '\r\n';
          }
          return send(`${out}OK "Listscripts completed."\r\n`);
        }
        case 'GETSCRIPT': {
          const s = state.scripts.get(arg(0));
          if (s === undefined) return send('NO (NONEXISTENT) "Script does not exist."\r\n');
          return send(`{${Buffer.byteLength(s)}}\r\n${s}\r\nOK "Getscript completed."\r\n`);
        }
        case 'PUTSCRIPT':
          if (/redirect\s+:copy/.test(lit) && !extensions.includes('copy'))
            return send('NO "line 5: unknown tagged argument \':copy\'"\r\n');
          state.scripts.set(arg(0), lit);
          return send('OK "Putscript completed."\r\n');
        case 'SETACTIVE': {
          const name = arg(0);
          if (name && !state.scripts.has(name))
            return send('NO (NONEXISTENT) "Script does not exist."\r\n');
          state.active = name || null;
          return send('OK "Setactive completed."\r\n');
        }
        case 'DELETESCRIPT':
          if (state.active === arg(0)) return send('NO (ACTIVE) "Script is active."\r\n');
          state.scripts.delete(arg(0));
          return send('OK "Deletescript completed."\r\n');
        default:
          return send('NO "Unknown command"\r\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const eol = buffer.indexOf('\r\n');
        if (eol === -1) return;
        const line = buffer.subarray(0, eol).toString();
        const m = /\{(\d+)\+?\}$/.exec(line);
        if (m) {
          const size = Number(m[1]);
          const start = eol + 2;
          if (buffer.length < start + size + 2) return;
          const lit = buffer.subarray(start, start + size).toString();
          buffer = buffer.subarray(start + size + 2);
          handle(line.replace(/\s*\{\d+\+?\}$/, ''), lit);
        } else {
          buffer = buffer.subarray(eol + 2);
          handle(line, null);
        }
      }
    });
    socket.on('error', () => {});
  });
  return { server, state };
}

describe('ManageSieve client against a fake server', () => {
  let fake;
  let port;
  const opts = () => ({ host: '127.0.0.1', port, requireTLS: false, timeoutMs: 3000 });

  beforeAll(async () => {
    fake = createFakeServer();
    await new Promise((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    port = fake.server.address().port;
  });
  afterAll(() => new Promise((resolve) => fake.server.close(resolve)));
  beforeEach(() => {
    fake.state.scripts.clear();
    fake.state.active = null;
    fake.state.log = [];
  });

  it('refuses to authenticate without TLS unless explicitly allowed', async () => {
    const client = new ManageSieveClient({ ...opts(), requireTLS: true });
    await expect(client.connect()).rejects.toMatchObject({ code: 'ENOTLS' });
    client.close();
  });

  it('reports bad credentials as an authentication failure', async () => {
    await expect(
      withManageSieve(opts(), { user: 'u@example.com', pass: 'nope' }, async () => {})
    ).rejects.toMatchObject({ authenticationFailed: true });
  });

  it('uploads, lists (quoted + literal names), reads, activates and deletes scripts', async () => {
    const creds = { user: 'u@example.com', pass: 'pw' };
    const script = 'require "fileinto";\r\n# ünïcode\r\nkeep;\r\n';
    await withManageSieve(opts(), creds, async (client) => {
      expect(client.capabilities.SIEVE).toContain('copy');
      await client.putScript('my filters', script);
      await client.putScript('b', 'keep;\r\n');
      await client.setActive('my filters');
      const list = await client.listScripts();
      expect(list).toEqual([
        { name: 'my filters', active: true },
        { name: 'b', active: false },
      ]);
      expect(await client.getScript('my filters')).toBe(script);
      expect(await client.getScript('missing')).toBeNull();
      await expect(client.deleteScript('my filters')).rejects.toThrow(/active/i);
      expect(await client.deleteScript('b')).toBe(true);
    });
    expect(fake.state.log.at(-1)).toBe('LOGOUT');
  });
});

describe('forwarding script', () => {
  it('builds a copy-keeping, spam-skipping script that round-trips its settings', () => {
    const script = buildForwardingScript(
      {
        enabled: true,
        addresses: ['a@x.com', 'b@y.org', 'a@x.com'],
        keepCopy: true,
        skipSpam: true,
      },
      { updatedAt: 123 }
    );
    expect(script).toContain('require ["copy"];');
    expect(script).toContain('redirect :copy "a@x.com";');
    expect(script.match(/redirect/g)).toHaveLength(2);
    expect(script).toContain('header :contains "X-Spam-Flag" "YES"');
    expect(script).not.toContain('include');
    expect(parseForwardingScript(script)).toMatchObject({
      enabled: true,
      addresses: ['a@x.com', 'b@y.org'],
      keepCopy: true,
      skipSpam: true,
      previous: null,
      updatedAt: 123,
    });
  });

  it('forwards without keeping a copy and keeps previously active filters running', () => {
    const script = buildForwardingScript({
      enabled: true,
      addresses: ['a@x.com'],
      keepCopy: false,
      skipSpam: false,
      previous: 'sogo "rules"',
    });
    expect(script).toContain('require ["include"];');
    expect(script).toContain('redirect "a@x.com";');
    expect(script).not.toContain(':copy');
    expect(script).not.toContain('X-Spam');
    expect(script).toContain('include :personal :optional "sogo \\"rules\\"";');
  });

  it('keeps the address list but no redirect when turned off', () => {
    const script = buildForwardingScript({ enabled: false, addresses: ['a@x.com'] });
    expect(script).not.toMatch(/^redirect|\sredirect /m);
    expect(parseForwardingScript(script)).toMatchObject({ enabled: false, addresses: ['a@x.com'] });
  });

  it('ignores foreign or damaged scripts', () => {
    expect(parseForwardingScript('keep;')).toBeNull();
    expect(parseForwardingScript('# osmicmails-forwarding-config: {oops')).toBeNull();
    expect(parseForwardingScript(null)).toBeNull();
    expect(sieveString('x"\\')).toBe('"x\\"\\\\"');
  });
});

describe('forwarding input validation', () => {
  const mailbox = 'me@example.com';
  it('normalises, dedupes and lowercases', () => {
    expect(
      normalizeForwardingInput(
        { enabled: true, addresses: [' A@X.com ', 'a@x.com', ''], keepCopy: false },
        { mailbox }
      )
    ).toEqual({ enabled: true, addresses: ['a@x.com'], keepCopy: false, skipSpam: true });
  });

  it('rejects self-forwarding, invalid addresses, too many and empty-while-enabled', () => {
    expect(() =>
      normalizeForwardingInput({ enabled: true, addresses: ['ME@example.com'] }, { mailbox })
    ).toThrow(/itself/);
    expect(() =>
      normalizeForwardingInput({ enabled: true, addresses: ['nope'] }, { mailbox })
    ).toThrow(/valid/);
    expect(() =>
      normalizeForwardingInput(
        { enabled: true, addresses: ['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co'] },
        { mailbox }
      )
    ).toThrow(/at most 4/);
    expect(() => normalizeForwardingInput({ enabled: true, addresses: [] }, { mailbox })).toThrow(
      /Add the address/
    );
    expect(normalizeForwardingInput({ enabled: false, addresses: [] }, { mailbox }).enabled).toBe(
      false
    );
  });

  it('maps transport failures to a clear "unavailable" error', () => {
    expect(mapSieveError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })).code).toBe(
      'forwarding_unavailable'
    );
    expect(mapSieveError(Object.assign(new Error('x'), { authenticationFailed: true })).code).toBe(
      'invalid_credentials'
    );
    expect(mapSieveError(Object.assign(new Error('syntax'), { code: 'ESIEVE' })).message).toMatch(
      /syntax/
    );
  });
});

describe('forwarding service against a fake ManageSieve server', () => {
  let fake;
  let service;
  const creds = { user: 'u@example.com', pass: 'pw' };

  beforeAll(async () => {
    fake = createFakeServer();
    await new Promise((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    process.env.MAIL_SIEVE_PORT = String(fake.server.address().port);
    process.env.MAIL_SIEVE_HOST = '127.0.0.1';
    process.env.MAIL_SIEVE_REQUIRE_TLS = 'false';
    const { resetConfigForTests } = await import('@/lib/config/env');
    resetConfigForTests();
    service = await import('@/lib/forwarding/service');
  });
  afterAll(async () => {
    delete process.env.MAIL_SIEVE_PORT;
    delete process.env.MAIL_SIEVE_HOST;
    delete process.env.MAIL_SIEVE_REQUIRE_TLS;
    (await import('@/lib/config/env')).resetConfigForTests();
    await new Promise((resolve) => fake.server.close(resolve));
  });
  beforeEach(() => {
    fake.state.scripts.clear();
    fake.state.active = null;
  });

  it('reports "off" for a mailbox without scripts', async () => {
    const state = await service.readForwarding(creds);
    expect(state).toMatchObject({ available: true, enabled: false, state: 'off', addresses: [] });
  });

  it('enables forwarding, keeps an existing active filter running, and restores it when disabled', async () => {
    fake.state.scripts.set('roundcube', 'require "fileinto"; fileinto "Work";\r\n');
    fake.state.active = 'roundcube';

    const on = await service.writeForwarding(creds, {
      enabled: true,
      addresses: ['out@elsewhere.org'],
      keepCopy: true,
      skipSpam: true,
    });
    expect(on).toMatchObject({ enabled: true, state: 'active', otherScript: 'roundcube' });
    expect(fake.state.active).toBe(FORWARDING_SCRIPT_NAME);
    const script = fake.state.scripts.get(FORWARDING_SCRIPT_NAME);
    expect(script).toContain('redirect :copy "out@elsewhere.org";');
    expect(script).toContain('include :personal :optional "roundcube";');

    // Another app re-activates its own script: forwarding shows as overridden.
    fake.state.active = 'roundcube';
    expect((await service.readForwarding(creds)).state).toBe('overridden');
    fake.state.active = FORWARDING_SCRIPT_NAME;

    const off = await service.writeForwarding(creds, {
      enabled: false,
      addresses: ['out@elsewhere.org'],
      keepCopy: true,
      skipSpam: true,
    });
    expect(off).toMatchObject({ enabled: false, state: 'off', addresses: ['out@elsewhere.org'] });
    expect(fake.state.active).toBe('roundcube');
  });

  it('deactivates cleanly when there was no previous script', async () => {
    await service.writeForwarding(creds, {
      enabled: true,
      addresses: ['a@b.co'],
      keepCopy: true,
      skipSpam: true,
    });
    expect(fake.state.active).toBe(FORWARDING_SCRIPT_NAME);
    await service.writeForwarding(creds, {
      enabled: false,
      addresses: ['a@b.co'],
      keepCopy: true,
      skipSpam: true,
    });
    expect(fake.state.active).toBeNull();
  });

  it('returns "unavailable" instead of failing when ManageSieve is unreachable', async () => {
    process.env.MAIL_SIEVE_PORT = '1';
    (await import('@/lib/config/env')).resetConfigForTests();
    const state = await service.readForwarding(creds);
    expect(state.available).toBe(false);
    expect(state.message).toMatch(/ManageSieve/);
    process.env.MAIL_SIEVE_PORT = String(fake.server.address().port);
    (await import('@/lib/config/env')).resetConfigForTests();
  });
});
