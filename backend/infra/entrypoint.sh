#!/bin/sh
set -eu

mkdir -p /app/media /app/staticfiles
chown -R app:app /app/media /app/staticfiles

if [ "${RUN_STARTUP_TASKS:-false}" = "true" ]; then
  gosu app python manage.py migrate --noinput
  gosu app python manage.py collectstatic --noinput
  if [ -n "${BOOTSTRAP_ADMIN_USERNAME:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
    gosu app python manage.py bootstrap_admin
  fi
fi

exec gosu app "$@"
