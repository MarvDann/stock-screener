#!/usr/bin/env bash
# Nightly Postgres backup for stockwatch.cloud, run from the stockwatch
# user's crontab (see deploy/README.md). Keeps two weeks of dumps.
#
# Restore with:
#   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <file>
set -euo pipefail

BACKUP_DIR="$HOME/backups"
KEEP_DAYS=14

DATABASE_URL="$(grep '^DATABASE_URL=' "$HOME/config/.env" | cut -d= -f2-)"
mkdir -p "$BACKUP_DIR"
umask 077
pg_dump --format=custom --file="$BACKUP_DIR/stockwatch-$(date -u +%Y-%m-%dT%H-%M-%S).dump" "$DATABASE_URL"
find "$BACKUP_DIR" -name 'stockwatch-*.dump' -mtime +"$KEEP_DAYS" -delete
