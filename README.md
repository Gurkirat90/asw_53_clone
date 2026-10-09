# Route 53 Clone

## Overview

A functional simulation of the AWS Route 53 web console, built for the Scaler SDE Fullstack
assignment ([PDF](docs/assignment/Scaler_SDE_Fullstack_Assignment_-_AWS_Route53_Clone.pdf)). It
reproduces the console's look, navigation, and core hosted-zone and DNS-record workflows, with
data persisted in SQLite through a FastAPI API.

> **This is a simulation, not a DNS service.** It never answers DNS queries, publishes or
> propagates records, contacts AWS, provisions resources, or implements real IAM, Organizations, or
> billing. Login is a local mock.

**Current status (Phase 02, persistence and mock authentication):** SQLite schema and Alembic
migrations for all five tables, a standardized error/request-ID framework, and the session-based
mock login API (`/api/v1/auth/login`, `/logout`, `/me`). The frontend is still the Phase 01 smoke
page; hosted zones, records, and the console UI arrive in later phases. Requirements: [docs/PRD.md](docs/PRD.md). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

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

Then open http://localhost:3000. The API is at http://127.0.0.1:8000 (OpenAPI docs at `/docs` in
development), and `http://localhost:3000/api/v1/...` is proxied to it.

## Commands

| Command | Purpose | Status |
|---|---|---|
| `make setup` | Create venv, install backend and frontend dependencies | Working |
| `make migrate` | `alembic upgrade head` against `DATABASE_URL` (creates `backend/data/`) | Working |
| `make seed` | Create the demo user if missing (`SEED_ARGS=--reset-password` resets its password) | Working |
| `make seed-demo-data` | Load demo zones and records | Not implemented until PROMPT 03 (exits 1) |
| `make backend-run` | Uvicorn on 127.0.0.1:8000, single worker, auto-reload | Working |
| `make frontend-run` | Next.js dev server on port 3000 | Working |
| `make backend-lint` | `ruff check` + `ruff format --check` | Working |
| `make backend-test` | `pytest` | Working |
| `make frontend-lint` | ESLint | Working |
| `make frontend-typecheck` | `tsc --noEmit` | Working |
| `make frontend-test` | Vitest | Working |
| `make frontend-build` | `next build` | Working |
| `make e2e` | Playwright end-to-end tests | Not implemented until PROMPT 04 (exits 1) |
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
  startup refusal on an unmigrated database, `/healthz`, and the seed command.
- Frontend: `make frontend-test` runs Vitest with jsdom (`frontend/tests/`).
- CI (`.github/workflows/ci.yml`) runs the same lint, typecheck, test, and build steps on every
  push to `main` and on pull requests.

## Architecture

Browser → Next.js (same-origin `/api/*` rewrite) → FastAPI → SQLite. Details:
`docs/ARCHITECTURE.md` (to be written).

## Database schema

Five tables (`users`, `sessions`, `hosted_zones`, `dns_records`, `record_values`), managed
exclusively by Alembic migrations. Details: [docs/DATABASE.md](docs/DATABASE.md).

## API overview

Base path `/api/v1`; health check `GET /healthz` (`{"status":"ok","database":"ok"}`, or `503`).
Implemented so far:

| Method + path | Result |
|---|---|
| `POST /api/v1/auth/login` | `200` user summary + HttpOnly `route53_session` cookie; `401 AUTHENTICATION_FAILED`; `422 VALIDATION_ERROR` |
| `POST /api/v1/auth/logout` | `204`; revokes the session and clears the cookie |
| `GET /api/v1/auth/me` | `200` user summary; `401 UNAUTHENTICATED` |

Every error uses `{"error": {"code", "message", "details": [{"field", "message"}], "request_id"}}`
and every response carries `X-Request-ID`. Unsafe requests (POST/PUT/PATCH/DELETE) whose `Origin`
header is not in `TRUSTED_ORIGINS` get `403 FORBIDDEN`. Full reference: `docs/API.md` (PROMPT 03).

## Deployment

To be documented.

## Demo

To be added.

## Limitations

- Simulation only: no DNS resolution, propagation, delegation, or AWS integration.
- Login is mocked for a single seeded demo user.
- Routing policy is Simple only; alias records, health checks, traffic flow, DNSSEC, and other
  Route 53 features are out of scope (see [docs/DECISIONS.md](docs/DECISIONS.md), D11).
