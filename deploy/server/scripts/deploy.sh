#!/usr/bin/env bash
# deploy/server/scripts/deploy.sh <production>
#
# Builds and (re)starts webmail from the commit currently checked out.
# Called over SSH by .github/workflows/deploy.yml (through /usr/local/bin/webmail-ci-deploy);
# safe to run by hand as the `webmail` user from the checkout.
#
# Data safety: mailbox settings, sessions and uploads live in the volume webmail_webmail-data (SQLite);
# the app migrates its own schema on start. Nothing here deletes data.
set -euo pipefail

die() { echo "deploy: $*" >&2; exit 1; }
say() { echo "── $*"; }

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in production) ;; *) die "usage: $0 <production>" ;; esac

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/../.." && pwd)"
ENV_DIR="$SERVER_DIR/$ENVIRONMENT"
for f in compose.env app.env; do
  [ -f "$ENV_DIR/$f" ] || die "missing $ENV_DIR/$f — copy $f.example and fill it in (deploy/server/README.md)"
done

# Plain KEY=value reader; env files are never sourced.
env_get() { grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
project="$(env_get "$ENV_DIR/compose.env" COMPOSE_PROJECT_NAME)"
[ "$project" = "webmail" ] || die "COMPOSE_PROJECT_NAME in $ENV_DIR/compose.env must be webmail (it names the data volume)"
port="$(env_get "$ENV_DIR/compose.env" WEB_PORT)"
[ -n "$port" ] || die "WEB_PORT is not set in $ENV_DIR/compose.env"

export DEPLOY_ENV="$ENVIRONMENT"
export APP_VERSION="$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)"
compose() { docker compose --project-directory "$SERVER_DIR" -f "$SERVER_DIR/compose.yml" --env-file "$ENV_DIR/compose.env" "$@"; }

say "$ENVIRONMENT: deploying $APP_VERSION"
say "building web"
compose build web
say "starting web"
compose up -d --wait --wait-timeout 120 web

say "waiting for http://127.0.0.1:$port/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 2
done
[ "${healthy:-}" = 1 ] || die "webmail is not healthy — check: docker compose -p $project logs web"
docker image prune -f >/dev/null 2>&1 || true
say "$ENVIRONMENT: done — $APP_VERSION"
