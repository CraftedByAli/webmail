# Contributing

Thanks for helping improve OsmicMails! Bug reports, docs fixes and features are all welcome. If you just like the
project, a ⭐ on GitHub helps other Mailcow users find it.

## How changes flow

```
your fork / branch ──PR──▶ staging ──PR (maintainer)──▶ main ──tag vX.Y.Z──▶ release image
```

| Branch      | What it is                              | Who can merge                            |
| ----------- | --------------------------------------- | ---------------------------------------- |
| `main`      | Released, production-ready code         | Maintainer only, and only from `staging` |
| `staging`   | Integration branch for the next release | Maintainer, after review and green CI    |
| your branch | One feature or fix, in your fork        | You (it's yours)                         |

- Every contribution is a pull request into **`staging`**. Pull requests into `main` from any other branch fail the
  required _Source branch is staging_ check.
- Nobody pushes directly to `main` or `staging`; both require a pull request and a passing CI run (`test`).
- When `staging` is ready, the maintainer opens a `staging → main` pull request and merges it with a **merge commit**
  (not squash), so the two branches keep the same history. Releases are tagged on `main`.

## Step by step

1. **Fork** [CraftedByAli/webmail](https://github.com/CraftedByAli/webmail) on GitHub, then clone your fork:

   ```bash
   git clone https://github.com/<you>/webmail.git osmicmails
   cd osmicmails
   git remote add upstream https://github.com/CraftedByAli/webmail.git
   ```

2. **Branch off the latest `staging`**, named after the change:

   ```bash
   git fetch upstream
   git switch -c fix/compose-autosave upstream/staging
   ```

   Prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `test/`.

3. **Make the change** and run the checks (see below). Commit with a message that says what changed and why.

4. **Push and open a pull request** with **base: `staging`**:

   ```bash
   git push -u origin fix/compose-autosave
   ```

   Fill in the template. CI runs automatically; the first run from a new contributor waits for the maintainer's approval.

5. **Review.** The maintainer may ask for changes — push more commits to the same branch. Once approved and green, the
   maintainer merges it into `staging`.

6. **Keep your branch current** if `staging` moves on:

   ```bash
   git fetch upstream && git rebase upstream/staging && git push --force-with-lease
   ```

For larger features, open an issue first so we can agree on the approach before you write the code.

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
- Never commit secrets, real mailbox addresses or passwords — not in code, tests, logs or screenshots.
- Security problems: see [SECURITY.md](SECURITY.md) — do not open public issues.

## For the maintainer: releasing

1. Open a pull request **`staging → main`** and check the combined changes.
2. Merge it with **Create a merge commit**.
3. Bump `version` in `package.json` if needed, then tag `main`:

   ```bash
   git switch main && git pull
   git tag v0.3.0 && git push origin v0.3.0
   ```

   The `Release` workflow publishes `ghcr.io/craftedbyali/osmicmails:0.3.0` and `:latest`.

Branch rules (GitHub → Settings → Rules → Rulesets) enforce all of the above; repository admins can merge but cannot
push directly to `main` or `staging`.
