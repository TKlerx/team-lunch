#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

step() {
  printf '\n=== %s ===\n' "$1"
}

step "Deployment settings"
printf 'COMPOSE_FILE=%s\n' "$COMPOSE_FILE"
printf 'PORT=%s\n' "${PORT:-3000}"
printf 'BASE_PATH=%s\n' "${BASE_PATH:-}"
printf 'VITE_BASE_PATH=%s\n' "${VITE_BASE_PATH:-/}"

step "Validate compose config"
docker compose -f "$COMPOSE_FILE" config >/dev/null

step "Build app image"
docker compose -f "$COMPOSE_FILE" build app

step "Start database"
docker compose -f "$COMPOSE_FILE" up -d --wait db

step "Prisma migrate deploy"
docker compose -f "$COMPOSE_FILE" run --rm migrate

step "Restart app"
docker compose -f "$COMPOSE_FILE" up -d --no-deps app

printf '\nDeploy completed successfully.\n'
