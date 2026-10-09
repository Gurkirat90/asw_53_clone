# API reference

The Fiftythree API is a JSON REST API served by FastAPI. It manages a **simulated** Route 53
control plane stored in SQLite. It never answers DNS queries, publishes records, or contacts AWS.

Interactive OpenAPI docs: `http://127.0.0.1:8000/docs` (development only; disabled when
`APP_ENV=production` unless `ENABLE_DOCS=true`).

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (health check: `GET /healthz`, outside the base path) |
| Origin | The browser calls relative `/api/v1/...` URLs on the frontend origin; Next.js proxies them to FastAPI. |
| Bodies | JSON (`Content-Type: application/json`). Unknown body fields are rejected with 422. |
| IDs | Hosted zones are addressed by `zone_id` (`Z` + 20 uppercase alphanumerics). Records by `id` (UUID). Internal zone UUIDs are never exposed. |
| Timestamps | ISO 8601 UTC with microseconds, e.g. `2026-10-09T07:08:32.288287Z`. |
| Names | Domain and record names are lowercase without a trailing dot. |
| Request IDs | Every response has `X-Request-ID`. A client may send its own (`^[A-Za-z0-9_-]{1,64}$`); otherwise one is generated (`req_` + 16 hex). |
| Ownership | Every zone and record route requires a session and only sees the caller's data. A zone or record that does not exist, belongs to another user, or (for records) belongs to a different zone returns `404 NOT_FOUND`. |
| CSRF guard | `POST`/`PUT`/`PATCH`/`DELETE` requests with an `Origin` header that is not in `TRUSTED_ORIGINS` get `403 FORBIDDEN`. |

### Authentication and the session cookie

`POST /api/v1/auth/login` sets `route53_session` (`HttpOnly; SameSite=Lax; Path=/;
Max-Age=43200`, plus `Secure` when `SESSION_COOKIE_SECURE=true`). The value is an opaque random
token; the server stores only its SHA-256 hash and checks expiry, revocation, and the user's active
flag on every request. There is no JWT, no sign-up, and nothing in localStorage. Logout revokes the
session server-side and expires the cookie.

### List envelope

```json
{"items": [], "page": 1, "page_size": 20, "total_items": 0, "total_pages": 0}
```

- `page` defaults to 1 (minimum 1). `page_size` defaults to 20 (1–100).
- `total_pages = ceil(total_items / page_size)`, and **0 when there are no results**.
- A page beyond the last returns `items: []` with correct `total_items`/`total_pages`.
- `q` is trimmed; an empty `q` means no search. Matching is a case-insensitive substring match
  where `%` and `_` are literal characters (no wildcards).
- Sorting is server-side over an allowlisted `sort_by`, with `sort_order` `asc` (default) or `desc`
  and a deterministic tiebreak (see each endpoint).
- Invalid query parameters return 422 with `field` set to the parameter name (e.g. `page_size`).

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [{"field": "values.1.value", "message": "Enter a valid IPv4 address, such as 192.0.2.10."}],
    "request_id": "req_2245831b638c2734"
  }
}
```

`details` is empty when no field applies. Field paths are dot paths: `name`, `record_type`,
`routing_policy`, `ttl_seconds`, `comment`, `values`, `values.N`, `values.N.<key>`, or a query
parameter name. Every field problem in a request is reported at once.

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request not covered by field validation (also 405 Method Not Allowed, with status 405) |
| 401 | `AUTHENTICATION_FAILED` | Login with wrong email/password, or an inactive user (one generic message) |
| 401 | `UNAUTHENTICATED` | Missing, unknown, expired, or revoked session |
| 403 | `FORBIDDEN` | Unsafe request from an untrusted `Origin` |
| 404 | `NOT_FOUND` | Unknown route, or a zone/record that is missing or not owned |
| 409 | `RECORD_CONFLICT` | Duplicate record set or CNAME coexistence violation |
| 409 | `SYSTEM_RECORD_PROTECTED` | PATCH/DELETE of a system NS/SOA record |
| 422 | `VALIDATION_ERROR` | Body or query validation failed |
| 500 | `INTERNAL_ERROR` | Unexpected failure (details only in server logs, keyed by request ID) |

## Health

### `GET /healthz`

`200 {"status": "ok", "database": "ok"}`, or `503 {"status": "unavailable"}` when the database
cannot be queried. No authentication. Never includes paths or internals.

## Authentication

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `POST /api/v1/auth/login` | `{"email": "demo@example.test", "password": "..."}` | `200` user summary + `Set-Cookie` | `401 AUTHENTICATION_FAILED`, `422` (empty/missing fields; email ≤ 254, password ≤ 1024 chars) |
| `POST /api/v1/auth/logout` | none | `204`, cookie expired | always 204 (revokes the session if the cookie maps to one) |
| `GET /api/v1/auth/me` | none | `200` user summary | `401 UNAUTHENTICATED` |

User summary: `{"id": "<uuid>", "email": "demo@example.test", "display_name": "Demo User"}`.

## Hosted zones

All routes require a session.

**HostedZoneSummary**

```json
{
  "zone_id": "ZWDAWYUMF4XN15ZV86VR7",
  "name": "example.com",
  "zone_type": "PUBLIC",
  "comment": "Primary demo zone",
  "record_count": 2,
  "created_at": "2026-10-09T07:08:32.288287Z",
  "updated_at": "2026-10-09T07:08:32.288287Z"
}
```

`record_count` counts every record set in the zone, including the system NS and SOA records, and
is computed by query on every read.

**HostedZoneDetail** = HostedZoneSummary + `name_servers`: the system NS record's values in order.
These are synthetic `.invalid` hosts, not real delegation.

```json
{
  "...": "summary fields",
  "name_servers": [
    "ns-170.awsdns-36.invalid",
    "ns-751.awsdns-60.invalid",
    "ns-804.awsdns-06.invalid",
    "ns-1000.awsdns-02.invalid"
  ]
}
```

### `GET /api/v1/hosted-zones`

| Param | Values | Default |
|---|---|---|
| `q` | substring of name **or** comment | none |
| `zone_type` | `PUBLIC`, `PRIVATE` | none |
| `page` | ≥ 1 | 1 |
| `page_size` | 1–100 | 20 |
| `sort_by` | `name`, `zone_type`, `created_at`, `updated_at` | `name` |
| `sort_order` | `asc`, `desc` | `asc` |

Ties break by `created_at`, then `zone_id` (same direction). Returns `200` list envelope of
HostedZoneSummary.

### `POST /api/v1/hosted-zones`

```json
{"name": "example.com", "zone_type": "PUBLIC", "comment": "Primary demo zone"}
```

- `name` required; normalized (see [validation rules](#validation-rules)).
- `zone_type` optional, `PUBLIC` (default) or `PRIVATE`. A private zone is a label only; no VPC is
  associated.
- `comment` optional, trimmed, ≤ 1000 characters; an empty comment is stored as `null`.

`201` HostedZoneDetail with `record_count: 2`. The zone, a system NS record, and a system SOA
record are created in one transaction; if any insert fails, nothing is stored. Duplicate domain
names are allowed (each zone gets its own `zone_id`). Errors: `422`.

### `GET /api/v1/hosted-zones/{zone_id}`

`200` HostedZoneDetail. `404 NOT_FOUND` if unknown or not owned.

### `PATCH /api/v1/hosted-zones/{zone_id}`

```json
{"comment": "Updated description"}
```

Only `comment` is editable (`null` clears it); `updated_at` is refreshed. `name` or `zone_type` →
`422` with the message "Domain name and type cannot be changed after creation." Any other field →
`422` "This field is not allowed." Returns `200` HostedZoneDetail.

### `DELETE /api/v1/hosted-zones/{zone_id}`

`204`. Deletes the zone with all of its records (user and system) and their values atomically.
Other zones are untouched.

## Records

All routes require a session, and the parent zone must be owned by the caller. The record must
belong to that zone; otherwise `404 NOT_FOUND`.

**DnsRecord**

```json
{
  "id": "a8188691-19b6-4c5c-ab23-d6f96cb1b086",
  "zone_id": "ZWDAWYUMF4XN15ZV86VR7",
  "name": "example.com",
  "record_type": "MX",
  "routing_policy": "SIMPLE",
  "ttl_seconds": 300,
  "values": [{"priority": 10, "exchange": "mail.example.com"}],
  "display_values": ["10 mail.example.com"],
  "comment": null,
  "is_system": false,
  "created_at": "2026-10-09T07:08:32.317469Z",
  "updated_at": "2026-10-09T07:08:32.317469Z"
}
```

`name` is the canonical FQDN. `values` and `display_values` are parallel arrays in stored order.
`display_values` are computed by the server on every write; clients never send them.

### Value shapes and display formats

| Type | Value object | `display_value` |
|---|---|---|
| A | `{"value": "192.0.2.10"}` | `192.0.2.10` |
| AAAA | `{"value": "2001:db8::10"}` | `2001:db8::10` |
| CNAME | `{"value": "app.example.net"}` | `app.example.net` |
| TXT | `{"value": "v=spf1 include:example.net -all"}` | `"v=spf1 include:example.net -all"` (wrapped in `"`; inner `\` and `"` backslash-escaped) |
| MX | `{"priority": 10, "exchange": "mail.example.net"}` | `10 mail.example.net` |
| NS | `{"value": "ns1.example.net"}` | `ns1.example.net` |
| PTR | `{"value": "host.example.net"}` | `host.example.net` |
| SRV | `{"priority": 10, "weight": 5, "port": 443, "target": "service.example.net"}` | `10 5 443 service.example.net` |
| CAA | `{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}` | `0 issue "letsencrypt.org"` (value quoted and escaped like TXT) |
| SOA (system only) | `{"mname", "rname", "serial", "refresh", "retry", "expire", "minimum"}` | `mname rname serial refresh retry expire minimum` |

### `GET /api/v1/hosted-zones/{zone_id}/records`

| Param | Values | Default |
|---|---|---|
| `q` | substring of the record name, the record type, or any value's `display_value` | none |
| `record_type` | `A`, `AAAA`, `CNAME`, `TXT`, `MX`, `NS`, `PTR`, `SRV`, `CAA`, `SOA` | none |
| `routing_policy` | `SIMPLE` | none |
| `page`, `page_size` | as above | 1, 20 |
| `sort_by` | `name`, `record_type`, `ttl_seconds`, `updated_at` | `name` |
| `sort_order` | `asc`, `desc` | `asc` |

Ties break by `record_type`, then `id` (same direction). System NS/SOA records are included and
marked `is_system: true`. Values are loaded in one extra query for the whole page (no N+1).
Returns `200` list envelope of DnsRecord.

### `POST /api/v1/hosted-zones/{zone_id}/records`

| Field | Required | Notes |
|---|---|---|
| `name` | yes | `@`, a relative name (`www`, `_sip._tcp`), or an FQDN in the zone (`www.example.com` or `www.example.com.`) |
| `record_type` | yes | one of the nine user types; `SOA` → 422 "SOA records are managed by the system." |
| `routing_policy` | no | `SIMPLE` (default); anything else → 422 "Only Simple routing is supported in Fiftythree." |
| `ttl_seconds` | no | JSON integer 0–2147483647, default 300 |
| `values` | yes | 1–100 value objects of the record type's shape; CNAME exactly 1 |
| `comment` | no | ≤ 1000 characters, trimmed; empty → `null` |

Examples:

```json
{"name": "www", "record_type": "A", "ttl_seconds": 300,
 "values": [{"value": "192.0.2.10"}, {"value": "192.0.2.11"}], "comment": "Demo web endpoint"}
{"name": "@", "record_type": "MX", "values": [{"priority": 10, "exchange": "mail.example.com"}]}
{"name": "_sip._tcp", "record_type": "SRV",
 "values": [{"priority": 10, "weight": 5, "port": 5060, "target": "sip.example.com"}]}
{"name": "@", "record_type": "CAA", "values": [{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}]}
```

`201` DnsRecord. Errors: `422` (field details), `409 RECORD_CONFLICT`:

- the zone already has a record set with this name and type ("A record set with this name and type
  already exists."; this includes a user NS at the apex, where the system NS lives);
- a CNAME where another type exists at the same name, or another type where a CNAME exists (the
  message names the conflict).

A CNAME at the zone apex is a `422` on `name`: "CNAME records are not allowed at the zone apex."

### `GET /api/v1/hosted-zones/{zone_id}/records/{record_id}`

`200` DnsRecord (system records included).

### `PATCH /api/v1/hosted-zones/{zone_id}/records/{record_id}`

Same fields as create, all optional. Omitted fields keep their current values; the merged record
is validated as a whole, then the record is updated **in place** (same `id`) and all of its values
are replaced atomically in the new order. If `record_type` changes, `values` must be supplied
(otherwise `422` on `values`: "Provide values for the new record type."). Conflict checks exclude
the record itself. `200` DnsRecord. System records → `409 SYSTEM_RECORD_PROTECTED`.

### `DELETE /api/v1/hosted-zones/{zone_id}/records/{record_id}`

`204`. System records → `409 SYSTEM_RECORD_PROTECTED`.

Creating, updating, or deleting a record also refreshes the parent zone's `updated_at`.

## Validation rules

All rules are implemented once in `backend/app/services/dns_validation.py`. The cross-stack
fixture `shared/dns-validation-cases.json` (131 cases) pins them down for both the backend and the
frontend.

| Input | Rules |
|---|---|
| Zone name | Trim, lowercase, strip one trailing dot. Labels 1–63 chars of `[a-z0-9-]`, not starting/ending with `-`; at least 2 labels; total ≤ 253; final label not all digits. Rejects `://`, `/`, whitespace, empty labels, `_`, `*`, non-ASCII. Error: "Enter a valid domain name, such as example.com." |
| Record name | Trim, lowercase. Empty → "Enter @ for the zone apex." `@` → the zone apex. A trailing dot marks an absolute name, which must equal the zone or end with `.<zone>` ("Record name must be within <zone>."). Without a trailing dot, a name equal to or ending with the zone is an FQDN; anything else is relative and gets `.<zone>` appended. Labels 1–63 chars of `[a-z0-9_-]`, not starting/ending with `-`; `*` only as the entire leftmost label; total ≤ 253. |
| Hostname target (CNAME/NS/PTR value, MX exchange, SRV target) | Trim, lowercase, strip one trailing dot; record-name label rules without `*`; at least 2 labels; ≤ 253. SRV target may be exactly `.`. |
| IPv4 | Outer whitespace trimmed; four decimal octets 0–255, no leading zeros, nothing else. |
| IPv6 | Outer whitespace trimmed; standard IPv6 without zone IDs (`%`) or embedded dotted IPv4; stored in compressed lowercase form (RFC 5952: e.g. `2001:DB8:0:0:0:0:0:10` → `2001:db8::10`). |
| TTL | JSON integer only (no floats, numeric strings, or booleans), 0–2147483647. |
| TXT | Trimmed; 1–1024 characters; no control characters (including line breaks and tabs); otherwise stored exactly. |
| MX | `priority` integer 0–65535; `exchange` hostname. |
| SRV | `priority`, `weight`, `port` integers 0–65535; `target` hostname or `.`. |
| CAA | `flags` integer 0–255; `tag` `issue`/`issuewild`/`iodef` (case-insensitive, stored lowercase); `value` 1–255 printable ASCII characters; for `iodef`, must start with `mailto:`, `http://`, or `https://`. |
| Values | 1–100 per record (CNAME exactly 1). Each value must be an object with exactly the type's keys (unknown keys → error at `values.N`; missing keys → `values.N.<key>` "This field is required."). A value equal to an earlier one after normalization → error at the duplicate's `values.N`. |
| Comments | ≤ 1000 characters (zones and records). |
