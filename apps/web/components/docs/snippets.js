/**
 * Verbatim copies of the files in deploy/mailcow/, shown on /docs/mailcow.
 * The container image does not ship deploy/, so the docs carry their own copy;
 * tests/unit/docs-snippets.test.js fails if the two ever drift apart.
 */

// deploy/mailcow/nginx/osmicmails.conf.template
export const NGINX_SITE_TEMPLATE = `# OsmicMails site for nginx-mailcow.
# Installed as data/conf/nginx/osmicmails.conf in your mailcow-dockerized folder.
# __WEBMAIL_HOSTNAME__ must be in ADDITIONAL_SAN (mailcow.conf) so mailcow's
# ACME client puts it on the certificate. Do NOT add it to
# ADDITIONAL_SERVER_NAMES — that would serve mailcow's UI on it instead.

server {
  ssl_certificate /etc/ssl/mail/cert.pem;
  ssl_certificate_key /etc/ssl/mail/key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;
  ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
  ssl_ecdh_curve X25519:X448:secp384r1:secp256k1;
  ssl_session_cache shared:SSL:50m;
  ssl_session_timeout 1d;
  ssl_session_tickets off;
  include /etc/nginx/conf.d/listen_plain.active;
  include /etc/nginx/conf.d/listen_ssl.active;
  server_name __WEBMAIL_HOSTNAME__;
  server_tokens off;
  root /web;

  # Attachments up to MAX_ATTACHMENT_SIZE_MB, plus multipart overhead.
  client_max_body_size 64m;

  # Let mailcow's ACME client validate this name.
  location ^~ /.well-known/acme-challenge/ {
    allow all;
    default_type "text/plain";
  }

  if ($scheme = http) {
    return 301 https://$host$request_uri;
  }

  # Resolve the container at request time through Docker's DNS. nginx-mailcow
  # keeps starting (and mailcow keeps working) even while OsmicMails is down.
  resolver 127.0.0.11 valid=10s ipv6=off;
  set $osmicmails_upstream http://__UPSTREAM__;

  # Server-Sent Events: no buffering, long-lived.
  location = /api/realtime {
    proxy_pass $osmicmails_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;
  }

  location / {
    proxy_pass $osmicmails_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
}
`;

// deploy/mailcow/nginx/site.osmicmails.custom.template
export const SOGO_REDIRECT_TEMPLATE = `# OsmicMails replaces SOGo's web interface.
# Installed as data/conf/nginx/site.osmicmails.custom in your mailcow-dockerized
# folder; mailcow includes it in its own server blocks.
#
# Only the entry points of SOGo's web UI are redirected (exact matches win over
# mailcow's /SOGo prefix location), so the "Webmail" links in mailcow send
# users to OsmicMails. CalDAV/CardDAV (/SOGo/dav, /.well-known/caldav) and
# ActiveSync keep working if you still run SOGo for calendars and contacts.
# Delete this file to bring SOGo's web UI back.

location = /SOGo { return 302 https://__WEBMAIL_HOSTNAME__/; }
location = /SOGo/ { return 302 https://__WEBMAIL_HOSTNAME__/; }
location = /SOGo/so { return 302 https://__WEBMAIL_HOSTNAME__/; }
location = /SOGo/so/ { return 302 https://__WEBMAIL_HOSTNAME__/; }
`;

// deploy/mailcow/docker-compose.yml
export const MAILCOW_COMPOSE = `# OsmicMails as an add-on to mailcow: dockerized.
#
# Runs as its own Compose project (so mailcow's update.sh never touches it)
# and joins mailcow's internal network. Mail traffic stays on the host:
#
#   browser ─HTTPS─▶ nginx-mailcow ─▶ osmicmails-mailcow:3000
#                                        ├─ IMAPS 993  ─▶ dovecot-mailcow
#                                        ├─ SMTP 587   ─▶ postfix-mailcow
#                                        └─ Sieve 4190 ─▶ dovecot-mailcow
#
# Use install.sh, or see https://<your-webmail>/docs/mailcow for the manual steps.

name: osmicmails

services:
  osmicmails:
    image: \${OSMICMAILS_IMAGE:-ghcr.io/craftedbyali/osmicmails:latest}
    build:
      context: ../..
    container_name: osmicmails-mailcow
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_PATH: /data/webmail.db
      UPLOAD_DIR: /data/uploads
    # Loopback only. nginx-mailcow reaches the app over the mailcow network;
    # this port exists for health checks and for setups that put their own
    # reverse proxy in front of mailcow instead.
    ports:
      - '\${OSMICMAILS_BIND:-127.0.0.1:3004}:3000'
    volumes:
      - osmicmails-data:/data
    networks:
      mailcow:
        aliases:
          - osmicmails
    read_only: true
    tmpfs:
      - /tmp
      - /app/.next/cache
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 768M
    logging:
      driver: json-file
      options:
        max-size: '20m'
        max-file: '5'

networks:
  mailcow:
    external: true
    # <COMPOSE_PROJECT_NAME from mailcow.conf>_mailcow-network
    name: \${MAILCOW_NETWORK:-mailcowdockerized_mailcow-network}

volumes:
  osmicmails-data:
`;

// deploy/mailcow/osmicmails.env.example
export const MAILCOW_ENV_EXAMPLE = `# OsmicMails on a mailcow: dockerized host. install.sh fills this in; copy it to
# .env and edit by hand if you prefer. Full reference: /docs/configuration

# Public URL of the webmail (its own subdomain, e.g. webmail.example.com).
APP_URL=https://webmail.example.com
# openssl rand -hex 32  — keep it stable: changing it signs everyone out.
SESSION_SECRET=

# Mailcow's containers, reached over the internal mailcow network.
MAIL_IMAP_HOST=dovecot-mailcow
MAIL_IMAP_PORT=993
MAIL_IMAP_TLS=true
MAIL_SMTP_HOST=postfix-mailcow
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURE=false
MAIL_SMTP_REQUIRE_TLS=true
MAIL_SIEVE_HOST=dovecot-mailcow
MAIL_SIEVE_PORT=4190
# The internal names are not on mailcow's certificate, so verify the
# certificate against MAILCOW_HOSTNAME instead. Never disable verification.
MAIL_TLS_SERVERNAME=mail.example.com
MAIL_TLS_REJECT_UNAUTHORIZED=true

# nginx-mailcow is the only proxy that appends to X-Forwarded-For. Use 2 if
# Cloudflare (or another proxy) sits in front of mailcow.
TRUST_PROXY_HOPS=1
TRUST_CLOUDFLARE=false

# Mailboxes allowed to open /admin/diagnostics (comma-separated).
ADMIN_EMAILS=
# Keep below mailcow's message size limit (default 100 MB).
MAX_ATTACHMENT_SIZE_MB=50
MAX_MESSAGE_SIZE_MB=60
# Public integration docs at /docs. Set to false to hide them from your users.
DOCS_ENABLED=true

LOG_FORMAT=json
LOG_LEVEL=info
`;

/** A template with the placeholders install.sh fills in. */
export function renderTemplate(template, host = 'webmail.example.com') {
  return template
    .replaceAll('__WEBMAIL_HOSTNAME__', host)
    .replaceAll('__UPSTREAM__', 'osmicmails-mailcow:3000');
}
