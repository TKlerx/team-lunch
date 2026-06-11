#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-team-lunch}"
export COMPOSE_PROJECT_NAME
POSTGRES_SERVICE="${POSTGRES_SERVICE:-db}"
POSTGRES_DB="${POSTGRES_DB:-teamlunch}"
POSTGRES_USER="${POSTGRES_USER:-teamlunch}"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-5}"
KEEP_DAYS="${KEEP_DAYS:-90}"
ALLOW_EMPTY_DATABASE_DEPLOY="${ALLOW_EMPTY_DATABASE_DEPLOY:-false}"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_file="${BACKUP_DIR}/team-lunch-${timestamp}.dump"

step() {
  printf '\n=== %s ===\n' "$1"
}

step "Prepare backup directory"
mkdir -p "$BACKUP_DIR"
printf 'Backup file: %s\n' "$backup_file"

step "Create PostgreSQL dump"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c > "$backup_file"

step "Verify backup archive"
if [ ! -s "$backup_file" ]; then
  printf 'Backup archive is empty: %s\n' "$backup_file" >&2
  exit 1
fi

archive_entries="$(docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore -l < "$backup_file" | wc -l | tr -d ' ')"
table_data_entries="$(docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore -l < "$backup_file" | grep -c 'TABLE DATA' || true)"

printf 'Archive entries: %s\n' "$archive_entries"
printf 'Table data entries: %s\n' "$table_data_entries"

if [ "${archive_entries:-0}" -eq 0 ]; then
  printf 'Backup archive contains no restorable entries: %s\n' "$backup_file" >&2
  exit 1
fi

if [ "${table_data_entries:-0}" -eq 0 ] && [ "$ALLOW_EMPTY_DATABASE_DEPLOY" != "true" ]; then
  printf 'Backup archive contains no table data entries: %s\n' "$backup_file" >&2
  printf 'For a fresh install, rerun with ALLOW_EMPTY_DATABASE_DEPLOY=true.\n' >&2
  exit 1
fi

step "Prune old dumps by age"
find "$BACKUP_DIR" -type f -name '*.dump' -mtime +"$KEEP_DAYS" -print -delete || true

step "Prune old dumps by count"
if [ "$BACKUP_KEEP_COUNT" -gt 0 ]; then
  ls -1t "$BACKUP_DIR"/team-lunch-*.dump 2>/dev/null \
    | awk -v keep="$BACKUP_KEEP_COUNT" 'NR > keep { print }' \
    | while IFS= read -r old_backup; do
        [ -n "$old_backup" ] || continue
        printf 'Removing old backup: %s\n' "$old_backup"
        rm -f "$old_backup"
      done
fi

step "Backup completed"
ls -lh "$backup_file"
