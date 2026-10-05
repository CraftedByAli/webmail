# Contributing

Thanks for helping improve OsmicMails.

## Development setup

No mail server is needed: an in-memory mock provider stands in for Mailcow.

```bash
npm ci
cp .env.example .env
# in .env: MAIL_PROVIDER=mock
npm run dev
```

Sign in with `test@example.com` / `password123` (extra mailboxes: `sales@example.com`, `support@example.com`, same
password).

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm test                  # unit
npm run test:integration  # API routes against the mock provider
npm run test:e2e          # Playwright, desktop + mobile
```

- Keep changes focused; one feature or fix per pull request.
- Add or update tests for behaviour changes.
- Follow the design tokens in `app/globals.css` and the notes in [docs/DESIGN.md](docs/DESIGN.md).
- Never weaken a security control (CSP, sanitizer, CSRF, TLS verification) without discussing it in an issue first.
- Security problems: see [SECURITY.md](SECURITY.md) — do not open public issues.

## Releases

Maintainers tag `vX.Y.Z` on `main`; the `Release` workflow publishes `ghcr.io/craftedbyali/osmicmails`.
