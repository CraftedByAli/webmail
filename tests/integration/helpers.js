/**
 * Calls Next.js route handlers directly (they are plain functions taking a
 * Request) so the whole API surface is tested in-process against the mock
 * mail provider — no HTTP server, no Mailcow.
 */

const BASE = 'http://localhost:3000';

export class ApiClient {
  constructor() {
    this.cookie = null;
  }

  async call(
    handler,
    { method = 'GET', path = '/api/x', json, body, headers = {}, params = {} } = {}
  ) {
    const init = {
      method,
      headers: {
        'x-requested-with': 'webmail',
        ...(this.cookie ? { cookie: this.cookie } : {}),
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
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      this.cookie = pair.endsWith('=') ? null : pair;
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
