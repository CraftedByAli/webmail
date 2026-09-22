# Mailcow configuration notes

The webmail is a regular IMAP/SMTP client; Mailcow needs no changes. These notes cover the details worth knowing.

## Endpoints

| Service         | Host                                            | Port | TLS                  | Auth                            |
| --------------- | ----------------------------------------------- | ---- | -------------------- | ------------------------------- |
| IMAP            | `${MAILCOW_HOSTNAME}` (e.g. `mail.example.com`) | 993  | implicit TLS (IMAPS) | full mailbox address + password |
| SMTP submission | `${MAILCOW_HOSTNAME}`                           | 587  | STARTTLS (required)  | same                            |

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

If the webmail container runs on the Mailcow host, you can join `mailcowdockerized_mailcow-network` and use
`dovecot-mailcow` / `postfix-mailcow` as hosts, but the TLS certificate will not match those names. Prefer the public
hostname (traffic stays local via hairpin NAT / DNS), or set `MAIL_TLS_REJECT_UNAUTHORIZED=false` only in a private lab.

## Netfilter / Fail2ban

Mailcow bans IPs after repeated authentication failures. All webmail users share the webmail host's IP, so a few users
mistyping passwords could ban the whole webmail. The webmail throttles logins itself (8 per IP and 12 per account per
15 minutes). Whitelist the webmail host in Mailcow: **System → Configuration → Fail2ban parameters → Whitelist**.

## Size limits

Mailcow's default `message_size_limit` is 100 MB (Postfix) — see **System → Configuration → Options → Message size
limit**. Keep `MAX_ATTACHMENT_SIZE_MB` (per file) and `MAX_MESSAGE_SIZE_MB` below it, and set the reverse proxy body
limit above `MAX_ATTACHMENT_SIZE_MB`.

## Sent copies

Postfix does not store sent mail. The webmail appends every sent message to the `\Sent` folder itself (with `\Seen`).

## App passwords and 2FA

Mailcow app passwords work for IMAP/SMTP; TFA configured for the Mailcow UI does not apply to IMAP/SMTP logins.

## SOGo

Mailcow ships SOGo. The webmail is independent and can coexist; both read the same IMAP folders. Contacts in the
webmail are stored locally (SQLite) — the contacts repository is isolated so a CardDAV backend (SOGo) can replace it.
