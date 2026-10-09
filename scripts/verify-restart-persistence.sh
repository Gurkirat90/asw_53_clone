#!/usr/bin/env bash
# Verifies that data survives a backend restart: starts uvicorn on a fresh temporary SQLite file,
# creates a zone + record through the API, stops uvicorn, starts it again on the SAME file, and
# checks that the session, zone, and record are all still there. Never touches backend/data/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="$BACKEND/.venv/bin/python"
PORT="${PERSISTENCE_PORT:-8002}"
BASE="http://127.0.0.1:$PORT"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fiftythree-persistence.XXXXXX")"
JAR="$TMP_DIR/cookies.txt"
PASSWORD="persistence-check-password"

export APP_ENV=test
export DATABASE_URL="sqlite:///$TMP_DIR/persistence.db"
export DEMO_USER_PASSWORD="$PASSWORD"
export LOG_LEVEL=WARNING

SERVER_PID=""
stop_server() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; fi
}
cleanup() { stop_server; rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

start_server() {
  (cd "$BACKEND" && exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT") &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    curl -sf "$BASE/healthz" >/dev/null && return 0
    sleep 0.2
  done
  echo "FAIL: backend did not start" >&2
  exit 1
}

json_field() { "$PYTHON" -c "import json,sys; print(json.load(sys.stdin)$1)"; }

cd "$BACKEND"
"$PYTHON" -m alembic upgrade head >/dev/null 2>&1
"$PYTHON" -m app.cli seed-demo-user >/dev/null

echo "1. start backend and create data"
start_server
curl -sf -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"demo@example.test\",\"password\":\"$PASSWORD\"}" "$BASE/api/v1/auth/login" >/dev/null
ZONE_ID=$(curl -sf -b "$JAR" -H 'Content-Type: application/json' \
  -d '{"name":"persist.example.com","comment":"restart check"}' "$BASE/api/v1/hosted-zones" | json_field '["zone_id"]')
RECORD_ID=$(curl -sf -b "$JAR" -H 'Content-Type: application/json' \
  -d '{"name":"www","record_type":"A","values":[{"value":"192.0.2.10"}]}' \
  "$BASE/api/v1/hosted-zones/$ZONE_ID/records" | json_field '["id"]')
echo "   created zone $ZONE_ID and record $RECORD_ID"

echo "2. restart backend on the same database file"
stop_server
start_server

echo "3. verify session, zone, and record survived"
ME=$(curl -sf -b "$JAR" "$BASE/api/v1/auth/me" | json_field '["email"]')
COMMENT=$(curl -sf -b "$JAR" "$BASE/api/v1/hosted-zones/$ZONE_ID" | json_field '["comment"]')
VALUE=$(curl -sf -b "$JAR" "$BASE/api/v1/hosted-zones/$ZONE_ID/records/$RECORD_ID" | json_field '["display_values"][0]')
[[ "$ME" == "demo@example.test" ]] || { echo "FAIL: session lost ($ME)"; exit 1; }
[[ "$COMMENT" == "restart check" ]] || { echo "FAIL: zone lost ($COMMENT)"; exit 1; }
[[ "$VALUE" == "192.0.2.10" ]] || { echo "FAIL: record lost ($VALUE)"; exit 1; }
echo "PASS: session ($ME), zone ($COMMENT), and record ($VALUE) persisted across a restart"
