#!/bin/sh
set -eu
exec gunicorn --chdir backend config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" --threads 4 \
  --timeout 120 --access-logfile - --error-logfile -
