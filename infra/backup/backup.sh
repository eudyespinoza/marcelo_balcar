#!/usr/bin/env bash
set -euo pipefail

run_backup() {
  local stamp dump_file
  stamp="$(date +%Y%m%d-%H%M%S)"
  dump_file="/tmp/marcelo-${stamp}.dump"
  until pg_isready -h "${POSTGRES_HOST:-db}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; do sleep 2; done
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${POSTGRES_HOST:-db}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --file="${dump_file}"
  restic backup "${dump_file}" /media --tag marcelo-balcar
  restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  rm -f "${dump_file}"
  date -Iseconds > /tmp/last-success
}

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

while true; do
  run_backup
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
