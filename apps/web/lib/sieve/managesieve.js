import net from 'node:net';
import tls from 'node:tls';

/**
 * Minimal ManageSieve (RFC 5804) client — enough to list, read, upload,
 * activate and delete a user's Sieve scripts on Dovecot/Pigeonhole (Mailcow
 * serves it on port 4190).
 *
 * Wire format recap:
 *   - server responses end with a line starting OK / NO / BYE, optionally
 *     followed by a response code in parentheses and a human-readable string
 *   - strings are either "quoted" (with \" and \\ escapes) or literals
 *     `{N}` / `{N+}` followed by CRLF and exactly N octets
 *   - clients send literals as `{N+}` (non-synchronising), which RFC 5804
 *     requires servers to accept
 */

export class ManageSieveError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: string, responseCode?: any, cause?: unknown }} [options]
   */
  constructor(message, { code = 'ESIEVE', status, responseCode, cause } = {}) {
    super(message, { cause });
    this.name = 'ManageSieveError';
    this.code = code;
    this.status = status;
    this.responseCode = responseCode;
  }
}

const CRLF = Buffer.from('\r\n');

/** Quotes a string for a ManageSieve command argument. */
export function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Encodes a string as a non-synchronising literal. */
export function literal(value) {
  const data = Buffer.from(String(value), 'utf8');
  return Buffer.concat([Buffer.from(`{${data.length}+}\r\n`), data]);
}

/**
 * Parses as many complete response lines as the buffer holds.
 * A "line" can span several physical lines when it contains literals.
 *
 * @param {Buffer} buffer
 * @returns {{ lines: any[][], rest: Buffer }}
 */
export function parseLines(buffer) {
  const lines = [];
  let offset = 0;
  while (offset < buffer.length) {
    const parsed = parseLine(buffer, offset);
    if (!parsed) break;
    lines.push(parsed.tokens);
    offset = parsed.end;
  }
  return { lines, rest: buffer.subarray(offset) };
}

function parseLine(buf, start) {
  const tokens = [];
  const stack = [tokens];
  let i = start;
  const current = () => stack[stack.length - 1];

  while (i < buf.length) {
    const ch = buf[i];
    if (ch === 0x0d && buf[i + 1] === 0x0a) {
      if (stack.length !== 1) throw new ManageSieveError('Malformed server response');
      return { tokens, end: i + 2 };
    }
    if (ch === 0x0d) {
      if (i + 1 >= buf.length) return null;
      throw new ManageSieveError('Malformed server response');
    }
    if (ch === 0x20) {
      i += 1;
      continue;
    }
    if (ch === 0x28) {
      const list = [];
      current().push(list);
      stack.push(list);
      i += 1;
      continue;
    }
    if (ch === 0x29) {
      stack.pop();
      if (stack.length === 0) throw new ManageSieveError('Malformed server response');
      i += 1;
      continue;
    }
    if (ch === 0x22) {
      let j = i + 1;
      const out = [];
      let done = false;
      while (j < buf.length) {
        const c = buf[j];
        if (c === 0x5c) {
          if (j + 1 >= buf.length) return null;
          out.push(buf[j + 1]);
          j += 2;
          continue;
        }
        if (c === 0x22) {
          done = true;
          break;
        }
        out.push(c);
        j += 1;
      }
      if (!done) return null;
      current().push({ string: Buffer.from(out).toString('utf8') });
      i = j + 1;
      continue;
    }
    if (ch === 0x7b) {
      const close = buf.indexOf(0x7d, i);
      if (close === -1) return null;
      const spec = buf.subarray(i + 1, close).toString('latin1');
      const match = /^(\d+)\+?$/.exec(spec);
      if (!match) throw new ManageSieveError('Malformed literal in server response');
      if (close + 2 >= buf.length) return null;
      if (buf[close + 1] !== 0x0d || buf[close + 2] !== 0x0a) {
        throw new ManageSieveError('Malformed literal in server response');
      }
      const size = Number(match[1]);
      const dataStart = close + 3;
      if (dataStart + size > buf.length) return null;
      current().push({ string: buf.subarray(dataStart, dataStart + size).toString('utf8') });
      i = dataStart + size;
      continue;
    }
    // Atom: up to space, CR, or parenthesis.
    let j = i;
    while (j < buf.length && ![0x20, 0x0d, 0x28, 0x29].includes(buf[j])) j += 1;
    if (j >= buf.length) return null;
    current().push({ atom: buf.subarray(i, j).toString('latin1') });
    i = j;
  }
  return null;
}

const tokenText = (t) => (t && (t.string ?? t.atom)) ?? null;

function flattenCode(list) {
  if (!Array.isArray(list)) return null;
  return list.map((t) => (Array.isArray(t) ? flattenCode(t) : tokenText(t)));
}

/**
 * @typedef {Object} SieveResponse
 * @property {'OK'|'NO'|'BYE'} status
 * @property {string[]|null} code  response code, e.g. ['NONEXISTENT'] or ['QUOTA/MAXSIZE']
 * @property {string} message
 * @property {any[][]} lines  data lines before the status line
 */

export class ManageSieveClient {
  /**
   * @param {{ host: string, port: number, requireTLS?: boolean, rejectUnauthorized?: boolean, timeoutMs?: number, servername?: string }} options
   */
  constructor(options) {
    this.options = { requireTLS: true, rejectUnauthorized: true, timeoutMs: 15_000, ...options };
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.waiter = null;
    this.capabilities = {};
    this.secure = false;
    this.closed = false;
    this.error = null;
  }

  /** Connects, reads capabilities and upgrades to TLS when available/required. */
  async connect() {
    const { host, port, timeoutMs } = this.options;
    const socket = net.connect({ host, port });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          new ManageSieveError('Timed out connecting to the mail filter service', {
            code: 'ETIMEDOUT',
          })
        );
      }, timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.attach(socket);
    this.capabilities = parseCapabilities(await this.readResponse({ expectOk: true }));

    if (this.capabilities.STARTTLS) {
      await this.command('STARTTLS', { expectOk: true });
      await this.upgrade();
      // RFC 5804 §2.2: the server re-announces capabilities after TLS.
      this.capabilities = parseCapabilities(await this.readResponse({ expectOk: true }));
    } else if (this.options.requireTLS) {
      throw new ManageSieveError('The mail filter service does not offer an encrypted connection', {
        code: 'ENOTLS',
      });
    }
    return this.capabilities;
  }

  attach(socket) {
    this.socket = socket;
    socket.setTimeout(this.options.timeoutMs);
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('timeout', () =>
      this.fail(
        new ManageSieveError('The mail filter service stopped responding', { code: 'ETIMEDOUT' })
      )
    );
    socket.on('error', (error) => this.fail(error));
    socket.on('close', () => {
      this.closed = true;
      this.fail(new ManageSieveError('Connection closed', { code: 'ECONNCLOSED' }));
    });
  }

  async upgrade() {
    const plain = this.socket;
    plain.removeAllListeners('data');
    plain.removeAllListeners('timeout');
    plain.removeAllListeners('error');
    plain.removeAllListeners('close');
    plain.setTimeout(0);
    const { host, rejectUnauthorized, timeoutMs, servername } = this.options;
    const secure = await new Promise((resolve, reject) => {
      const s = tls.connect({
        socket: plain,
        servername: servername || (net.isIP(host) ? undefined : host),
        rejectUnauthorized,
        minVersion: 'TLSv1.2',
      });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new ManageSieveError('TLS negotiation timed out', { code: 'ETIMEDOUT' }));
      }, timeoutMs);
      s.once('secureConnect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.buffer = Buffer.alloc(0);
    this.attach(secure);
    this.secure = true;
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let parsed;
    try {
      parsed = parseLines(this.buffer);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.buffer = parsed.rest;
    this.pending.push(...parsed.lines);
    this.flush();
  }

  flush() {
    if (!this.waiter) return;
    const index = this.pending.findIndex((line) => {
      const first = tokenText(line[0]);
      return line[0]?.atom && /^(OK|NO|BYE)$/i.test(first || '');
    });
    if (index === -1) return;
    const data = this.pending.splice(0, index + 1);
    const statusLine = data.pop();
    const { resolve } = this.waiter;
    this.waiter = null;
    const status = tokenText(statusLine[0]).toUpperCase();
    let code = null;
    let message = '';
    for (const token of statusLine.slice(1)) {
      if (Array.isArray(token)) code = flattenCode(token);
      else if (token?.string !== undefined) message = token.string;
    }
    resolve({ status, code, message, lines: data });
  }

  fail(error) {
    if (!this.error) this.error = error;
    if (this.waiter) {
      const { reject } = this.waiter;
      this.waiter = null;
      reject(error);
    }
  }

  /** @returns {Promise<SieveResponse>} */
  readResponse({ expectOk = false } = {}) {
    return new Promise((resolve, reject) => {
      if (this.error && this.pending.length === 0) {
        reject(this.error);
        return;
      }
      this.waiter = {
        resolve: (response) => {
          if (expectOk && response.status !== 'OK') reject(responseError(response));
          else resolve(response);
        },
        reject,
      };
      this.flush();
    });
  }

  /**
   * Sends a command (string parts and/or literal Buffers) and reads its response.
   * @param {string | Array<string|Buffer>} parts
   * @param {{ expectOk?: boolean }} [options]
   */
  async command(parts, options = {}) {
    if (this.closed || !this.socket) {
      throw new ManageSieveError('Not connected to the mail filter service', {
        code: 'ECONNCLOSED',
      });
    }
    const list = Array.isArray(parts) ? parts : [parts];
    const chunks = [];
    list.forEach((part, index) => {
      if (index > 0) chunks.push(Buffer.from(' '));
      chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf8'));
    });
    chunks.push(CRLF);
    const response = this.readResponse(options);
    this.socket.write(Buffer.concat(chunks));
    return response;
  }

  /** SASL PLAIN with the mailbox credentials. */
  async authenticate(user, pass) {
    const mechanisms = (this.capabilities.SASL || '').toUpperCase().split(/\s+/);
    if (this.capabilities.SASL !== undefined && !mechanisms.includes('PLAIN')) {
      throw new ManageSieveError('The mail filter service does not support password sign-in', {
        code: 'ENOAUTH',
      });
    }
    if (!this.secure && this.options.requireTLS) {
      throw new ManageSieveError('Refusing to send the password without encryption', {
        code: 'ENOTLS',
      });
    }
    const token = Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64');
    const response = await this.command(`AUTHENTICATE "PLAIN" ${quote(token)}`);
    if (response.status !== 'OK') {
      const error = responseError(response);
      error.authenticationFailed = true;
      error.code = 'EAUTH';
      throw error;
    }
    return true;
  }

  /** @returns {Promise<Array<{ name: string, active: boolean }>>} */
  async listScripts() {
    const response = await this.command('LISTSCRIPTS', { expectOk: true });
    return response.lines
      .filter((line) => line[0] && line[0].string !== undefined)
      .map((line) => ({
        name: line[0].string,
        active: line.slice(1).some((t) => tokenText(t)?.toUpperCase() === 'ACTIVE'),
      }));
  }

  async getScript(name) {
    const response = await this.command(`GETSCRIPT ${quote(name)}`);
    if (response.status !== 'OK') {
      if (response.code?.[0]?.toUpperCase?.() === 'NONEXISTENT') return null;
      throw responseError(response);
    }
    const first = response.lines.find((l) => l[0]?.string !== undefined);
    return first ? first[0].string : '';
  }

  /** Validates a script without storing it (servers with CHECKSCRIPT). */
  async checkScript(content) {
    if (!this.capabilities.VERSION) return { ok: true };
    const response = await this.command(['CHECKSCRIPT', literal(content)]);
    return response.status === 'OK'
      ? { ok: true, warnings: response.code?.[0] === 'WARNINGS' ? response.message : null }
      : { ok: false, message: response.message };
  }

  async putScript(name, content) {
    const response = await this.command([`PUTSCRIPT ${quote(name)}`, literal(content)]);
    if (response.status !== 'OK') throw responseError(response);
    return response;
  }

  /** Activates a script; an empty name deactivates all scripts. */
  async setActive(name) {
    return this.command(`SETACTIVE ${quote(name || '')}`, { expectOk: true });
  }

  async deleteScript(name) {
    const response = await this.command(`DELETESCRIPT ${quote(name)}`);
    if (response.status !== 'OK' && response.code?.[0]?.toUpperCase?.() !== 'NONEXISTENT') {
      throw responseError(response);
    }
    return response.status === 'OK';
  }

  async logout() {
    if (!this.socket || this.closed) return;
    try {
      await Promise.race([
        this.command('LOGOUT'),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch {
      // closing anyway
    } finally {
      this.close();
    }
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
    this.closed = true;
  }
}

function responseError(response) {
  const code = response.code?.[0] ? String(response.code[0]).toUpperCase() : null;
  return new ManageSieveError(response.message || `Server replied ${response.status}`, {
    code: code === 'QUOTA' || code?.startsWith('QUOTA/') ? 'EQUOTA' : 'ESIEVE',
    status: response.status,
    responseCode: response.code,
  });
}

/** Capability response lines → { SIEVE: 'fileinto …', STARTTLS: '', SASL: 'PLAIN', … }. */
export function parseCapabilities(response) {
  const caps = {};
  for (const line of response.lines) {
    const key = tokenText(line[0]);
    if (!key) continue;
    caps[key.toUpperCase()] = tokenText(line[1]) ?? '';
  }
  return caps;
}

/** The Sieve extensions the server supports, lowercased. */
export function sieveExtensions(capabilities) {
  return new Set(
    String(capabilities?.SIEVE || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Opens an authenticated ManageSieve session, runs `fn`, and always logs out.
 * @template T
 * @param {{ host: string, port: number, requireTLS?: boolean, rejectUnauthorized?: boolean, timeoutMs?: number }} options
 * @param {{ user: string, pass: string }} credentials
 * @param {(client: ManageSieveClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withManageSieve(options, credentials, fn) {
  const client = new ManageSieveClient(options);
  try {
    await client.connect();
    await client.authenticate(credentials.user, credentials.pass);
    return await fn(client);
  } finally {
    await client.logout();
  }
}
