#!/bin/sh
# Fails fast: the container stops (and the deploy fails) if migrations or seeding fail.
set -eu

case "${DATABASE_URL:-}" in
  sqlite:///*)
    db_path="${DATABASE_URL#sqlite:///}"
    db_dir="$(dirname "$db_path")"
    if [ ! -d "$db_dir" ] || [ ! -w "$db_dir" ]; then
      echo "entrypoint: database directory $db_dir is missing or not writable by $(id -un)." >&2
      echo "entrypoint: mount a persistent volume there (see README, Deployment)." >&2
      exit 1
    fi
    ;;
esac

echo "entrypoint: applying migrations"
python -m alembic upgrade head

echo "entrypoint: ensuring the demo user exists"
python -m app.cli seed-demo-user

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "entrypoint: loading demo data (skipped if the demo user already has zones)"
  python -m app.cli seed-demo-data
fi

echo "entrypoint: starting uvicorn on port ${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 \
  --proxy-headers --forwarded-allow-ips "*"
