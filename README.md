<p><img src="public/brand/osmicmails-logo.svg" alt="OsmicMails" height="56"></p>

# OsmicMails

[![CI](https://github.com/CraftedByAli/webmail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CraftedByAli/webmail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/CraftedByAli/webmail?style=social)](https://github.com/CraftedByAli/webmail/stargazers)

> ⭐ **If OsmicMails is useful to you, please star the repository** — it helps other Mailcow admins find it.

**OsmicMails** is a production-grade, Gmail-style business webmail for an existing **Mailcow** installation — built
for companies that run several mailboxes per domain (`info@`, `sales@`, `support@` …) and want to work in all of them
from one screen.
Built with **Next.js 16 (App Router), React 19, JavaScript, Tailwind CSS 4** and Radix UI primitives.

Mailcow (Dovecot + Postfix) remains the mail server: storage, delivery, spam filtering, DKIM/SPF/DMARC,
TLS and authentication all stay there. This application is a secure, fast client on top of **IMAPS** and
**SMTP submission** — nothing in the browser ever talks to IMAP or SMTP directly.

```
Browser ──HTTPS──▶ Next.js (Node) ──IMAPS 993──▶ Dovecot (Mailcow)
                        └──────────SMTP 587 STARTTLS──▶ Postfix (Mailcow)
```

## Features

- **Multiple mailboxes at once**: sign in to up to 10 mailboxes (configurable) in one browser and switch instantly
  from the sidebar, the account menu or with `g` then `1`–`9`. Every mailbox keeps its own mail, folders, drafts,
  contacts, signatures, preferences and forwarding — separate server-side credentials, separate caches in the browser,
  and every request is pinned to its mailbox, so mail can never be mixed. Unread counts and notifications for the other
  mailboxes stay live; each browser tab can show a different mailbox.
- **Mail forwarding per mailbox**: forward new mail to up to 4 addresses (configurable), keep or drop a copy, skip
  spam, send a test. It runs on the mail server as a Sieve script (ManageSieve), so it works while nobody is signed in,
  and existing Sieve filters (SOGo, Roundcube…) keep running.
- **Attachments**: reliable downloads (with error messages instead of broken files), "Download all", and in-app
  previews for images (incl. SVG, safely), PDF, text/code, CSV (as a table), audio, video and attached e-mails, with
  previous/next navigation.
- **Gmail-like experience**: conversation view, star/archive/spam/trash, bulk actions, drag-and-drop to folders,
  keyboard shortcuts (`c`, `r`, `a`, `f`, `e`, `#`, `j`/`k`, `g i`, `?` …), infinite scrolling with a virtualised list.
- **Compose**: rich text (Tiptap), recipient chips with autocomplete, Cc/Bcc, attachments with progress, inline
  images, signatures, priority, multiple windows, minimize / full screen, **debounced draft autosave** to the IMAP
  Drafts folder (never duplicates).
- **Reply / Reply all / Forward** with correct `In-Reply-To` / `References`, quoting and forwarded attachments.
- **Secure email rendering**: server-side sanitization (no scripts, handlers, `javascript:` URLs, dangerous CSS),
  remote images blocked by default with one-click load, rendered in a scriptless **sandboxed iframe** with its own CSP.
- **Search** with `from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `is:starred`, `after:`, `before:`, `in:` on
  top of IMAP SEARCH; the search service is an abstraction so an external index can be plugged in later.
- **Real-time**: one server-side **IMAP IDLE** connection per signed-in mailbox (not per tab) fans out to browser tabs
  over **Server-Sent Events**, with automatic fallback to polling. Desktop notifications (opt-in, grouped).
- **Folders**: auto-detected special-use folders (Inbox, Sent, Drafts, Junk, Trash, Archive), custom folders and
  sub-folders, create / rename / delete, unread counts.
- **Settings**: general, appearance (light / dark / system, density), inbox, notifications, signatures,
  keyboard shortcuts, security & sessions (active sessions, revoke, sign out everywhere, login history), about.
- **Contacts**: lightweight address book plus automatic suggestions from mail you send and receive.
- **Operations**: `/api/health`, `/api/ready`, admin diagnostics page, structured JSON logs with redaction,
  Docker image (non-root, standalone), reverse-proxy examples for Nginx and Caddy.
- **Security**: HttpOnly/Secure/SameSite cookies, encrypted credential storage, CSRF protection, strict CSP with
  nonces, rate limiting and login throttling, attachment validation by magic bytes, filename sanitization, no
  arbitrary IMAP/SMTP/URL access. See [docs/SECURITY.md](docs/SECURITY.md).
- **Tests**: 123 unit, 36 integration and 20 Playwright end-to-end tests run against an in-memory mock mail
  provider — CI needs no Mailcow. An optional live suite runs against a real mailbox.

## Use it with Mailcow (replace SOGo)

On a server running mailcow: dockerized, one installer adds OsmicMails on Mailcow's internal network, serves it through
Mailcow's own nginx and certificate at its own hostname, and redirects SOGo's webmail to it (SOGo's CalDAV/CardDAV and
ActiveSync keep working):

```bash
git clone https://github.com/CraftedByAli/webmail.git /opt/osmicmails
cd /opt/osmicmails/deploy/mailcow
sudo ./install.sh
```

Nothing in Mailcow changes without a prompt, and nginx is only restarted after `nginx -t` accepts the configuration.
The full guide — including the manual steps, removing SOGo entirely and running behind another proxy — is served by
every instance at **`/docs/mailcow`**. Release images: `ghcr.io/craftedbyali/osmicmails` (amd64 + arm64, with signed
build provenance).

Each organisation runs its own copy against its own mail server. There is deliberately no shared login that accepts
arbitrary servers: mailbox passwords should only ever reach a server you control.

## Documentation

Every instance serves its documentation at `/docs` (turn off with `DOCS_ENABLED=false`): introduction, quick start,
Mailcow integration, standalone Docker, reverse proxies, configuration reference, security, operations and
troubleshooting.

## Contributing

Contributions are welcome — bug fixes, features and docs. The short version:

```
fork ─▶ branch from staging ─▶ PR into staging ─▶ review + CI ─▶ maintainer merges
                                                 staging ─▶ main (maintainer only) ─▶ release
```

1. **Fork** the repository and clone your fork.
2. **Create a branch from `staging`**: `git switch -c feat/my-change upstream/staging`.
3. **Set up locally** with no mail server needed: `npm ci`, `cp .env.example .env`, set `MAIL_PROVIDER=mock`,
   `npm run dev`, sign in as `test@example.com` / `password123`.
4. **Run the checks**: `npm run lint && npm run format:check && npm test && npm run test:integration` (and
   `npm run test:e2e` for UI changes).
5. **Open a pull request with base `staging`** and fill in the template.

How the branches are protected:

| Branch      | Purpose                   | Merges                                                                   |
| ----------- | ------------------------- | ------------------------------------------------------------------------ |
| `main`      | Released code             | Maintainer only, by pull request from `staging` (merge commit), CI green |
| `staging`   | Next release, integration | Maintainer only, by pull request after review, CI green                  |
| your branch | One change, in your fork  | You                                                                      |

Nobody — including admins — pushes directly to `main` or `staging`. A pull request into `main` from any branch other
than `staging` fails the required _Source branch is staging_ check. Full details: [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security issue? Please report it privately — see [SECURITY.md](SECURITY.md).

## Support the project

If OsmicMails saves you from SOGo or makes your users happier, **[give it a ⭐ on GitHub](https://github.com/CraftedByAli/webmail)**.
Stars, bug reports and pull requests all help the project grow.

## Table of contents

- [Use it with Mailcow (replace SOGo)](#use-it-with-mailcow-replace-sogo)
- [Contributing](#contributing)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Docker](#docker)
- [Mailcow configuration](#mailcow-configuration)
- [Production deployment](#production-deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Backup considerations](#backup-considerations)
- [Security](#security)
- [Architecture](#architecture)
- [Design](#design)

## Prerequisites

- A working **Mailcow** installation with IMAPS (993) and SMTP submission (587, STARTTLS) reachable from the host
  that runs the webmail. Any standard IMAP/SMTP server works too.
- **Node.js 20.11+** (24 LTS recommended) and npm — or Docker.
- A reverse proxy with TLS (Nginx, Caddy, Traefik or Cloudflare) for production.

## Installation

```bash
git clone <this repository> webmail
cd webmail
npm ci
cp .env.example .env
# edit .env — at minimum MAIL_IMAP_HOST, MAIL_SMTP_HOST and SESSION_SECRET
openssl rand -hex 32   # use the output as SESSION_SECRET
```

Verify connectivity to your Mailcow server with real mailbox credentials before starting the app:

```bash
MAIL_USER=you@example.com MAIL_PASS='your-password' npm run check:mailcow
```

## Environment variables

All configuration comes from the environment (see [`.env.example`](.env.example)). Nothing is hard-coded.

| Variable                          | Default                        | Description                                                                                                   |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                         | `http://localhost:3000`        | Public URL. `https://` enables Secure cookies and HTTPS redirects.                                            |
| `SESSION_SECRET`                  | —                              | **Required in production**, ≥ 32 random characters. Used for cookie hashing and credential encryption.        |
| `SESSION_TTL_HOURS`               | `168`                          | Sliding session lifetime.                                                                                     |
| `ADMIN_EMAILS`                    | —                              | Comma-separated mailboxes allowed to open `/admin/diagnostics`.                                               |
| `MAX_MAILBOXES_PER_SESSION`       | `10`                           | How many mailboxes one browser may be signed in to at once (1–20).                                            |
| `MAIL_IMAP_HOST`                  | —                              | **Required.** Mailcow hostname (e.g. `mail.example.com`).                                                     |
| `MAIL_IMAP_PORT`                  | `993`                          |                                                                                                               |
| `MAIL_IMAP_TLS`                   | `true`                         | `true` = IMAPS, `false` = plain + STARTTLS (port 143).                                                        |
| `MAIL_SMTP_HOST`                  | —                              | **Required.** Usually the same host.                                                                          |
| `MAIL_SMTP_PORT`                  | `587`                          |                                                                                                               |
| `MAIL_SMTP_SECURE`                | `false`                        | `true` for implicit TLS on 465.                                                                               |
| `MAIL_SMTP_REQUIRE_TLS`           | `true`                         | Refuse to authenticate without STARTTLS.                                                                      |
| `MAIL_TLS_REJECT_UNAUTHORIZED`    | `true`                         | Only set `false` for self-signed certificates in a lab.                                                       |
| `MAIL_TLS_SERVERNAME`             | —                              | Certificate name to verify when the hosts are internal (e.g. `dovecot-mailcow`); set to the Mailcow hostname. |
| `TRUST_PROXY_HOPS`                | `1`                            | Proxies that append to `X-Forwarded-For`; the client IP is read that many entries from the right.             |
| `TRUST_CLOUDFLARE`                | `false`                        | Trust `CF-Connecting-IP`. Only when the origin accepts Cloudflare traffic alone.                              |
| `DOCS_ENABLED`                    | `true`                         | Serve the documentation at `/docs`.                                                                           |
| `MAIL_SIEVE_ENABLED`              | `true`                         | Use ManageSieve (Dovecot) for forwarding.                                                                     |
| `MAIL_SIEVE_HOST`                 | `MAIL_IMAP_HOST`               | ManageSieve host.                                                                                             |
| `MAIL_SIEVE_PORT`                 | `4190`                         | Mailcow publishes ManageSieve on 4190.                                                                        |
| `MAIL_SIEVE_REQUIRE_TLS`          | `true`                         | Require STARTTLS before sending the password.                                                                 |
| `MAIL_FORWARDING_ENABLED`         | `true`                         | Master switch for the forwarding feature.                                                                     |
| `MAX_FORWARD_ADDRESSES`           | `4`                            | Forwarding destinations per mailbox (Dovecot's default `sieve_max_redirects` is 4; Mailcow allows 100).       |
| `MAIL_FORWARDING_ALLOWED_DOMAINS` | —                              | Optional allow-list of destination domains, e.g. `example.com,partner.example`.                               |
| `MAX_ATTACHMENT_SIZE_MB`          | `50`                           | Per attachment upload limit. Match Mailcow's `message_size_limit`.                                            |
| `MAX_MESSAGE_SIZE_MB`             | `60`                           | Largest message the viewer downloads in full, and the cap on an outgoing message's attachments.               |
| `IMAP_POOL_SIZE`                  | `3`                            | IMAP connections per signed-in mailbox.                                                                       |
| `IMAP_IDLE_TIMEOUT_SECONDS`       | `300`                          | Idle pooled connections are logged out after this.                                                            |
| `DATABASE_PATH`                   | `./data/webmail.db`            | SQLite file for sessions, preferences, contacts, signatures.                                                  |
| `UPLOAD_DIR`                      | `./data/uploads`               | Temporary compose attachments (auto-cleaned).                                                                 |
| `LOG_LEVEL`                       | `info`                         | `trace` … `error`.                                                                                            |
| `LOG_FORMAT`                      | `pretty` (dev) / `json` (prod) |                                                                                                               |
| `MAIL_PROVIDER`                   | `imap`                         | `mock` is for tests only and refused in production.                                                           |

## Local development

```bash
npm run dev            # http://localhost:3000
npm run lint
npm run format
```

Sign in with any Mailcow mailbox (full email address + password). To develop **without** a mail server use the
in-memory mock provider:

```bash
MAIL_PROVIDER=mock npm run dev
# sign in as test@example.com / password123
```

## Docker

```bash
cp .env.example .env    # configure
docker compose up -d --build
curl http://127.0.0.1:3000/api/ready
```

Only port 3000 is published (bound to `127.0.0.1` — put a reverse proxy in front). IMAP/SMTP are outbound
connections from the container to Mailcow; no mail ports are exposed by the webmail. Application data lives in the
`webmail-data` volume (`/data`).

Production overlay (pinned image, log rotation, read-only root filesystem):

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

If Mailcow runs in Docker on the same host, uncomment the `networks` block in
`docker-compose.production.yml` and set `MAIL_IMAP_HOST=dovecot-mailcow`, `MAIL_SMTP_HOST=postfix-mailcow`
(then set `MAIL_TLS_REJECT_UNAUTHORIZED=false` **or** keep using the public hostname so the certificate matches —
the public hostname is recommended).

## Mailcow configuration

No changes to Mailcow are required. The webmail uses the same endpoints as any mail client:

| Purpose  | Setting                                                                    |
| -------- | -------------------------------------------------------------------------- |
| IMAP     | `mail.example.com`, port **993**, SSL/TLS (IMAPS)                          |
| SMTP     | `mail.example.com`, port **587**, STARTTLS, authentication required        |
| Sieve    | `mail.example.com`, port **4190** (ManageSieve), STARTTLS — for forwarding |
| Username | full mailbox address, e.g. `alice@example.com`                             |
| Password | the mailbox password                                                       |

Recommended:

1. **Special-use folders** — Mailcow's Dovecot already advertises `\Sent`, `\Drafts`, `\Junk`, `\Trash` via
   SPECIAL-USE; the webmail detects them (and localized names) automatically and creates `Archive` on first use.
2. **THREAD extension** — Dovecot supports `THREAD=REFS`; the webmail uses it for server-side conversation grouping
   over the whole mailbox, and falls back to header-based grouping otherwise.
3. **Message size** — align `MAX_ATTACHMENT_SIZE_MB` with Mailcow's `message_size_limit` (default 100 MB) and the
   reverse proxy's `client_max_body_size`.
4. **Rate limits** — Mailcow's Postfix/Dovecot rate limits apply per mailbox as usual. The webmail additionally
   throttles logins per IP and per account.
5. **App passwords** — if you use Mailcow app passwords, they work as long as they allow IMAP and SMTP.
6. **ManageSieve (forwarding)** — Mailcow's Dovecot serves ManageSieve on port 4190 (published by
   `docker-compose.yml`). Allow the webmail host to reach it; if it cannot, the Forwarding page says so and the rest of
   the app is unaffected. Mailcow sets `sieve_redirect_envelope_from = recipient`, so forwarded mail is sent with the
   mailbox's own address as envelope sender and passes SPF at the destination.
7. **Fail2ban / netfilter** — the webmail connects from its own IP; repeated bad passwords from users would count
   against that IP in Mailcow's netfilter. Consider whitelisting the webmail host in Mailcow (Configuration → Fail2ban
   parameters → Whitelist) and rely on the webmail's own login throttling.

## Production deployment

1. Provision a host with Docker (or Node 24) and DNS `webmail.example.com` → host.
2. Create `.env` with `APP_URL=https://webmail.example.com`, a strong `SESSION_SECRET`, Mailcow hosts,
   `LOG_FORMAT=json`.
3. `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d`.
4. Put a TLS-terminating reverse proxy in front:

   - **Nginx**: [`deploy/nginx.conf`](deploy/nginx.conf) — includes the SSE settings (`proxy_buffering off`) and
     `client_max_body_size`. Obtain certificates with certbot: `certbot --nginx -d webmail.example.com`.
   - **Caddy**: [`deploy/Caddyfile`](deploy/Caddyfile) — automatic HTTPS.
   - **Cloudflare**: set SSL mode to _Full (strict)_, keep the origin on Nginx/Caddy with a valid certificate. Cloudflare
     buffers responses for ~100 s max on free plans; SSE still works because the app sends heartbeats every 25 s and the
     client reconnects automatically. Disable _Rocket Loader_ and _Auto Minify_ (they break CSP nonces). The app honours
     `CF-Connecting-IP`, `X-Forwarded-For` and `X-Forwarded-Proto`.

5. Verify: `curl -s https://webmail.example.com/api/ready` → `{"status":"ready", ...}`.
6. Monitoring: scrape `/api/health` (liveness) and `/api/ready` (readiness), ship JSON logs from the container.
   Sign in as an address in `ADMIN_EMAILS` and open **Diagnostics** from the account menu for IMAP/SMTP latency,
   connection pool and realtime status.

Without Docker: `npm ci && npm run build && NODE_ENV=production npm start` behind the same proxy, managed by
systemd or pm2.

### Behind a reverse proxy

The app trusts `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` from the
proxy. Make sure the proxy sets them and that the app is **only** reachable through the proxy.

## Testing

```bash
npm test                  # unit tests (Vitest): IMAP service, SMTP composer, MIME, threading, sanitizer, auth, search…
npm run test:integration  # API integration tests against the mock provider (login → inbox → read → send → reply → drafts → search …)
npm run test:e2e          # Playwright: builds the app and drives the real UI in Chromium (desktop + mobile)
npm run test:all
```

The first E2E run needs `npx playwright install chromium`. E2E tests run against a **production build** so they
exercise the real Content-Security-Policy. See [docs/TESTING.md](docs/TESTING.md) for the live Mailcow suite.

## Troubleshooting

| Symptom                                                              | Cause / fix                                                                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Incorrect email or password" but credentials work in another client | Use the full address as username. Check Mailcow → Mailbox → _Allow IMAP/SMTP_ for app passwords. Check Mailcow's netfilter hasn't banned the webmail IP.         |
| "Secure connection to the mail server failed"                        | Certificate hostname mismatch (using a Docker service name?) or self-signed. Use the public hostname, or set `MAIL_TLS_REJECT_UNAUTHORIZED=false` in a lab only. |
| "The mail server is not reachable"                                   | Firewall between webmail host and Mailcow on 993/587; test with `npm run check:mailcow`.                                                                         |
| Real-time indicator shows polling                                    | Reverse proxy buffers SSE. Apply the `/api/realtime` location from `deploy/nginx.conf`. The app keeps working via polling.                                       |
| 413 on attachments                                                   | Raise `client_max_body_size` (Nginx) / `request_body max_size` (Caddy) and `MAX_ATTACHMENT_SIZE_MB`.                                                             |
| Sessions vanish after restart                                        | `DATABASE_PATH` is not on a persistent volume.                                                                                                                   |
| Everyone signed out after deploy                                     | `SESSION_SECRET` changed — sessions cannot be decrypted with a new secret (by design).                                                                           |
| Login returns 429                                                    | Login throttling (8 attempts / 15 min per IP, 12 per account). Wait or restart the app.                                                                          |
| CSP errors in the console                                            | Something injects inline scripts (browser extension, Cloudflare Rocket Loader). The app uses nonces.                                                             |

| Downloads fail / previews stay blank (older versions) | Fixed in 0.2: responses no longer advertise the base64-encoded size as `Content-Length`, and PDFs may be framed by the app itself (`X-Frame-Options: SAMEORIGIN` on attachments only). |
| Forwarding page says the filter service can't be reached | Port 4190 blocked between webmail and Mailcow, or `MAIL_SIEVE_HOST` wrong. Diagnostics shows the ManageSieve status. |
| Forwarding shows "another app activated a different filter" | SOGo/Roundcube activated its own Sieve script. Press Save: forwarding becomes active again and includes that script so its rules keep running. |
| A mailbox in the switcher shows "Sign in again" | Its password changed in Mailcow. Choose it and enter the new password; the other mailboxes are unaffected. |

Set `LOG_LEVEL=debug` for detailed server logs; passwords, tokens and cookies are always redacted.

## Backup considerations

- **Mail is never stored by the webmail** — it lives in Mailcow. Back up Mailcow as usual.
- The SQLite database (`/data/webmail.db` in Docker) holds sessions, preferences, contacts and signatures.
  Back it up with `sqlite3 webmail.db ".backup backup.db"` or by copying the volume while the app is stopped.
  Losing it only signs users out and resets preferences/contacts.
- `UPLOAD_DIR` holds in-flight compose attachments for at most 24 h; no backup needed.
- Keep `SESSION_SECRET` in your secrets store — rotating it invalidates all sessions.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full model: credential handling, cookies, CSRF, CSP, email HTML
sandboxing, attachment handling, rate limiting, logging and what to review before exposing the app publicly.

## Design

See [docs/DESIGN.md](docs/DESIGN.md) for the design system: typography, colour, spacing, radius, elevation,
component philosophy, the message-rendering pipeline (including how dark mode handles sender-styled email),
density, responsive behaviour and accessibility.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout, the `MailProvider` abstraction, connection
management, threading strategy, real-time pipeline and caching.

## License

MIT — see [LICENSE](LICENSE). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues
privately as described in [SECURITY.md](SECURITY.md).
