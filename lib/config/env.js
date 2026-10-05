/**
 * Centralised, validated environment configuration.
 *
 * Every other server module reads configuration from here rather than from
 * `process.env` directly, so misconfiguration fails fast and in one place.
 */

const isProd = process.env.NODE_ENV === 'production';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/** @type {ReturnType<typeof buildConfig> | null} */
let cached = null;

function buildConfig() {
  const provider = (process.env.MAIL_PROVIDER || 'imap').toLowerCase();
  if (provider === 'mock' && isProd) {
    // The mock provider is for automated tests only. End-to-end tests run
    // against a production build, so allow it there with an explicit opt-in.
    if (process.env.ALLOW_MOCK_PROVIDER !== 'true') {
      throw new Error(
        'MAIL_PROVIDER=mock is not allowed in production (set ALLOW_MOCK_PROVIDER=true only for E2E tests)'
      );
    }
    console.warn(
      'WARNING: running with the MOCK mail provider in production mode. Never do this on a real deployment.'
    );
  }

  const sessionSecret = process.env.SESSION_SECRET || '';
  if (isProd && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }

  // Certificate name to verify when the mail hosts are internal names such as
  // dovecot-mailcow / postfix-mailcow (same-host Mailcow integration). The
  // connection goes to the internal host; TLS still verifies the public name.
  const tlsServername = (process.env.MAIL_TLS_SERVERNAME || '').trim() || undefined;

  const config = {
    isProd,
    isTest: process.env.NODE_ENV === 'test' || provider === 'mock',
    app: {
      url: process.env.APP_URL || 'http://localhost:3000',
      version: process.env.APP_VERSION || process.env.npm_package_version || '0.1.0',
      adminEmails: (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      /** Serve the public integration docs at /docs. */
      docsEnabled: bool(process.env.DOCS_ENABLED, true),
    },
    proxy: {
      // Number of reverse proxies in front of the app that append to
      // X-Forwarded-For (Nginx/Caddy/Traefik = 1, Cloudflare + Nginx = 2).
      // Only the entry added by the outermost trusted proxy is believed, so a
      // client cannot spoof its IP to dodge login throttling.
      hops: Math.min(10, Math.max(0, int(process.env.TRUST_PROXY_HOPS, 1))),
      // Trust CF-Connecting-IP. Only enable when the origin accepts traffic
      // from Cloudflare alone; otherwise anyone can set the header.
      trustCloudflare: bool(process.env.TRUST_CLOUDFLARE, false),
    },
    session: {
      secret: sessionSecret || 'dev-insecure-secret-do-not-use-in-production',
      ttlHours: int(process.env.SESSION_TTL_HOURS, 168),
      cookieName: 'wm_session',
      /** Non-secret hint remembering the last mailbox used in this browser. */
      accountCookieName: 'wm_account',
      maxAccounts: Math.min(20, Math.max(1, int(process.env.MAX_MAILBOXES_PER_SESSION, 10))),
    },
    provider,
    imap: {
      host: provider === 'mock' ? 'mock' : required('MAIL_IMAP_HOST'),
      port: int(process.env.MAIL_IMAP_PORT, 993),
      tls: bool(process.env.MAIL_IMAP_TLS, true),
      rejectUnauthorized: bool(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true),
      servername: tlsServername,
      poolSize: int(process.env.IMAP_POOL_SIZE, 3),
      idleTimeoutMs: int(process.env.IMAP_IDLE_TIMEOUT_SECONDS, 300) * 1000,
    },
    smtp: {
      host: provider === 'mock' ? 'mock' : required('MAIL_SMTP_HOST'),
      port: int(process.env.MAIL_SMTP_PORT, 587),
      secure: bool(process.env.MAIL_SMTP_SECURE, false),
      requireTLS: bool(process.env.MAIL_SMTP_REQUIRE_TLS, true),
      rejectUnauthorized: bool(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true),
      servername: tlsServername,
    },
    sieve: {
      // Mailcow's Dovecot serves ManageSieve (RFC 5804) on 4190 with STARTTLS.
      enabled: provider === 'mock' ? true : bool(process.env.MAIL_SIEVE_ENABLED, true),
      host:
        process.env.MAIL_SIEVE_HOST ||
        (provider === 'mock' ? 'mock' : process.env.MAIL_IMAP_HOST || 'localhost'),
      port: int(process.env.MAIL_SIEVE_PORT, 4190),
      // true = STARTTLS required before authenticating (never send passwords in clear).
      requireTLS: bool(process.env.MAIL_SIEVE_REQUIRE_TLS, true),
      rejectUnauthorized: bool(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true),
      servername: tlsServername,
      timeoutMs: int(process.env.MAIL_SIEVE_TIMEOUT_SECONDS, 15) * 1000,
      // Dovecot's default sieve_max_redirects is 4 (Mailcow raises it to 100).
      maxForwardAddresses: Math.min(20, Math.max(1, int(process.env.MAX_FORWARD_ADDRESSES, 4))),
      forwardingEnabled: bool(process.env.MAIL_FORWARDING_ENABLED, true),
      // Optional allow-list of destination domains (empty = any domain).
      forwardingAllowedDomains: (process.env.MAIL_FORWARDING_ALLOWED_DOMAINS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    },
    limits: {
      maxAttachmentBytes: int(process.env.MAX_ATTACHMENT_SIZE_MB, 50) * 1024 * 1024,
      maxMessageBytes: int(process.env.MAX_MESSAGE_SIZE_MB, 60) * 1024 * 1024,
      pageSizeMax: 100,
    },
    storage: {
      databasePath: process.env.DATABASE_PATH || './data/webmail.db',
      uploadDir: process.env.UPLOAD_DIR || './data/uploads',
    },
    log: {
      level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
      format: process.env.LOG_FORMAT || (isProd ? 'json' : 'pretty'),
    },
  };

  return config;
}

/**
 * Returns the validated configuration object. Throws on first use if required
 * variables are missing so that the process fails at startup, not mid-request.
 */
export function getConfig() {
  if (!cached) cached = buildConfig();
  return cached;
}

/** Test helper: force the config to be rebuilt from the current process.env. */
export function resetConfigForTests() {
  cached = null;
}
