#!/usr/bin/env bash
# A dump of PostgreSQL, for cron to take every night; infra/README.md, "Backups". It keeps the newest
# $KEEP in $BACKUP_DIR, and deletes none until the new one has read back. A dump holds the accounts,
# so only this user can read the folder. It prints no secret.
#
#   30 5 * * *  /home/deploy/arablyzer/infra/backup-postgres.sh >> /home/deploy/backups/arablyzer/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-$HOME/backups/arablyzer}"
KEEP="${KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
PART="$DEST/db-$STAMP.dump.part"
compose() { docker compose -p arablyzer -f infra/compose.yaml -f infra/compose.coolify.yaml --env-file infra/.env "$@"; }
trap 'code=$?; rm -f "$PART"; [ "$code" = 0 ] || echo "$(date -Is) backup FAILED (exit $code)"' EXIT

umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"

# The custom format is compressed. The user and the database are read inside the container.
compose exec -T postgres sh -c 'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom' < /dev/null > "$PART"
compose exec -T postgres pg_restore --list < "$PART" > /dev/null
mv "$PART" "$DEST/db-$STAMP.dump"

ls -1t "$DEST"/db-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --
echo "$(date -Is) backup ok: db-$STAMP.dump $(du -h "$DEST/db-$STAMP.dump" | cut -f1)"
