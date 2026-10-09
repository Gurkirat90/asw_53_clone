# Route 53 Clone

## Overview

A functional simulation of the AWS Route 53 web console, built for the Scaler SDE Fullstack
assignment ([PDF](docs/assignment/Scaler_SDE_Fullstack_Assignment_-_AWS_Route53_Clone.pdf)). It
reproduces the console's look, navigation, and core hosted-zone and DNS-record workflows, with
data persisted in SQLite through a FastAPI API.

> **This is a simulation, not a DNS service.** It never answers DNS queries, publishes or
> propagates records, contacts AWS, provisions resources, or implements real IAM, Organizations, or
> billing. Login is a local mock.

**Current status (Phase 03, hosted zone and record APIs):** the complete backend: SQLite schema
and migrations, mock session authentication, and the owner-scoped REST API for hosted zones and
DNS records (A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA) with validation, system NS/SOA records,
search, filters, sorting, and pagination. Phase 04 adds the frontend foundation: the Route 53-style
console shell (top bar, side navigation, breadcrumbs, notifications), mock sign-in/sign-out with
route protection, Coming soon pages, and the typed API client. The hosted zone and record screens
arrive in PROMPTS 05 and 06 (`/hosted-zones` is a temporary placeholder until then). Requirements: [docs/PRD.md](docs/PRD.md). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript (strict), Cloudscape Design System (Visual Refresh), TanStack Query v5 |
| Backend | Python 3.12, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2.x, Alembic, argon2-cffi |
| Database | SQLite (single file, foreign keys enforced) |
| Tooling | ESLint, `tsc`, Vitest + React Testing Library, ruff, pytest + httpx, GitHub Actions |

## Repository layout

```text
.
├── backend/              FastAPI app (app/), Alembic migrations (alembic/), requirements*.txt
├── frontend/             Next.js App Router app (app/), tests/, package.json + lockfile
├── shared/               Cross-stack test fixtures (from PROMPT 03)
├── docs/                 PRD.md, DECISIONS.md, assignment/ (source PDF/DOCX)
├── .github/workflows/    ci.yml
├── Makefile              Developer commands
├── .editorconfig
└── .gitignore
```

## Prerequisites

- Python 3.12+ (`python3.12` on PATH; override with `make setup PYTHON=python3.13`)
- Node.js 22 LTS (see `frontend/.nvmrc`; `engines.node` is `>=22.13.0`) and npm
- GNU Make

## Local setup

```bash
make setup
```

`make setup` creates `backend/.venv`, installs `backend/requirements-dev.txt`, and runs `npm ci` in
`frontend/`.

Environment files (placeholders only; never commit real values):

```bash
cp backend/.env.example backend/.env
```

```bash
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` and set `DEMO_USER_PASSWORD` to a local password of your choice. It is the
password for the demo login (`DEMO_USER_EMAIL`, default `demo@example.test`); `.env` is gitignored.

Create the database schema and the demo user:

```bash
make migrate
```

```bash
make seed
```

`make migrate` runs `alembic upgrade head` and creates `backend/data/route53_clone.db`. The backend
refuses to start against a missing or unmigrated database. `make seed` is idempotent: it creates
the demo user if missing and never changes an existing password unless you run
`make seed SEED_ARGS=--reset-password`.

Optionally load demo data (requires the demo user):

```bash
make seed-demo-data
```

It creates `example.com` (one record of each of the nine types plus `app-01`…`app-12` A records,
enough to page through), `example.net`, and the private zone `internal.example.com`, all with
reserved documentation names and addresses. It does nothing if the demo user already has zones.

`API_INTERNAL_BASE_URL` (frontend) is the server-side target of the `/api/*` rewrite. Next.js
resolves rewrites at **build time**, so set it before `npm run build` when the API is not at
`http://127.0.0.1:8000`.

Run the two servers in separate terminals:

```bash
make backend-run
```

```bash
make frontend-run
```

Then open http://localhost:3000 and sign in with `DEMO_USER_EMAIL` (default `demo@example.test`)
and the `DEMO_USER_PASSWORD` you set in `backend/.env`. The API is at http://127.0.0.1:8000
(OpenAPI docs at `/docs` in development), and `http://localhost:3000/api/v1/...` is proxied to it.

How sign-in works: the login form posts to `/api/v1/auth/login`, which sets the HttpOnly
`route53_session` cookie (JavaScript can never read it). A Next.js proxy (`frontend/proxy.ts`)
sends visitors without that cookie to `/login?next=...`; inside the console, `GET /api/v1/auth/me`
decides whether the session is valid, so a stale cookie still ends on the login page. Any 401
from the API clears client state and returns to `/login` once (no redirect loops). Sign out
revokes the session on the server.

## Commands

| Command | Purpose | Status |
|---|---|---|
| `make setup` | Create venv, install backend and frontend dependencies | Working |
| `make migrate` | `alembic upgrade head` against `DATABASE_URL` (creates `backend/data/`) | Working |
| `make seed` | Create the demo user if missing (`SEED_ARGS=--reset-password` resets its password) | Working |
| `make seed-demo-data` | Load demo zones and records for the demo user (skips if it already has zones) | Working |
| `make backend-run` | Uvicorn on 127.0.0.1:8000, single worker, auto-reload | Working |
| `make frontend-run` | Next.js dev server on port 3000 | Working |
| `make backend-lint` | `ruff check` + `ruff format --check` | Working |
| `make backend-test` | `pytest` | Working |
| `make frontend-lint` | ESLint | Working |
| `make frontend-typecheck` | `tsc --noEmit` | Working |
| `make frontend-test` | Vitest | Working |
| `make frontend-build` | `next build` | Working |
| `make e2e` | Playwright end-to-end tests against an isolated backend and DB (see Testing) | Working |
| `make test` | `backend-test` + `frontend-test` | Working |
| `make check` | All lint, typecheck, unit tests, and the frontend build | Working |

Backend operator commands: `cd backend && .venv/bin/python -m app.cli --help`.

## Testing

- Backend: `make backend-test` runs pytest (`backend/app/tests/`). The suite sets `APP_ENV=test`
  and points `DATABASE_URL` at a temporary SQLite file before the app is imported, migrates it
  once with Alembic, and empties every table around each test. In test mode `backend/.env` is
  ignored, and a guard aborts the run if the database resolves to `backend/data/route53_clone.db`.
  Coverage: migrations (upgrade/downgrade/upgrade, constraints, indexes), foreign keys and
  cascades, UTC timestamps, login/logout/me (cookie attributes, hashed tokens, expired, revoked,
  garbage and inactive-user sessions), the error envelope and request IDs, the Origin check,
  startup refusal on an unmigrated database, `/healthz`, the seed commands, the hosted-zone and
  record APIs (all nine types, validation paths, conflicts, system-record protection, cross-user
  and cross-zone 404s, search/filter/sort/pagination, cascade deletes, rollback on failure,
  persistence across app instances, no N+1 queries), and the shared DNS validation fixture
  `shared/dns-validation-cases.json`, which the frontend will run too.
- Frontend: `make frontend-test` runs Vitest with jsdom (`frontend/tests/unit/`): the API client
  (envelope parsing, 204, query serialization, network errors, one-shot 401 handling), error
  mapping, URL list state, debounce, the confirmation modal (typed confirmation, focus), the login
  form (validation, generic 401, safe `next`), navigation highlighting, notifications, and states.
- End-to-end: `make e2e` runs Playwright (`frontend/tests/e2e/`). It needs Chromium once:
  `cd frontend && npx playwright install chromium`. Playwright starts its own stack and never
  reuses dev servers or the developer DB:
  - `tests/e2e/start-backend.sh`: FastAPI on 127.0.0.1:8001 with a fresh temporary SQLite file
    (migrated, demo user seeded with the test-only password `e2e-demo-password`, overridable via
    `E2E_DEMO_PASSWORD`), deleted when the run ends.
  - The frontend: a production build into `frontend/.next-e2e` (so `.next` is untouched) served on
    127.0.0.1:3001 with its `/api` rewrite pointed at :8001. Rewrites are fixed at build time,
    which is why the E2E run builds its own copy.
  - Every test fails on any browser console error or page error, except Chrome's
    "Failed to load resource ... 401" lines for expected API 401s (session probe, wrong password).
- CI (`.github/workflows/ci.yml`) runs the same lint, typecheck, test, and build steps on every
  push to `main` and on pull requests.

## Architecture

Browser → Next.js (same-origin `/api/*` rewrite) → FastAPI → SQLite. Details:
`docs/ARCHITECTURE.md` (to be written).

## Database schema

Five tables (`users`, `sessions`, `hosted_zones`, `dns_records`, `record_values`), managed
exclusively by Alembic migrations. Details: [docs/DATABASE.md](docs/DATABASE.md).

## API overview

JSON REST API under `/api/v1` (health check: `GET /healthz`). Full contract, examples, value
shapes, and validation rules: [docs/API.md](docs/API.md). Interactive OpenAPI docs are served at
http://127.0.0.1:8000/docs in development.

| Method + path | Purpose |
|---|---|
| `POST /api/v1/auth/login` / `POST /api/v1/auth/logout` / `GET /api/v1/auth/me` | Mock session login (HttpOnly cookie), logout, current user |
| `GET /api/v1/hosted-zones` | List zones (`q`, `zone_type`, `page`, `page_size`, `sort_by`, `sort_order`) |
| `POST /api/v1/hosted-zones` | Create a zone (with system NS and SOA records) |
| `GET` / `PATCH` / `DELETE /api/v1/hosted-zones/{zone_id}` | Zone detail, edit comment, delete with all records |
| `GET /api/v1/hosted-zones/{zone_id}/records` | List records (`q`, `record_type`, `routing_policy`, paging, sorting) |
| `POST /api/v1/hosted-zones/{zone_id}/records` | Create an A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, or CAA record |
| `GET` / `PATCH` / `DELETE /api/v1/hosted-zones/{zone_id}/records/{record_id}` | Record detail, edit in place, delete (system records are protected) |

Every error uses `{"error": {"code", "message", "details": [{"field", "message"}], "request_id"}}`
and every response carries `X-Request-ID`. Unsafe requests (POST/PUT/PATCH/DELETE) whose `Origin`
header is not in `TRUSTED_ORIGINS` get `403 FORBIDDEN`.

## Deployment

To be documented.

## Demo

To be added.

## Limitations

- Simulation only: no DNS resolution, propagation, delegation, or AWS integration.
- Login is mocked for a single seeded demo user.
- Routing policy is Simple only; alias records, health checks, traffic flow, DNSSEC, and other
  Route 53 features are out of scope (see [docs/DECISIONS.md](docs/DECISIONS.md), D11).
