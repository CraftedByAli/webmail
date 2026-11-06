/**
 * Calls Next.js route handlers directly (they are plain functions taking a
 * Request) so the whole API surface is tested in-process against the mock
 * mail provider — no HTTP server, no Mailcow.
 */

const BASE = 'http://localhost:3000';

export class ApiClient {
  constructor() {
    /** Cookie jar: every cookie the "browser" holds. */
    this.jar = new Map();
  }

  /** The session cookie pair (`wm_session=…`) or null when signed out. */
  get cookie() {
    return this.jar.has('wm_session') ? `wm_session=${this.jar.get('wm_session')}` : null;
  }

  set cookie(value) {
    this.jar.clear();
    if (value) {
      const [k, ...v] = value.split('=');
      this.jar.set(k, v.join('='));
    }
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async call(
    handler,
    { method = 'GET', path = '/api/x', json, body, headers = {}, params = {} } = {}
  ) {
    const init = {
      method,
      headers: {
        'x-requested-with': 'webmail',
        ...(this.jar.size ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
    };
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (body !== undefined) {
      init.body = body;
    }
    const request = new Request(`${BASE}${path}`, init);
    const response = await handler(request, { params: Promise.resolve(params) });
    for (const header of response.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = header.split(';');
      const [name, ...rest] = pair.trim().split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (!value || expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    return { status: response.status, data, response };
  }
}

export async function login(client, email = 'test@example.com', password = 'password123') {
  const { POST } = await import('@/app/api/auth/login/route');
  return client.call(POST, { method: 'POST', path: '/api/auth/login', json: { email, password } });
}
