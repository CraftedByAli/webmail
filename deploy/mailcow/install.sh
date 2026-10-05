#!/usr/bin/env bash
# OsmicMails installer for mailcow: dockerized.
#
# Runs OsmicMails next to mailcow on the same host, serves it through mailcow's
# own nginx and certificate, and (optionally) points SOGo's webmail links at it.
#
#   git clone https://github.com/CraftedByAli/webmail.git /opt/osmicmails
#   cd /opt/osmicmails/deploy/mailcow
#   sudo ./install.sh
#
# Options:
#   --mailcow-dir DIR    mailcow-dockerized folder (default: /opt/mailcow-dockerized)
#   --hostname NAME      public webmail hostname (default: webmail.<your domain>)
#   --admin EMAIL        mailbox allowed to open /admin/diagnostics
#   --build              build the image from this checkout instead of pulling it
#   --keep-sogo          do not redirect SOGo's web UI to OsmicMails
#   --yes                accept the defaults; do not ask questions
#   --uninstall          remove the nginx files and stop OsmicMails (data is kept)
#
# Nothing in mailcow is changed without asking first (unless --yes), every file
# that is replaced is backed up, and nginx is only restarted after `nginx -t`
# accepts the new configuration.

set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAILCOW_DIR="/opt/mailcow-dockerized"
WEBMAIL_HOST=""
ADMIN_EMAIL=""
BUILD=0
KEEP_SOGO=0
ASSUME_YES=0
UNINSTALL=0

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*" >&2; }
die() {
  printf '  \033[31m✗\033[0m %s\n' "$*" >&2
  exit 1
}

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mailcow-dir) MAILCOW_DIR="${2:?}"; shift 2 ;;
    --hostname) WEBMAIL_HOST="${2:?}"; shift 2 ;;
    --admin) ADMIN_EMAIL="${2:?}"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --keep-sogo) KEEP_SOGO=1; shift ;;
    --yes | -y) ASSUME_YES=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

confirm() {
  local prompt="$1" default="${2:-y}" answer
  if [[ $ASSUME_YES -eq 1 ]]; then [[ "$default" == y ]]; return; fi
  read -r -p "  $prompt [$([[ $default == y ]] && echo Y/n || echo y/N)] " answer </dev/tty
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]]
}

ask() {
  local prompt="$1" default="$2" answer
  if [[ $ASSUME_YES -eq 1 ]]; then echo "$default"; return; fi
  read -r -p "  $prompt [$default] " answer </dev/tty
  echo "${answer:-$default}"
}

# --- Preconditions -----------------------------------------------------------

command -v docker >/dev/null || die "Docker is not installed."
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose is not installed."
fi
docker info >/dev/null 2>&1 || die "Cannot talk to Docker. Run as root or as a member of the docker group."

CONF="$MAILCOW_DIR/mailcow.conf"
[[ -f "$CONF" ]] || die "No mailcow.conf in $MAILCOW_DIR. Pass --mailcow-dir."
NGINX_DIR="$MAILCOW_DIR/data/conf/nginx"
[[ -d "$NGINX_DIR" ]] || die "$NGINX_DIR not found — is this a mailcow-dockerized folder?"

# Missing keys read as empty (grep's "no match" must not trip set -e/pipefail).
conf_get() { { grep -E "^$1=" "$CONF" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

MAILCOW_HOSTNAME="$(conf_get MAILCOW_HOSTNAME)"
PROJECT="$(conf_get COMPOSE_PROJECT_NAME)"
PROJECT="${PROJECT:-mailcowdockerized}"
NETWORK="${PROJECT}_mailcow-network"
[[ -n "$MAILCOW_HOSTNAME" ]] || die "MAILCOW_HOSTNAME is not set in mailcow.conf."

mailcow() { (cd "$MAILCOW_DIR" && "${COMPOSE[@]}" "$@"); }
osmic() { (cd "$HERE" && "${COMPOSE[@]}" "$@"); }

reload_nginx() {
  if ! mailcow exec -T nginx-mailcow nginx -t >/dev/null 2>&1; then
    return 1
  fi
  mailcow restart nginx-mailcow >/dev/null
}

# --- Uninstall ---------------------------------------------------------------

if [[ $UNINSTALL -eq 1 ]]; then
  bold "Removing OsmicMails from mailcow"
  rm -f "$NGINX_DIR/osmicmails.conf" "$NGINX_DIR/site.osmicmails.custom"
  reload_nginx && ok "nginx-mailcow restarted without OsmicMails (SOGo's web UI is back)" ||
    warn "nginx-mailcow did not accept its configuration — check: docker compose exec nginx-mailcow nginx -t"
  osmic down && ok "OsmicMails stopped. Its data volume is kept (docker volume rm osmicmails_osmicmails-data to delete it)."
  exit 0
fi

# --- Gather settings ---------------------------------------------------------

bold "OsmicMails for mailcow"
info "mailcow:  $MAILCOW_DIR ($MAILCOW_HOSTNAME, network $NETWORK)"

docker network inspect "$NETWORK" >/dev/null 2>&1 ||
  die "Docker network $NETWORK not found. Is mailcow running?"

if [[ "$(conf_get SKIP_LETS_ENCRYPT)" =~ ^[yY] ]]; then
  warn "SKIP_LETS_ENCRYPT=y: mailcow will not issue a certificate for the webmail hostname."
  warn "Make sure your own certificate in data/assets/ssl covers it."
fi

DEFAULT_HOST="webmail.${MAILCOW_HOSTNAME#*.}"
[[ -n "$WEBMAIL_HOST" ]] || WEBMAIL_HOST="$(ask "Webmail hostname" "$DEFAULT_HOST")"
WEBMAIL_HOST="$(printf '%s' "$WEBMAIL_HOST" | tr '[:upper:]' '[:lower:]')"
HOST_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
[[ "$WEBMAIL_HOST" =~ $HOST_RE ]] || die "\"$WEBMAIL_HOST\" is not a valid hostname."
[[ "$WEBMAIL_HOST" != "$MAILCOW_HOSTNAME" ]] ||
  die "Use a separate name (e.g. $DEFAULT_HOST); $MAILCOW_HOSTNAME already serves mailcow's UI."

if ! getent hosts "$WEBMAIL_HOST" >/dev/null 2>&1; then
  warn "$WEBMAIL_HOST does not resolve yet. Add a DNS record (A/AAAA or CNAME to $MAILCOW_HOSTNAME)"
  warn "before mailcow requests the certificate."
fi

# --- .env --------------------------------------------------------------------

ENV_FILE="$HERE/.env"
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i.tmp "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.tmp"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  ok "Keeping existing $ENV_FILE (SESSION_SECRET unchanged)"
else
  (umask 077 && cp "$HERE/osmicmails.env.example" "$ENV_FILE")
  if command -v openssl >/dev/null; then
    SECRET="$(openssl rand -hex 32)"
  else
    SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  set_env SESSION_SECRET "$SECRET"
  [[ -n "$ADMIN_EMAIL" ]] || ADMIN_EMAIL="$(ask "Admin mailbox for diagnostics (optional)" "")"
  ok "Created $ENV_FILE"
fi
set_env APP_URL "https://$WEBMAIL_HOST"
set_env MAIL_TLS_SERVERNAME "$MAILCOW_HOSTNAME"
set_env MAILCOW_NETWORK "$NETWORK"
[[ -z "$ADMIN_EMAIL" ]] || set_env ADMIN_EMAILS "$ADMIN_EMAIL"
chmod 600 "$ENV_FILE"

# --- Start the container -----------------------------------------------------

if [[ $BUILD -eq 1 ]]; then
  info "Building the image from this checkout (a few minutes)…"
  osmic build
else
  info "Pulling the image…"
  osmic pull || die "Pull failed. Re-run with --build to build from source."
fi
osmic up -d
info "Waiting for OsmicMails to become healthy…"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' osmicmails-mailcow 2>/dev/null || true)"
  [[ "$status" == healthy ]] && break
  sleep 2
done
[[ "${status:-}" == healthy ]] || die "OsmicMails did not become healthy. See: docker logs osmicmails-mailcow"
ok "OsmicMails is running (container osmicmails-mailcow)"

# --- Certificate -------------------------------------------------------------

SAN="$(conf_get ADDITIONAL_SAN)"
if [[ ",$SAN," == *",$WEBMAIL_HOST,"* ]]; then
  ok "$WEBMAIL_HOST is already in ADDITIONAL_SAN"
elif confirm "Add $WEBMAIL_HOST to ADDITIONAL_SAN in mailcow.conf so mailcow's certificate covers it?" y; then
  cp "$CONF" "$CONF.osmicmails.bak"
  NEW_SAN="${SAN:+$SAN,}$WEBMAIL_HOST"
  if grep -qE '^ADDITIONAL_SAN=' "$CONF"; then
    sed -i.tmp "s|^ADDITIONAL_SAN=.*|ADDITIONAL_SAN=${NEW_SAN}|" "$CONF" && rm -f "$CONF.tmp"
  else
    printf 'ADDITIONAL_SAN=%s\n' "$NEW_SAN" >>"$CONF"
  fi
  ok "ADDITIONAL_SAN=$NEW_SAN (backup: mailcow.conf.osmicmails.bak)"
  if confirm "Recreate acme-mailcow now to request the certificate?" y; then
    mailcow up -d >/dev/null
    ok "acme-mailcow is requesting the certificate (follow: docker compose logs -f acme-mailcow)"
  else
    warn "Run 'docker compose up -d' in $MAILCOW_DIR to request the certificate."
  fi
else
  warn "Without $WEBMAIL_HOST on the certificate, browsers will show a warning."
fi

# --- nginx -------------------------------------------------------------------

render() {
  sed -e "s|__WEBMAIL_HOSTNAME__|$WEBMAIL_HOST|g" -e "s|__UPSTREAM__|osmicmails-mailcow:3000|g" "$1"
}

NGINX_FILES=(osmicmails.conf site.osmicmails.custom)
SNAPSHOT="$(mktemp -d)"
trap 'rm -rf "$SNAPSHOT"' EXIT
# Remember exactly what was there before, so a rejected config can be undone.
for f in "${NGINX_FILES[@]}"; do
  [[ -f "$NGINX_DIR/$f" ]] && cp -p "$NGINX_DIR/$f" "$SNAPSHOT/$f"
done

render "$HERE/nginx/osmicmails.conf.template" >"$NGINX_DIR/osmicmails.conf"
if [[ $KEEP_SOGO -eq 0 ]] &&
  confirm "Send SOGo's webmail links to OsmicMails? (CalDAV/CardDAV/ActiveSync keep working)" y; then
  render "$HERE/nginx/site.osmicmails.custom.template" >"$NGINX_DIR/site.osmicmails.custom"
  SOGO_NOTE="SOGo's web UI now redirects to https://$WEBMAIL_HOST"
else
  rm -f "$NGINX_DIR/site.osmicmails.custom"
  SOGO_NOTE="SOGo's web UI is unchanged"
fi

if reload_nginx; then
  ok "nginx-mailcow serves https://$WEBMAIL_HOST"
else
  for f in "${NGINX_FILES[@]}"; do
    if [[ -f "$SNAPSHOT/$f" ]]; then cp -p "$SNAPSHOT/$f" "$NGINX_DIR/$f"; else rm -f "$NGINX_DIR/$f"; fi
  done
  die "nginx-mailcow rejected the configuration; the previous files were restored. Check: docker compose exec nginx-mailcow nginx -t"
fi

# --- Done --------------------------------------------------------------------

echo
bold "Done."
info "Webmail:   https://$WEBMAIL_HOST"
info "$SOGO_NOTE"
info "Settings:  $ENV_FILE"
info "Update:    git pull && ./install.sh --yes"
echo
info "Recommended in the mailcow UI (System → Configuration):"
info "  • Customize → App links: add \"Webmail\" → https://$WEBMAIL_HOST"
info "  • Optional: set SKIP_SOGO=y in mailcow.conf if nobody needs SOGo's"
info "    calendars, contacts or ActiveSync (see /docs/mailcow)."
