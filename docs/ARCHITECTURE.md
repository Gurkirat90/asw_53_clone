# Architecture

Fiftythree is a modular monolith: one Next.js frontend, one FastAPI API, one SQLite file. It
simulates the Route 53 console's control plane only; it never serves DNS, makes outbound DNS
lookups, or calls AWS.

## Components

```text
Browser
  │  same-origin requests: pages and /api/v1/*
  ▼
Next.js 16 (App Router, TypeScript strict, Cloudscape)          frontend/
  · proxy.ts          edge guard: no session cookie → /login?next=…
  · app/(console)/*   authenticated console (AuthGate → shell → page)
  · app/(auth)/login  sign-in page
  · lib/api/*         the only HTTP client + typed wrappers for the whole API
  · rewrites          /api/:path* → ${API_INTERNAL_BASE_URL}/api/:path*  (fixed at build time)
  │
  ▼
FastAPI (Pydantic v2, SQLAlchemy 2)                              backend/
  · middleware        request ID + access log + 500 envelope; Origin check
  · api/v1/*          routers: auth, hosted_zones, records (no business logic)
  · api/deps.py       get_db, get_current_user (cookie → session → user)
  · services/*        auth, hosted zones, records, dns_validation (all rules)
  · models/*          users, sessions, hosted_zones, dns_records, record_values
  │
  ▼
SQLite (one file; Alembic migrations; PRAGMA foreign_keys=ON)    backend/data/fiftythree.db
```

## Request flow

1. A page reads its list state from the URL (`useListQueryState`) and calls a typed wrapper in
   `lib/api/*` through TanStack Query (query keys include every parameter, so stale responses
   never overwrite newer ones; paging keeps the previous page visible).
2. `apiRequest` sends a relative `/api/v1/...` request with `credentials: "same-origin"`. Next.js
   proxies it to FastAPI (dev, E2E, and production use the same rewrite), so the session cookie is
   first-party and no CORS is involved.
3. `RequestIdMiddleware` assigns or echoes `X-Request-ID`; `OriginCheckMiddleware` rejects unsafe
   requests from untrusted origins (403).
4. The router validates the shape with Pydantic and resolves the user with `get_current_user`
   (cookie token → SHA-256 → `sessions` row → not revoked, not expired, user active).
5. A service applies the business rules (ownership, validation, conflicts) inside an explicit
   transaction and returns ORM objects; the router maps them to response schemas.
6. Errors become the standard envelope `{"error": {code, message, details, request_id}}`.
7. After a mutation the frontend invalidates the affected queries and refetches (no optimistic
   updates); success notifications appear only after the server confirms.

## Module responsibilities

| Area | Module | Responsibility |
|---|---|---|
| Config | `backend/app/core/config.py` | Settings from env / `backend/.env` (ignored when `APP_ENV=test`) |
| Errors | `backend/app/core/errors.py` | Error classes and handlers; every error uses the envelope |
| Security | `backend/app/core/security.py` | Argon2id hashing, opaque session tokens, token hashing |
| Startup | `backend/app/db/migrations.py` | Refuses to start on a missing or unmigrated database |
| Auth | `backend/app/services/auth_service.py` | Credentials check, session create/resolve/revoke |
| Zones | `backend/app/services/hosted_zone_service.py` | Owner-scoped CRUD, list query, system NS/SOA records |
| Records | `backend/app/services/record_service.py` | CRUD within a zone, conflict rules, value replacement |
| Validation | `backend/app/services/dns_validation.py` | The single authority for names, values, and display formatting |
| API client | `frontend/lib/api/client.ts` | Fetch wrapper, error parsing, network errors, central 401 handling |
| Session | `frontend/lib/auth/AuthProvider.tsx` | `AuthGate` (GET /auth/me), `useAuth` |
| Shell | `frontend/components/console-shell/*` | TopNavigation, SideNavigation, breadcrumbs, split panel slot |
| Client validation | `frontend/lib/validation/dns.ts` | Mirror of the backend rules for instant feedback |

## Transaction boundaries

- Create zone + system NS + SOA records: one transaction (a failure rolls back the zone; tested).
- Create/update record + replace all of its values: one transaction (old values are deleted
  before new ones are inserted so `(record_id, position)` stays unique).
- Delete zone: one `DELETE`; records and values go with it via `ON DELETE CASCADE`.
- A concurrent duplicate that slips past the service check hits the unique index and becomes
  `409 RECORD_CONFLICT`.

## Validation strategy

- **Backend is authoritative.** `dns_validation.py` validates every field, collects all problems,
  and returns them in one 422 with dot paths (`values.1.priority`).
- **Client mirror.** `frontend/lib/validation/dns.ts` implements the same rules so forms show
  errors before submitting; server errors are mapped onto the same fields.
- **Shared fixture.** `shared/dns-validation-cases.json` (131 cases) runs against both
  implementations in CI, so their accepted/rejected sets and normalized outputs stay identical.
- Cross-record rules (duplicate record sets, CNAME coexistence) are checked only on the server.

## Error handling

- One envelope for every error, including 404/405 from routing and unhandled exceptions (500,
  generic message; the stack trace is logged server-side with the request ID only).
- The frontend turns envelopes into `ApiError` (status, code, message, details, requestId); network
  failures become `NETWORK_ERROR`. Lists show error states with Retry; forms keep the user's input.
- A 401 from any data request clears client state and redirects to `/login?next=…` exactly once.

## Security notes

- Session cookie `route53_session`: opaque random token, `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Max-Age` = `SESSION_TTL_SECONDS`, `Secure` in production. Only its SHA-256 hash is stored.
- Logout revokes the session server-side; expired, revoked, and unknown tokens get 401.
- CSRF: `SameSite=Lax` plus the Origin check on unsafe methods (`TRUSTED_ORIGINS`).
- Ownership: every query filters by the signed-in user (zones) or the owned parent zone
  (records). Another user's zone or a record from a different zone returns 404, never 403, so
  IDs cannot be probed.
- Passwords are Argon2id; unknown users still pay one hash verification (similar timing).
- No outbound requests: hostnames are validated syntactically and never resolved.
- Responses never include password hashes, token hashes, SQL, or stack traces.
- Interactive API docs are disabled in production unless `ENABLE_DOCS=true`.
