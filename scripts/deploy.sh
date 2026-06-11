#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-team-lunch}"
export COMPOSE_PROJECT_NAME

generate_app_version() {
  head_iso="$(git show -s --format=%cI HEAD)"
  head_date="$(TZ=UTC git show -s --date=format-local:%Y%m%d --format=%cd HEAD)"
  day_start="$(TZ=UTC git show -s --date=format-local:%Y-%m-%dT00:00:00.000Z --format=%cd HEAD)"
  sequence="$(git rev-list --count --first-parent --since="$day_start" --until="$head_iso" HEAD)"
  printf '%s.%s' "$head_date" "$sequence"
}

APP_VERSION="${APP_VERSION:-$(generate_app_version)}"
export APP_VERSION

step() {
  printf '\n=== %s ===\n' "$1"
}

step "Build metadata"
printf 'APP_VERSION=%s\n' "$APP_VERSION"
printf 'COMPOSE_FILE=%s\n' "$COMPOSE_FILE"
printf 'COMPOSE_PROJECT_NAME=%s\n' "$COMPOSE_PROJECT_NAME"
printf 'PORT=%s\n' "${PORT:-3000}"
printf 'BASE_PATH=%s\n' "${BASE_PATH:-}"
printf 'VITE_BASE_PATH=%s\n' "${VITE_BASE_PATH:-/}"

step "Compose data volumes"
docker compose -f "$COMPOSE_FILE" config --volumes

step "Build app and migrate images"
docker compose -f "$COMPOSE_FILE" build app
docker compose -f "$COMPOSE_FILE" build migrate

step "Start database"
docker compose -f "$COMPOSE_FILE" up -d --wait db

step "Production data safety verification"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint node migrate scripts/prisma-production-data-check.mjs

step "Pre-deploy PostgreSQL backup"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-5}" sh ./scripts/backup-postgres.sh

step "Prisma pre-deploy verification"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint node migrate scripts/prisma-predeploy-check.mjs

step "Prisma migrate deploy"
docker compose -f "$COMPOSE_FILE" run --rm migrate

step "Restart app"
docker compose -f "$COMPOSE_FILE" up -d --no-deps app

step "Post-deploy data safety verification"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint node migrate scripts/prisma-production-data-check.mjs

printf '\nDeploy completed successfully.\n'
