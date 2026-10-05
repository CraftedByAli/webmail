# Mailcow configuration notes

The webmail is a regular IMAP/SMTP client; Mailcow needs no changes. These notes cover the details worth knowing.

To install OsmicMails on a Mailcow host and replace SOGo's webmail, use `deploy/mailcow/install.sh`; the step-by-step
guide (also the manual equivalent) is served at `/docs/mailcow` by every instance.

## Endpoints

| Service         | Host                                            | Port | TLS                  | Auth                            |
| --------------- | ----------------------------------------------- | ---- | -------------------- | ------------------------------- |
| IMAP            | `${MAILCOW_HOSTNAME}` (e.g. `mail.example.com`) | 993  | implicit TLS (IMAPS) | full mailbox address + password |
| SMTP submission | `${MAILCOW_HOSTNAME}`                           | 587  | STARTTLS (required)  | same                            |
| ManageSieve     | `${MAILCOW_HOSTNAME}`                           | 4190 | STARTTLS (required)  | same (SASL PLAIN)               |

Alternative: SMTP on 465 with `MAIL_SMTP_SECURE=true`.

## Folder detection

Mailcow's Dovecot advertises `SPECIAL-USE` flags for `Sent`, `Drafts`, `Junk`, `Trash` (see
`data/conf/dovecot/dovecot.conf` → `namespace inbox { mailbox Sent { special_use = \Sent } … }`). The webmail uses these
flags first, then well-known localized names, and creates `Archive` when the user archives for the first time. Custom
folders (including sub-folders using Dovecot's `/` or `.` separator) are listed automatically.

## Capabilities used

- `IDLE` — real-time notifications (one connection per signed-in mailbox).
- `THREAD=REFS` — server-side conversation grouping (falls back to header-based grouping when absent).
- `MOVE`, `UIDPLUS`, `ESEARCH`, `SPECIAL-USE`, `CONDSTORE` — all standard in Mailcow's Dovecot.

Run `MAIL_USER=… MAIL_PASS=… npm run check:mailcow` to print the capabilities your server offers.

## Same-host Docker networking

If the webmail container runs on the Mailcow host, join `mailcowdockerized_mailcow-network` and use
`dovecot-mailcow` / `postfix-mailcow` as hosts. Their names are not on Mailcow's certificate, so set
`MAIL_TLS_SERVERNAME` to `MAILCOW_HOSTNAME`: the connection goes to the container while the certificate is still
verified against the public name. Never disable verification (`MAIL_TLS_REJECT_UNAUTHORIZED=false`) on a real server.
`deploy/mailcow/` does all of this.

## Netfilter / Fail2ban

Mailcow bans IPs after repeated authentication failures. All webmail users share the webmail host's IP, so a few users
mistyping passwords could ban the whole webmail. The webmail throttles logins itself (8 per IP and 12 per account per
15 minutes). When it runs on another host, whitelist it in Mailcow: **System → Configuration → Fail2ban parameters →
Whitelist**. On the Mailcow network it connects from a private address, which Mailcow's netfilter never bans — the
webmail's own throttling is then the only guard, so keep `TRUST_PROXY_HOPS` correct (the client IP must not be
spoofable).

## Size limits

Mailcow's default `message_size_limit` is 100 MB (Postfix) — see **System → Configuration → Options → Message size
limit**. Keep `MAX_ATTACHMENT_SIZE_MB` (per file) and `MAX_MESSAGE_SIZE_MB` below it, and set the reverse proxy body
limit above `MAX_ATTACHMENT_SIZE_MB`.

## Sent copies

Postfix does not store sent mail. The webmail appends every sent message to the `\Sent` folder itself (with `\Seen`).

## App passwords and 2FA

Mailcow app passwords work for IMAP/SMTP; TFA configured for the Mailcow UI does not apply to IMAP/SMTP logins.

## Forwarding (Sieve)

Forwarding is implemented as a per-mailbox Sieve script named `osmicmails-forwarding`, uploaded over ManageSieve
(RFC 5804) with the mailbox's own credentials — no Mailcow API key or admin rights are needed.

- The script uses `redirect :copy` (keep a copy) or `redirect`, wrapped in
  `if not anyof (header :contains "X-Spam-Flag" "YES", header :contains "X-Spam" "Yes")` when spam is skipped.
- Its settings are stored as a JSON comment inside the script, so the configuration lives on the mail server.
- A mailbox can have only one active Sieve script. If another one was active (SOGo filters or vacation, Roundcube
  managesieve …) it is included with `include :personal :optional "<name>"` so it keeps working, and it is
  re-activated when forwarding is turned off.
- Mailcow's own UI filters (`sieve_before` / `sieve_after`, incl. the global spam → Junk rule) keep running around it.
- Mailcow configures `sieve_redirect_envelope_from = recipient` and `sieve_max_redirects = 100`; plain Dovecot defaults
  to the original sender and 4 redirects (hence `MAX_FORWARD_ADDRESSES=4`).
- Loops (A → B → A) are stopped by Postfix's `Delivered-To` loop detection; forwarding to the mailbox itself is refused.
- Organisations that must keep mail in-house can restrict destinations with `MAIL_FORWARDING_ALLOWED_DOMAINS` or turn
  the feature off with `MAIL_FORWARDING_ENABLED=false`.

## Multiple mailboxes

Each mailbox added to a browser session is authenticated against Dovecot individually and gets its own IMAP pool and
IDLE connection. Dovecot's per-user connection limit (`mail_max_userip_connections`) therefore applies per mailbox, not
to the sum.

## SOGo

Mailcow ships SOGo. The webmail is independent and can coexist; both read the same IMAP folders. Contacts in the
webmail are stored locally (SQLite) — the contacts repository is isolated so a CardDAV backend (SOGo) can replace it.
