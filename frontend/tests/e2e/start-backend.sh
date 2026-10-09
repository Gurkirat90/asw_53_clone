#!/usr/bin/env bash
# Starts an isolated FastAPI backend for Playwright: a fresh temporary SQLite database (never the
# developer DB), migrated and seeded with a test-only demo user, on 127.0.0.1:8001.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="$BACKEND/.venv/bin/python"
PORT="${E2E_BACKEND_PORT:-8001}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-3001}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fiftythree-e2e.XXXXXX")"

export APP_ENV=test # also makes the backend ignore backend/.env
export DATABASE_URL="sqlite:///$TMP_DIR/e2e.db"
export DEMO_USER_EMAIL="demo@example.test"
export DEMO_USER_PASSWORD="${E2E_DEMO_PASSWORD:-e2e-demo-password}"
export TRUSTED_ORIGINS="http://127.0.0.1:$FRONTEND_PORT,http://localhost:$FRONTEND_PORT"
export LOG_LEVEL="${E2E_LOG_LEVEL:-WARNING}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

cd "$BACKEND"
"$PYTHON" -m alembic upgrade head
"$PYTHON" -m app.cli seed-demo-user
# Optional: demo zones/records (used for the docs/screenshots capture run).
if [[ "${E2E_SEED_DEMO_DATA:-0}" == "1" ]]; then "$PYTHON" -m app.cli seed-demo-data; fi
"$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" &
SERVER_PID=$!
wait "$SERVER_PID"
