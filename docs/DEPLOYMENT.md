# Deployment

This is a condensed runbook; the README has the full reference.

## 1. Host

- Linux host with Docker Engine + Compose plugin, outbound access to Mailcow on 993 and 587.
- DNS: `webmail.example.com` → host. If using Cloudflare, proxy (orange cloud) is fine.

## 2. Configure

```bash
git clone <repo> /opt/webmail && cd /opt/webmail
cp .env.example .env
```

Minimum `.env` for production:

```env
APP_URL=https://webmail.example.com
SESSION_SECRET=<openssl rand -hex 32>
MAIL_IMAP_HOST=mail.example.com
MAIL_IMAP_PORT=993
MAIL_IMAP_TLS=true
MAIL_SMTP_HOST=mail.example.com
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURE=false
MAIL_SMTP_REQUIRE_TLS=true
MAX_ATTACHMENT_SIZE_MB=50
ADMIN_EMAILS=admin@example.com
LOG_FORMAT=json
LOG_LEVEL=info
```

Check connectivity: `MAIL_USER=you@example.com MAIL_PASS='…' docker compose run --rm webmail node scripts/check-mailcow.js`
(or run it with Node on the host).

## 3. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose logs -f webmail
curl -s http://127.0.0.1:3000/api/ready
```

## 4. Reverse proxy + HTTPS

### Nginx + certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/webmail.conf
sudo sed -i 's/webmail.example.com/YOUR_HOST/g' /etc/nginx/sites-available/webmail.conf
sudo ln -s /etc/nginx/sites-available/webmail.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d YOUR_HOST
sudo nginx -t && sudo systemctl reload nginx
```

Key settings already in the file: `client_max_body_size 64m`, `proxy_buffering off` for `/api/realtime`,
forwarded headers, HTTP→HTTPS redirect, HSTS.

### Caddy

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

### Cloudflare

- SSL/TLS mode **Full (strict)**; origin certificate on Nginx/Caddy.
- Disable Rocket Loader, Auto Minify, Email Address Obfuscation (they inject scripts/rewrite HTML and break CSP nonces).
- Set a Page Rule or Cache Rule to bypass cache for `/api/*` (responses are already `no-store`).
- SSE works through Cloudflare; the client reconnects when Cloudflare closes long connections.

## 5. Updates

```bash
cd /opt/webmail && git pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

Sessions survive updates (SQLite volume) as long as `SESSION_SECRET` is unchanged.

## 6. Monitoring

- Liveness: `GET /api/health` → 200 `{"status":"ok"}`.
- Readiness: `GET /api/ready` → 200 when DB opens and IMAP/SMTP ports are reachable; 503 otherwise.
- Logs: JSON lines on stdout (`docker compose logs`). Alert on `level >= 50`, on `"operation":"auth.login","success":false`
  spikes and on `"slow operation"`.
- Admin diagnostics: sign in as an `ADMIN_EMAILS` address → account menu → Diagnostics.

## 7. Backup

- `docker run --rm -v webmail_webmail-data:/data -v $PWD:/backup alpine tar czf /backup/webmail-data.tgz /data`
- Store `.env` (contains `SESSION_SECRET`) securely.

## Without Docker (systemd)

```bash
npm ci && npm run build
```

`/etc/systemd/system/webmail.service`:

```ini
[Unit]
Description=OsmicMails
After=network.target

[Service]
User=webmail
WorkingDirectory=/opt/webmail
EnvironmentFile=/opt/webmail/.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/webmail/data

[Install]
WantedBy=multi-user.target
```

Copy `.next/static` to `.next/standalone/.next/static` and `public` to `.next/standalone/public` after each build
(the Dockerfile does this automatically).
