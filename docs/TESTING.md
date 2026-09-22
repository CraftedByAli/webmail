# Testing

All suites run without a mail server by using `MockMailProvider` (`lib/mail/mock-provider.js`), an in-memory
implementation of the `MailProvider` contract seeded with deterministic messages (a thread, an HTML message with a
tracking pixel and a script, attachments, 60 newsletters, custom folder).

| Command                    | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | **Unit** (Vitest, `tests/unit`): threading, search parser + IMAP compiler, HTML sanitizer, addresses, crypto + sessions, CSRF, rate limiter, filenames, MIME detection, BODYSTRUCTURE walker, charset/flowed decoding, previews, MIME build/parse round-trip, folder role detection, `ImapClient` against a fake `ImapFlow`, connection manager.                                                                                                                                                          |
| `npm run test:integration` | **Integration** (Vitest, `tests/integration/api.test.js`): calls the real route handlers in-process — login, CSRF, throttling, sessions, folders, inbox paging, message read, thread, attachments (upload/validation/download/inline), send with attachments, reply headers, forward, drafts (no duplicates / restore / delete / consumed on send), flag/archive/spam/trash/delete/move actions, search, folder CRUD, preferences, contacts + suggestions, signatures, health/ready/diagnostics.          |
| `npm run test:e2e`         | **End-to-end** (Playwright, `tests/e2e`): builds a production bundle, starts `next start` with the mock provider and drives Chromium (desktop + Pixel 7): login → inbox → open email (sandboxed iframe, blocked images) → reply → autosave → send → verify in thread and Sent; compose with autocomplete, Cc and file attachment + download; search/archive/delete with optimistic UI; keyboard shortcuts; folder creation, settings, sessions; real-time arrival; mobile drawer and full-screen compose. |

First run: `npx playwright install chromium`.

## Live Mailcow tests

`tests/integration/imap-live.test.js` is skipped unless credentials are provided. It authenticates, lists folders,
lists/reads the inbox, saves and deletes a draft and runs a search against a **real** mailbox (read-only apart from the
draft):

```bash
LIVE_IMAP_USER=you@example.com LIVE_IMAP_PASS='secret' \
MAIL_IMAP_HOST=mail.example.com MAIL_SMTP_HOST=mail.example.com \
npm run test:integration
```

Quick connectivity check without tests:

```bash
MAIL_USER=you@example.com MAIL_PASS='secret' npm run check:mailcow
```

## Running E2E against a deployed instance

```bash
E2E_BASE_URL=https://webmail.example.com E2E_EMAIL=you@example.com E2E_PASSWORD='secret' npx playwright test
```

Tests that depend on seeded mock data (specific subjects) will fail against a real mailbox; the login, navigation,
compose and settings tests are generic.

## CI

`.github/workflows/ci.yml` runs lint, format check, unit, integration and E2E tests, then builds the Docker image.
