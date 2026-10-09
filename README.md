# Fiftythree

> **Demo login**
>
> - **Email: `demo@example.test`**
> - **Password: `fiftythree-demo`**
>
> **Live demo: https://fiftythree-pi.vercel.app** (the login page also has a **Use demo
> credentials** button).

A functional simulation of the AWS Route 53 web console, built for the Scaler SDE Fullstack
assignment ([PDF](docs/assignment/Scaler_SDE_Fullstack_Assignment_-_AWS_Route53_Clone.pdf)). It
reproduces the console's look, navigation, and core hosted-zone and DNS-record workflows, with
real CRUD persisted in SQLite through a FastAPI API.

> **Simulation only.** Fiftythree never answers DNS queries, publishes or propagates records,
> delegates domains, contacts AWS, provisions resources, or implements real IAM, Organizations,
> or billing. Name servers shown for a zone are synthetic `.invalid` hosts. Login is a local mock.

Requirements: [docs/PRD.md](docs/PRD.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) ·
Completion report: [docs/COMPLETION_REPORT.md](docs/COMPLETION_REPORT.md)

## Hosted demo

**Live: https://fiftythree-pi.vercel.app** (frontend on Vercel) with the API on Railway
(`https://fiftythree-api-production.up.railway.app`, health check `/healthz`) and SQLite on a
Railway volume. Data survives backend redeploys (verified).

Sign in with **`demo@example.test` / `fiftythree-demo`**. This is a public demo password: the
backend reads it from `DEMO_USER_PASSWORD`, and the login page shows it (with a "Use demo
credentials" button) when the frontend is built with `NEXT_PUBLIC_DEMO_EMAIL` and
`NEXT_PUBLIC_DEMO_PASSWORD`. Both example env files already contain these values.

## Features

- **Console shell:** dark top navigation, collapsible side navigation (Dashboard, Hosted zones,
  Health checks, Profiles, Traffic policies, Resolver), breadcrumbs, one notification bar, demo
  account menu with sign-out. Dashboard, Health checks, Traffic policies, Resolver, and Profiles
  are "Coming soon" pages.
- **Mock authentication:** sign in / sign out with a seeded demo user; server-side sessions in an
  HttpOnly cookie; refresh keeps you signed in; expired sessions return you to the login page.
- **Hosted zones:** list with server-side search (name or description), Type filter, sorting,
  pagination, and page size, all kept in the URL; create (public or simulated private) with
  validation; zone details with synthetic name servers; edit the description; delete with typed
  confirmation. Each new zone gets protected default NS and SOA records.
- **DNS records** for A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, and CAA: list with search by name,
  type, or value, Type and Routing policy filters, sorting, pagination; a details panel;
  type-specific create/edit forms (multi-value lists, structured MX/SRV/CAA rows, TTL presets);
  in-place edits; delete with confirmation. Duplicate record sets, CNAME at the apex, CNAME
  coexistence, and out-of-zone names are rejected. Default NS/SOA records are view-only.
- Validation runs on both sides with identical rules (pinned by a shared test fixture); errors
  appear on the exact field or value row.

### Limitations / out of scope

Real DNS resolution, propagation, delegation, domain registration, health checks, traffic flow,
DNSSEC, query logging, IAM, billing, alias records, non-simple routing policies, tags, and VPC
association are not implemented. Only one demo user exists. Optional bonus features (import,
export, bulk delete, dark mode, keyboard shortcuts) are not implemented yet.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4 (App Router), React 19.3, TypeScript 5.9 (strict), Cloudscape Design System 3 (Visual Refresh), TanStack Query 5 |
| Backend | Python 3.12, FastAPI 0.143, Pydantic 2.14, pydantic-settings, SQLAlchemy 2.1, Alembic 1.20, argon2-cffi |
| Database | SQLite (one file, foreign keys enforced, Alembic migrations) |
| Tests | pytest + httpx, Vitest + React Testing Library, Playwright + axe-core |
| Tooling | ruff, ESLint, `tsc`, GitHub Actions, Docker |

## Repository layout

```text
.
├── backend/            FastAPI app (app/), Alembic (alembic/), Dockerfile, scripts/ (perf check)
├── frontend/           Next.js app (app/, components/, lib/), tests/unit, tests/e2e
├── shared/             dns-validation-cases.json (run by both test suites)
├── docs/               PRD, API, DATABASE, ARCHITECTURE, DECISIONS, VISUAL_QA, COMPLETION_REPORT, screenshots/
├── scripts/            verify-restart-persistence.sh
├── render.yaml         Render blueprint for the backend (Docker + persistent disk)
├── Makefile            all developer commands
└── .github/workflows/  CI: backend, frontend, end-to-end
```

## Prerequisites

- Python 3.12+ (`python3.12` on PATH, or `make setup PYTHON=python3.13`)
- Node.js 22 LTS with its bundled npm 10 (`frontend/.nvmrc`)
- GNU Make, curl; Docker only if you want to build the backend image

## Local setup

1. Install dependencies (creates `backend/.venv`, runs `npm ci`):

   ```bash
   make setup
   ```

2. Create the environment files from the examples:

   ```bash
   cp backend/.env.example backend/.env
   ```

   ```bash
   cp frontend/.env.example frontend/.env.local
   ```

3. The examples already set the demo login to `demo@example.test` / `fiftythree-demo` (backend
   `DEMO_USER_PASSWORD`; frontend `NEXT_PUBLIC_DEMO_*` for the login-page hint). Change both if you
   want a different password. `.env` files are gitignored.

4. Create the database and the demo user:

   ```bash
   make migrate
   ```

   ```bash
   make seed
   ```

5. Optional: load demo data (three zones, one record of each of the nine types, and twelve extra
   A records for paging). It does nothing if the demo user already has zones.

   ```bash
   make seed-demo-data
   ```

6. Run the backend and the frontend in two terminals:

   ```bash
   make backend-run
   ```

   ```bash
   make frontend-run
   ```

7. Open **http://localhost:3000** (use `localhost`, not the "Network" IP Next.js prints) and sign
   in with **`demo@example.test` / `fiftythree-demo`** (or click **Use demo credentials**).

The API runs on http://127.0.0.1:8000 with interactive docs at http://127.0.0.1:8000/docs in
development. The browser only talks to http://localhost:3000; Next.js proxies `/api/*` to the API.

## Commands

| Command | Purpose |
|---|---|
| `make setup` | Create `backend/.venv`, install backend and frontend dependencies |
| `make migrate` | `alembic upgrade head` (creates `backend/data/`) |
| `make seed` | Create the demo user if missing (`make seed SEED_ARGS=--reset-password` resets its password) |
| `make seed-demo-data` | Load demo zones and records for the demo user (skips if it has zones) |
| `make backend-run` / `make frontend-run` | API on 127.0.0.1:8000 / web app on port 3000 |
| `make backend-lint` / `make backend-test` | ruff / pytest |
| `make frontend-lint` / `make frontend-typecheck` / `make frontend-test` / `make frontend-build` | ESLint / `tsc --noEmit` / Vitest / `next build` |
| `make e2e` | Playwright end-to-end suite against an isolated backend and database |
| `make test` | Backend and frontend unit tests |
| `make check` | All lint, typecheck, unit tests, and the frontend build (what CI runs first) |
| `make verify-persistence` | Proves data survives a backend restart (temporary database) |
| `make perf` | Times the list endpoints with 100 zones and 1,000 records (temporary database) |

## Testing

- **Backend** (`make backend-test`, 317 tests): auth and sessions, error envelope, migrations,
  foreign keys and cascades, all hosted-zone and record endpoints for the nine types, validation
  paths, conflicts, system-record protection, cross-user and cross-zone isolation, persistence
  across app instances, and the shared validation fixture. The suite uses a temporary SQLite file,
  ignores `backend/.env`, and refuses to run against any database in `backend/data/`.
- **Frontend** (`make frontend-test`, Vitest): the API client, URL list state, forms (including
  every record type's editor and payload), tables, dialogs, and the shared validation fixture run
  against the client-side validators.
- **End-to-end** (`make e2e`, Playwright): first run `cd frontend && npx playwright install chromium`.
  Each run starts its own backend on 127.0.0.1:8001 with a fresh temporary database (deleted
  afterwards) and a production build of the frontend on 127.0.0.1:3001; your dev servers and data
  are never used. It covers the ten PRD journeys (sign in/out; create, search, edit, and delete
  zones; create all nine record types; search, filter, and paginate records; edit; delete), session
  expiry, accessibility scans (axe), keyboard-only flows, and responsive layouts. Every test fails
  on an unexpected browser console error.
- **CI** (`.github/workflows/ci.yml`) runs backend lint and tests, frontend lint, typecheck, tests,
  and build, and then the Playwright suite.

## Architecture

```text
Browser ──► Next.js (frontend/, port 3000)
              │  pages + /api/v1/* rewrite (same origin, so the cookie is first-party)
              ▼
            FastAPI (backend/, port 8000) ── routers → services → SQLAlchemy ──► SQLite file
```

- **Same-origin proxy:** the browser calls relative `/api/v1/...` URLs; `next.config.ts` rewrites
  them to `API_INTERNAL_BASE_URL` (fixed at build time). No CORS is needed.
- **Auth:** `POST /api/v1/auth/login` sets an HttpOnly `route53_session` cookie holding a random
  token; the server stores only its SHA-256 hash and checks expiry, revocation, and the user on
  every request. A Next.js proxy (`frontend/proxy.ts`) sends visitors without the cookie to the
  login page; inside the console `GET /api/v1/auth/me` is the source of truth.
- **Layers:** routers (HTTP only) → services (rules, ownership, transactions) → models. The
  frontend mirrors the validation rules, pinned to the backend by `shared/dns-validation-cases.json`.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Database schema

Five tables, created only by Alembic migrations:

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | The demo identity (Argon2id hash) | unique lowercase email |
| `sessions` | Login sessions (token hash, expiry, revocation) | FK → users, cascade; unique token hash |
| `hosted_zones` | Zones (public `zone_id`, name, type, comment) | FK → users, cascade; unique `zone_id`; names may repeat |
| `dns_records` | Record sets (name, type, TTL, system flag) | FK → hosted_zones, cascade; unique (zone, name, type); CHECKs on type/routing/TTL |
| `record_values` | Ordered values (`value_json` + computed `display_value`) | FK → dns_records, cascade; unique (record, position) |

Deleting a zone removes its records and values in the same statement. Details:
[docs/DATABASE.md](docs/DATABASE.md).

## API overview

JSON REST API under `/api/v1`, plus `GET /healthz`. Full reference: [docs/API.md](docs/API.md).

| Method + path | Purpose |
|---|---|
| `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` · `GET /api/v1/auth/me` | Sign in (sets the cookie), sign out (revokes), current user |
| `GET /api/v1/hosted-zones` | List zones (`q`, `zone_type`, `page`, `page_size`, `sort_by`, `sort_order`) |
| `POST /api/v1/hosted-zones` | Create a zone (adds system NS and SOA records) |
| `GET` · `PATCH` · `DELETE /api/v1/hosted-zones/{zone_id}` | Zone detail, edit description, delete with all records |
| `GET /api/v1/hosted-zones/{zone_id}/records` | List records (`q`, `record_type`, `routing_policy`, paging, sorting) |
| `POST /api/v1/hosted-zones/{zone_id}/records` | Create a record |
| `GET` · `PATCH` · `DELETE /api/v1/hosted-zones/{zone_id}/records/{record_id}` | Record detail, edit in place, delete (system records → 409) |
| `GET /healthz` | `{"status":"ok","database":"ok"}` or 503 |

Errors always use `{"error": {"code", "message", "details": [{"field", "message"}], "request_id"}}`
and every response carries `X-Request-ID`.

## Deployment

The backend ships as a Docker image with SQLite on a **persistent volume**; the frontend deploys
to **Vercel** and proxies `/api` to the backend, so the session cookie stays first-party.

### Backend (Docker + persistent volume)

`backend/Dockerfile` (python:3.12-slim, non-root user) runs `backend/docker-entrypoint.sh`, which
fails fast: it checks that the database directory is writable, runs `alembic upgrade head`, seeds
the demo user, optionally loads demo data (`SEED_DEMO_DATA=true`), then starts uvicorn with one
worker on `$PORT` (default 8000).

Backend environment variables:

| Variable | Value |
|---|---|
| `APP_ENV` | `production` (also disables `/docs` unless `ENABLE_DOCS=true`) |
| `DATABASE_URL` | `sqlite:////data/fiftythree.db` (the volume is mounted at `/data`) |
| `SESSION_COOKIE_SECURE` | `true` |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | `demo@example.test` / `fiftythree-demo` (public demo password) |
| `TRUSTED_ORIGINS` | the frontend origin, e.g. `https://fiftythree.vercel.app` |
| `SEED_DEMO_DATA` | `true` to load demo zones on first start (optional) |

**Render** (blueprint in `render.yaml`): New → Blueprint → select this repository. It creates the
`fiftythree-api` Docker web service from `backend/` with a 1 GB disk at `/data` and the health
check `/healthz`. Set `TRUSTED_ORIGINS` (your Vercel URL) in the dashboard. Persistent
disks require a paid instance type on Render; the free tier has no disk, so data would be lost on
every deploy.

**Railway** (alternative): New project → Deploy from GitHub → set the service root directory to
`backend` (`backend/railway.json` selects the Dockerfile and the `/healthz` check) → add a volume
mounted at `/data` → set the variables above plus `RAILWAY_RUN_UID=0` (Railway volumes are owned
by root, and the image runs as a non-root user) → generate a public domain. This is how the live
demo is deployed.

Any other Docker host works the same way: build `backend/`, mount a volume at `/data`, set the
variables, and expose the port.

### Frontend (Vercel)

New project → import this repository → **Root Directory `frontend`** (framework Next.js; the
default `npm ci` / `next build` are correct). Environment variables (all read at build time, so
redeploy after changing them):

| Variable | Value |
|---|---|
| `API_INTERNAL_BASE_URL` | the backend URL, e.g. `https://fiftythree-api.onrender.com` (required: the build fails without it on Vercel) |
| `NEXT_PUBLIC_APP_NAME` | `Fiftythree` |
| `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` | `demo@example.test` / `fiftythree-demo`: shows the credentials and the "Use demo credentials" button on the login page |

Order: deploy the backend, note its URL, deploy the frontend with `API_INTERNAL_BASE_URL`, then
set the backend's `TRUSTED_ORIGINS` to the Vercel URL. Both hosts serve HTTPS, which the Secure
cookie requires. Smoke test: open `<backend>/healthz`, sign in on the Vercel URL, refresh, create
and delete a zone and a record, redeploy the backend, and confirm the data is still there.

## Data reset and backup

- **Local reset:** stop the backend, delete `backend/data/fiftythree.db` (and its `-wal`/`-shm`
  files), then `make migrate`, `make seed`, and optionally `make seed-demo-data`.
- **Deployed backup:** make a consistent copy on the volume from the service shell (the image has
  Python but no `sqlite3` CLI), then download it:
  `python -c "import sqlite3; s=sqlite3.connect('/data/fiftythree.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d)"`.
  There is deliberately no public reset endpoint.

## Optional features

None implemented yet (BIND/JSON import and export, bulk delete, dark mode, and keyboard shortcuts
are optional bonus scope).
