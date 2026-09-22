# Architecture

## Overview

```
┌──────────────┐  HTTPS   ┌──────────────────────────────────────────────┐
│   Browser    │◀────────▶│ Next.js 16 (Node runtime)                    │
│ React 19 UI  │   SSE    │                                              │
│ TanStack     │◀─────────│  app/api/*  ── lib/api/handler (auth, CSRF,  │
│ Query/Zustand│          │                 rate limit, error mapping)   │
└──────────────┘          │        │                                     │
                          │        ▼                                     │
                          │  MailProvider (lib/mail/provider.js)         │
                          │        │                                     │
                          │  ImapSmtpProvider ──┬── ImapConnectionManager│──IMAPS──▶ Dovecot
                          │                     ├── IdleManager (IDLE)   │──IMAPS──▶ Dovecot
                          │                     └── SMTP (nodemailer)    │──587────▶ Postfix
                          │  SQLite (sessions, prefs, contacts, sigs)    │
                          └──────────────────────────────────────────────┘
```

The browser only ever talks to the Next.js app. Mailbox credentials never leave the server; the browser holds an
opaque session cookie.

## Directory layout

| Path                                           | Responsibility                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app/(auth)/login`                             | Sign-in page.                                                                                                         |
| `app/(mail)/*`                                 | Authenticated shell: mail, settings, contacts, admin diagnostics. Layout validates the session server-side.           |
| `app/api/**`                                   | Route handlers. Thin: validate input → call the provider → JSON.                                                      |
| `proxy.js`                                     | Edge proxy (Next 16 name for middleware): CSP nonce, security headers, cookie-presence redirects, HTTPS redirect.     |
| `instrumentation.js` + `lib/server/startup.js` | Startup validation, housekeeping, graceful shutdown.                                                                  |
| `lib/config/env.js`                            | Single validated configuration object.                                                                                |
| `lib/logger.js`                                | Pino logger with redaction of secrets; `timed()` helper for durations.                                                |
| `lib/db`                                       | SQLite (better-sqlite3) with inline migrations.                                                                       |
| `lib/auth`                                     | Session store (`session.js`) and cookie helpers.                                                                      |
| `lib/security`                                 | Crypto, CSRF, rate limiting, HTML sanitizer, filename + MIME validation, request metadata.                            |
| `lib/api`                                      | Handler wrapper, AppError, validators, streaming attachment responses.                                                |
| `lib/imap`                                     | `ImapClient` (all IMAP commands), `ImapConnectionManager` (pooling), `IdleManager` (realtime), folder role detection. |
| `lib/smtp`                                     | Nodemailer transport (`client.js`) and MIME builder (`compose.js`).                                                   |
| `lib/mime`                                     | Address parsing, BODYSTRUCTURE walker, charset decoding, preview extraction, mailparser fallback.                     |
| `lib/mail`                                     | `MailProvider` contract, `ImapSmtpProvider`, `MockMailProvider` (tests), threading, temp attachment store.            |
| `lib/search`                                   | Gmail-style query parser and IMAP SEARCH compiler.                                                                    |
| `lib/cache`                                    | TTL memory cache with prefix invalidation.                                                                            |
| `lib/realtime`                                 | In-process pub/sub hub between IDLE listeners and SSE responses.                                                      |
| `lib/contacts`, `lib/preferences`              | Repositories for contacts/suggestions, preferences, signatures.                                                       |
| `components/**`                                | UI: `ui/` primitives (shadcn-style), `layout/`, `sidebar/`, `mail/`, `compose/`, `search/`, `settings/`, `contacts/`. |
| `hooks/**`                                     | Data hooks (TanStack Query), realtime, shortcuts, notifications, media queries.                                       |
| `stores/**`                                    | Zustand stores: compose windows, transient UI state.                                                                  |
| `utils/**`                                     | Browser helpers: API client, formatting, routing, reply building.                                                     |

Business logic lives in `lib/`; components only render and call hooks.

## MailProvider abstraction

`lib/mail/provider.js` defines the operations the API needs (`listFolders`, `listMessages`, `getThread`,
`getMessage`, `getAttachment`, `sendMessage`, `saveDraft`, `markRead`, `star`, `moveMessage`, `deleteMessage`,
`search`, `status` …). `lib/mail/index.js` selects the implementation from `MAIL_PROVIDER`:

- `ImapSmtpProvider` — generic IMAP/SMTP, used for Mailcow.
- `MockMailProvider` — in-memory, deterministic, used by all automated tests; refused in production unless
  `ALLOW_MOCK_PROVIDER=true` (E2E only).

A Google Workspace or Microsoft 365 provider would implement the same class; routes and UI stay unchanged.

## Authentication and sessions

1. `POST /api/auth/login` verifies the credentials by opening an IMAP session (`ImapSmtpProvider.authenticate`).
2. `createSession()` generates a random 256-bit token. The database stores `HMAC(token)` for lookup and the mailbox
   password encrypted with AES-256-GCM under a key derived (HKDF) from **both** the server `SESSION_SECRET` and the
   token. The token is set as an `HttpOnly; SameSite=Lax; Secure` cookie.
3. Each request resolves the session, decrypts the credential in memory and hands it to the provider. Sliding
   expiration is refreshed at most once a minute.
4. Logout marks the row revoked and wipes the ciphertext; "sign out everywhere" also closes the IMAP pool.

Neither the database alone nor the cookie alone can recover a password.

## IMAP connection management

- **Pool per mailbox** (`ImapConnectionManager`): up to `IMAP_POOL_SIZE` authenticated connections, reused across
  requests, closed after `IMAP_IDLE_TIMEOUT_SECONDS`, health-checked on acquire, replaced when stale (one retry on
  connection errors), exponential back-off after connect failures.
- **Mailbox locks**: every operation runs inside `getMailboxLock()` so concurrent requests never interleave SELECT
  state on one socket.
- **IDLE** (`IdleManager`): one dedicated connection per signed-in mailbox, created when the first SSE subscriber
  connects and torn down 30 s after the last one leaves. Reconnects with exponential back-off.

## Listing strategy (performance)

Inbox requests fetch only `UID FLAGS ENVELOPE BODYSTRUCTURE RFC822.SIZE INTERNALDATE` plus `References` /
`In-Reply-To` headers for a **page** addressed by sequence range (newest first), then one extra FETCH per distinct
text-part number to get ~1.5 KB previews. Bodies are fetched only when a message is opened, by part number, never the
whole mailbox. Lists are virtualised in the browser (`@tanstack/react-virtual`) and loaded incrementally.

## Threading

1. If Dovecot advertises `THREAD=REFS|REFERENCES|ORDEREDSUBJECT`, the provider runs `UID THREAD` over the folder
   (cached 45 s, invalidated on changes) and pages over threads, fetching headers only for the visible threads (max 40
   messages each). This gives Gmail-style conversations across a 100k-message mailbox.
2. Otherwise `lib/mail/threading.js` groups the current page with a union-find over `Message-ID`/`In-Reply-To`/
   `References`, plus a conservative subject + participant fallback for broken headers.
3. `getThread()` merges replies from the Sent folder that reference the conversation.

## Message rendering pipeline

`BODYSTRUCTURE` → pick best `text/html` / `text/plain` part → `downloadMany` (transfer-decoded) → charset decode →
`sanitizeEmailHtml` (allow-list, remote images blocked, `cid:` rewritten to `/api/attachments/inline`) → client
`<iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc>` (no `allow-scripts`) with
an inner `<meta http-equiv="Content-Security-Policy">`. Messages with unusual structure fall back to `mailparser` on the
full source (bounded by `MAX_MESSAGE_SIZE_MB`).

## Sending

`buildMessage()` (nodemailer `MailComposer`) creates the MIME message with `Message-ID`, `Date`, `In-Reply-To`,
`References`, sanitized HTML + generated plain-text alternative and attachments resolved from uploads or existing
message parts (streamed from IMAP). It is sent through Postfix submission with the user's own credentials, appended
to the Sent folder, the original marked `\Answered`/`$Forwarded`, the draft removed and uploads deleted.

## Drafts

Compose windows autosave 3 s after the last change. Each save `APPEND`s to Drafts and deletes the previous draft UID
(tracked in compose state), so typing never creates duplicates. Drafts reopen with recipients, subject, body and
attachments (referenced by part).

## Search

`parseSearchQuery()` produces a backend-neutral AST; `toImapSearch()` compiles it to IMAP SEARCH. UID result sets are
cached 30 s and paged with UID FETCH. Replacing IMAP SEARCH with an index (Meilisearch, OpenSearch, PostgreSQL FTS) means
adding another compiler for the same AST.

## Real-time

Dovecot `EXISTS`/`EXPUNGE`/`FETCH FLAGS` → `IdleManager` → `realtimeHub` → `GET /api/realtime` (SSE, 25 s heartbeats)
→ `useRealtime()` invalidates TanStack Query caches and shows toasts/desktop notifications. If SSE fails the hook
falls back to 60 s polling and refreshes on tab focus.

## Caching

Memory cache with TTLs: folder list 20 s, THREAD maps 45 s, search UID sets 30 s, preferences via TanStack Query.
All mailbox caches for a folder are invalidated after read/unread, move, delete, archive, send and on IDLE events.

## Database

SQLite tables: `sessions`, `user_preferences`, `signatures`, `contacts`, `address_suggestions`, `login_history`,
`schema_migrations`. No mail data is stored. Deleting the file loses only preferences and sessions.

## Deployment shape

Single Node process (`output: 'standalone'`), SQLite on a volume, TLS at a reverse proxy. The in-memory rate limiter,
cache and hub are per process; scaling to multiple replicas would require a shared store (Redis) for those three
components and sticky sessions for SSE.
