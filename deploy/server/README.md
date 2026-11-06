# webmail on the OsmicSoft server

| | Production |
|---|---|
| Address | https://webmail.osmicsoft.com |
| Checkout (owner `webmail`) | `/srv/apps/webmail/production` |
| Branch | `main` (work lands on `staging`; only `staging` merges into `main`) |
| Compose project | `webmail` (container `webmail-web-1`, data volume `webmail_webmail-data`) |
| Web port | 127.0.0.1:3040 (block 3040–3049, `/srv/apps/PORTS.md`) |
| Settings | `production/compose.env`, `production/app.env` (600, git-ignored; templates `*.example`) |
| Mail server | the local Mailcow (`/opt/mailcow-dockerized`), IMAP/SMTP/ManageSieve as set in `app.env` |
| Deploy log | `/var/log/webmail/deploy-production.log` |

## How a deploy runs

`.github/workflows/deploy.yml` runs after CI passes on `main` and connects as `webmail` with the production key.
`authorized_keys` pins that key to `/usr/local/bin/webmail-ci-deploy production` (source:
`scripts/webmail-ci-deploy`), which accepts only `deploy <40-hex sha>`, checks the commit is on `origin/main`,
checks it out and runs `scripts/deploy.sh production`: build the image from `apps/web`, `up -d --wait`, wait
for `/api/health`.

By hand:

```bash
cd /srv/apps/webmail/production && sudo -u webmail -H git fetch && \
  sudo -u webmail git checkout --detach origin/main && \
  sudo -u webmail deploy/server/scripts/deploy.sh production
```

## Setting it up on a new server

1. User: `adduser --system --group --shell /bin/bash webmail && usermod -aG docker webmail`;
   `install -d -o webmail -m 750 /var/log/webmail`.
2. Read-only GitHub deploy key: `sudo -u webmail ssh-keygen -t ed25519 -f ~/.ssh/github_webmail -N ""`, add the
   `.pub` under GitHub → Settings → Deploy keys.
3. Checkout: `git clone -b main … /srv/apps/webmail/production` as `webmail`, then
   `git config core.sshCommand "ssh -i ~/.ssh/github_webmail -o IdentitiesOnly=yes"`.
4. Settings: `cp production/compose.env.example production/compose.env` and
   `cp production/app.env.example production/app.env` (600), fill in `app.env`.
5. Nginx: copy `production/nginx.conf` to `/etc/nginx/sites-available/webmail.conf`, link it into
   `sites-enabled`, `nginx -t`, reload; certificate with certbot (HTTP-01 webroot `/var/www/certbot`).
6. CI: install `scripts/webmail-ci-deploy` as `/usr/local/bin/webmail-ci-deploy` (root, 755). Generate an
   Actions key pair, put the public half in `/home/webmail/.ssh/authorized_keys` as
   `restrict,command="/usr/local/bin/webmail-ci-deploy production" ssh-ed25519 …`, and the private half in the
   GitHub environment `production` as the secret `DEPLOY_SSH_KEY` (copy kept in
   `/root/.credentials/webmail/actions-production`).
7. First deploy by hand (above); after that every merge into `main` deploys itself.
