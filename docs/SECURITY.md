# Security

Email is hostile input and a webmail client is a high-value target. This document describes the controls in place and
what operators must do.

## Threat model summary

| Threat                                    | Control                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential theft from the browser         | Password only travels once (login POST over HTTPS), never returned; session cookie is `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`.                                                                                                                                         |
| Credential theft from the server database | Password stored AES-256-GCM encrypted under HKDF(`SESSION_SECRET`, cookie token). DB alone or cookie alone is useless. Revocation wipes ciphertext.                                                                                                                         |
| XSS via email HTML                        | Server-side allow-list sanitizer (`sanitize-html`) + scriptless sandboxed iframe + inner CSP + outer nonce CSP.                                                                                                                                                             |
| Tracking pixels / privacy                 | Remote images/CSS `url()` blocked by default; 1×1 images removed; user opts in per message or globally.                                                                                                                                                                     |
| CSRF                                      | `SameSite=Lax` cookie, mandatory `X-Requested-With: webmail` header on all mutating requests, `Origin`/`Sec-Fetch-Site` checks.                                                                                                                                             |
| Clickjacking                              | `frame-ancestors 'none'`, `X-Frame-Options: DENY`.                                                                                                                                                                                                                          |
| Brute force                               | Login throttling per IP (8/15 min) and per account (12/15 min), general API limit, send/upload limits. Failed attempts recorded.                                                                                                                                            |
| Malicious attachments                     | Content type detected from magic bytes (never trusted from client), executable extensions refused, downloads served with `nosniff`, `Content-Disposition: attachment` for anything not inline-safe, HTML/SVG/XML never served inline, size limits enforced while streaming. |
| Path traversal                            | Uploads stored under `UPLOAD_DIR/<session id>/<random id>`; filenames sanitized (`lib/security/filename.js`); IMAP part numbers validated (`^[0-9.]+$`).                                                                                                                    |
| SSRF / arbitrary server access            | IMAP/SMTP hosts come only from environment; the server never fetches URLs from email content; inline images are only served from the user's own mailbox.                                                                                                                    |
| Session fixation / replay                 | Random 256-bit tokens, sliding expiration, per-session revocation, "sign out everywhere", login history.                                                                                                                                                                    |
| Information leakage                       | User-facing errors are generic; details go to server logs with passwords, tokens and cookies redacted; health endpoints expose booleans only; diagnostics require `ADMIN_EMAILS`.                                                                                           |
| Mock provider in production               | Refused unless `ALLOW_MOCK_PROVIDER=true` is set explicitly (E2E harness only).                                                                                                                                                                                             |

## Content Security Policy

Set per request in `proxy.js` with a fresh nonce:

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:;
object-src 'none'; frame-src 'self' blob:; child-src 'self' blob:; worker-src 'self' blob:;
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is required by Radix UI positioning and Tiptap; inline styles are not a script vector.
`img-src https:` is required so a user can opt in to remote images. In development `'unsafe-eval'` is added for React
DevTools; E2E tests run against a production build so the strict policy is exercised.

Additional headers: `Strict-Transport-Security` (production), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`.

## Email HTML rendering

1. `lib/security/sanitize-html.js` removes `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `meta`,
   `link`, `base`, all `on*` handlers, `javascript:`/`vbscript:`/`data:` (except base64 images) URLs, CSS `expression()`,
   `behavior`, `@import`, `-moz-binding`, `position: fixed/sticky`, remote `url()`.
2. Links get `target="_blank" rel="noopener noreferrer nofollow"`.
3. The result is placed in an `<iframe>` with `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`.
   **`allow-scripts` is deliberately absent**: even if the sanitizer missed something, no script can execute, and the
   frame therefore cannot reach the parent window, cookies or storage. `allow-same-origin` is only used so `cid:` images
   load with the session cookie and the parent can measure the frame's height.
4. The srcdoc carries its own `<meta http-equiv="Content-Security-Policy">`: `default-src 'none'; img-src 'self' data:
[https:]; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'`.
5. If HTML rendering fails, the sanitized plain-text alternative is shown.

## Attachments

- Uploads stream to disk; size is enforced while streaming (`MAX_ATTACHMENT_SIZE_MB`).
- The first 4 KB are sniffed with `file-type`; the declared MIME type is only used as a fallback for plain text.
- Executable extensions (`.exe .js .vbs .ps1 .jar …`) are refused.
- Downloads stream from IMAP with `Content-Disposition` (RFC 6266 encoded), `X-Content-Type-Options: nosniff`,
  `Cache-Control: private, no-store` and a restrictive CSP. Only images, PDF, plain text and common media may preview inline.
- `Content-Length` is only sent when the exact decoded size is known (IMAP reports the transfer-encoded size).
- Attachment responses allow framing by the app's own origin only (`X-Frame-Options: SAMEORIGIN`,
  `frame-ancestors 'self'`) for the PDF previewer; every other response keeps `DENY`. Previews render text in a `<pre>`,
  images (incl. SVG) through `<img>` from a Blob — nothing from an attachment ever executes in the app's origin.

## Multiple mailboxes

- Every mailbox has its own credential row, AES-256-GCM encrypted under a key derived from `SESSION_SECRET` and the
  session token — adding a mailbox never weakens the others.
- Each API request names its mailbox (`X-Mailbox` header, or `account=` on plain URLs such as attachments). A request
  for a mailbox that is not signed in is refused with `401 account_signed_out`; it is never served from another mailbox.
- The browser keeps one TanStack Query cache per mailbox, so cached mail cannot leak between mailboxes.
- "Sign out everywhere" and revoking a device apply to the current mailbox only; other mailboxes signed in on that
  device are untouched. A session emptied of mailboxes is revoked.
- The `wm_account` cookie is only a UI hint (last-used mailbox) and never authorises anything.

## Forwarding

- Configured with the mailbox's own ManageSieve login over STARTTLS (plaintext authentication is refused).
- Destinations are validated server-side (syntax, not the mailbox itself, count, optional domain allow-list).

## Logging

Pino with `redact` on `password`, `pass`, `token`, `sessionToken`, `cookie`, `authorization`, `encryptedSecret` at any
depth. Email bodies are never logged. Logged: login success/failure (mailbox, IP), IMAP/SMTP failures, send/fetch
durations, slow operations (> 2 s), action counts.

## Operator checklist

- [ ] `APP_URL` is `https://…`; TLS terminated by the reverse proxy; app not reachable directly.
- [ ] `SESSION_SECRET` ≥ 32 random chars from a secrets store.
- [ ] `MAIL_TLS_REJECT_UNAUTHORIZED=true` (certificates valid).
- [ ] `ADMIN_EMAILS` limited to administrators.
- [ ] `MAIL_PROVIDER` unset or `imap`; `ALLOW_MOCK_PROVIDER` unset.
- [ ] Reverse proxy sets `X-Forwarded-For/Proto/Host`; body size limit ≥ attachment limit.
- [ ] Container runs read-only and non-root (see `docker-compose.production.yml`).
- [ ] Logs shipped and monitored for repeated login failures.
- [ ] Mailcow netfilter whitelists the webmail host or you accept that users' bad passwords count against it.

## Reporting

Report vulnerabilities privately to the maintainers; do not open public issues for security problems.
