# AWS Route 53 Clone
## Application Product Requirements Document (PRD) & Technical Specification

**Document status:** Implementation baseline  
**Version:** 1.0  
**Date:** 9 October 2026  
**Product type:** Full-stack web application / AWS console UX simulation  
**Repository contract:** `frontend/` and `backend/`  
**Primary source:** *Scaler SDE Fullstack Assignment - AWS Route53 Clone* (provided assignment PDF)

> **Purpose of this document**  
> This is the implementation source of truth for the Route 53 Clone assignment. It combines the assignment's explicit requirements with the minimum product, UX, architecture, API, data, security, testing, and delivery decisions needed for an engineering team to implement the application without reconstructing requirements from chat history. The source PDF remains the authority for the assignment's evaluation goals; decisions in this document operationalize those goals.

---

## Document conventions and decision authority

Requirements and decisions are labelled as follows:

- **[ASSIGNMENT MUST]** - stated directly in the supplied assignment. It is mandatory for acceptance.
- **[PRODUCT MUST]** - required for a coherent, testable product even if the assignment does not spell it out.
- **[RECOMMENDATION]** - an implementation choice selected to reduce ambiguity and maximize fidelity/maintainability. Treat it as the default unless the project owner explicitly changes it.
- **[OPTIONAL]** - bonus scope; do not allow it to delay mandatory functionality.
- **[OUT OF SCOPE]** - deliberately not implemented in this clone.

If two requirements appear to conflict, resolve them in this order: (1) the supplied assignment, (2) this PRD's explicit product decisions, (3) implementation convenience. A developer must not silently reinterpret an acceptance requirement. Any change to the baseline must be recorded in the decision log and reflected in this document or a versioned amendment.

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Product definition and boundaries](#2-product-definition-and-boundaries)
3. [Objectives, non-goals, and success measures](#3-objectives-non-goals-and-success-measures)
4. [Users, permissions, and key terminology](#4-users-permissions-and-terminology)
5. [Scope and priority](#5-scope-and-priority)
6. [Information architecture and navigation](#6-information-architecture-and-navigation)
7. [Screen-level requirements](#7-screen-level-requirements)
8. [User journeys and state transitions](#8-user-journeys-and-state-transitions)
9. [UX, visual fidelity, and accessibility requirements](#9-ux-visual-fidelity-and-accessibility-requirements)
10. [Functional requirements](#10-functional-requirements)
11. [DNS record model and validation rules](#11-dns-record-model-and-validation-rules)
12. [Technical architecture](#12-technical-architecture)
13. [Technology stack](#13-technology-stack)
14. [Data model and persistence](#14-data-model-and-persistence)
15. [API specification](#15-api-specification)
16. [Authentication and security](#16-authentication-and-security)
17. [Error handling and application states](#17-error-handling-and-application-states)
18. [Non-functional requirements](#18-non-functional-requirements)
19. [Testing and quality gates](#19-testing-and-quality-gates)
20. [Deployment and operations](#20-deployment-and-operations)
21. [Repository structure and engineering conventions](#21-repository-structure-and-engineering-conventions)
22. [Delivery plan and definition of done](#22-delivery-plan-and-definition-of-done)
23. [Acceptance criteria and traceability matrix](#23-acceptance-criteria-and-traceability-matrix)
24. [Risks, assumptions, and decision log](#24-risks-assumptions-and-decision-log)
25. [Reference material](#25-reference-material)

---

# 1. Executive summary

Build a working web application that closely resembles the AWS Route 53 console for the core user journeys of signing in, viewing and searching hosted zones, creating/editing/deleting hosted zones, and managing DNS records inside a hosted zone. The application's state must persist in SQLite through a FastAPI backend. The frontend must be implemented with Next.js and TypeScript.

The assignment explicitly prioritizes **Route 53 UI/UX fidelity and core workflows**, not a real DNS implementation. The application will use local mock data and mock authentication. It must not create live AWS resources, publish DNS records, query authoritative name servers, or imply that a change has propagated to the internet.

The core product loop is:

1. User signs in through a mocked login screen.
2. User lands on a Route 53-style console shell.
3. User opens **Hosted zones**, searches or filters the list, and creates or manages a zone.
4. User opens a zone, sees its details and record table, then creates, searches, edits, or deletes DNS records.
5. Mutations are persisted through the API to SQLite, survive refresh/re-login, and produce clear success or error feedback.
6. Non-core product areas such as Traffic policies, Health checks, Resolver, Profiles, and the Dashboard may display a branded **Coming soon** experience rather than pretend to be implemented.

## 1.1 Mandated baseline

| Area | Assignment requirement | Baseline interpretation |
|---|---|---|
| Frontend | Next.js (TypeScript) | Next.js App Router with TypeScript |
| Backend | FastAPI | REST-style JSON API under `/api/v1` |
| Database | SQLite | Persistent file database, migrations, foreign keys enabled |
| Authentication | Mocked login, logout, session persistence | Local demo identity and persisted session cookie; no AWS IAM |
| Hosted zones | Full CRUD, listing, search | User-scoped records persisted in SQLite |
| DNS records | Full CRUD within a zone; A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA | Type-aware forms and validation, persisted records |
| Experience | Navigation, tables, forms, search, filters, pagination, modals, notifications | Real working states, not decorative controls |
| Placeholder areas | Dashboard, Traffic Policies, Health Checks, Resolver, Profiles | Navigation destinations with Coming soon pages are acceptable |
| Optional bonuses | BIND import, JSON/BIND export, dark mode, shortcuts, bulk operations | Post-MVP backlog, prioritized after core acceptance |
| Deliverables | GitHub repository, README, hosted working link | `frontend/`, `backend/`, setup/architecture/schema/API documentation, deployed demo |

---

# 2. Product definition and boundaries

## 2.1 Product statement

A Route 53-inspired control panel that lets a user manage a local, persistent model of hosted zones and DNS resource record sets through an AWS-console-like interface.

## 2.2 What “clone” means for this assignment

The clone must reproduce the interaction patterns and visual language of the original console as closely as reasonably possible: dark global header, service navigation, page breadcrumbs, section headers, dense data tables, filter controls, pagination, primary/secondary actions, right-side/drawer/modal patterns where appropriate, and inline or banner notifications. The user should recognize the Route 53 workflow rather than encounter a generic admin CRUD template.

It does **not** mean cloning AWS infrastructure or DNS behaviour. A user can create a record in the application, but that record exists only in this application's database.

## 2.3 Product boundary: simulated control plane only

**Implemented:** local browser UI, mocked identity/session, local hosted-zone entities, local DNS record entities, form validation, filtering, sorting, pagination, confirmation prompts, notifications, placeholder feature pages, local persistence, and optional file import/export.

**Not implemented:** authoritative DNS answering, DNS propagation, real nameserver delegation, domain registration, AWS account linking, AWS IAM authorization, VPC APIs, health probes, Traffic Flow, DNSSEC, query logging, Route 53 billing, AWS SDK calls, or actual changes to a production domain.

Every part of the UI that implies an external operation must either be removed, clearly labelled as simulated, or represented as unavailable/Coming soon. Never display a fictional “DNS propagation complete” or “AWS resource created” status.

## 2.4 Product principles

1. **Fidelity before novelty.** Prefer familiar Route 53 navigation and component patterns over original visual design.
2. **A control must work or be clearly disabled.** Do not ship inert buttons, fake links, or filters that do not alter results.
3. **One persistent source of state.** SQLite is the source of truth; the browser must not be the only place a mutation lives.
4. **Server-side enforcement.** Ownership, validation, uniqueness, and deletion rules must be enforced by FastAPI, not merely by the UI.
5. **Mock external systems honestly.** Simulated values and placeholder workflows must not be represented as live AWS state.
6. **Small, maintainable architecture.** One frontend, one API, one SQLite database; no microservices or unnecessary infrastructure.

---

# 3. Objectives, non-goals, and success measures

## 3.1 Objectives

- **O1 - Visual fidelity:** deliver a console interface recognizably close to the Route 53 web application.
- **O2 - Complete core workflow:** implement login/logout/session persistence and CRUD for hosted zones and in-zone DNS records.
- **O3 - Durable state:** preserve valid changes in SQLite after reloads, API restarts, and user logout/login.
- **O4 - Credible engineering:** provide typed frontend code, a documented API, migrations, input validation, automated tests, and a runnable deployment.
- **O5 - Scope honesty:** make it unambiguous that this is a local simulation, not a production DNS provider.

## 3.2 Non-goals

- Production-grade identity management, user registration, password reset, multi-factor authentication, AWS IAM, organizations, billing, or account switching.
- Real DNS resolution, record publication, nameserver delegation, propagation monitoring, health checks, traffic policies, Resolver endpoints, Profiles, DNSSEC, or domain purchase/transfer.
- Complex AWS routing policies (weighted, latency, geolocation, failover, geoproximity, IP-based, multivalue answer) in the mandatory MVP.
- A general-purpose DNS management platform or a high-availability, multi-region SaaS service.
- Exact parity with every current Route 53 console page. Core screens and common interactions take priority; unimplemented service areas are placeholders.

## 3.3 Success measures

The project is successful when all of the following are true:

- All P0 acceptance criteria in Section 23 pass.
- A reviewer can complete the primary zone and record workflows without developer intervention.
- A newly created zone and record remain present after full-page refresh and API restart.
- Search, filters, sorting, selection, pagination, create/edit forms, confirmation modals, and notifications operate on actual application state.
- All nine assignment-listed DNS types can be created, viewed, edited, and deleted where the record is user-managed.
- There are no known cross-user data leaks, unhandled API crashes, or silent mutation failures.
- The README contains setup instructions, architecture, database schema, and API overview, and the deployed URL is usable.

## 3.4 Quality targets (engineering targets, not assignment-provided SLAs)

- API p95 latency under 500 ms on a local or single-instance deployment with the demo dataset (100 zones, 1,000 records), excluding cold starts.
- Standard search/filter/pagination should respond within one normal UI interaction; no unnecessary full-page reloads.
- Zero console errors during the scripted happy-path demo.
- Automated backend tests cover all API routes and validation branches; end-to-end tests cover the major journeys.
- No secrets committed to Git and no dependence on ephemeral filesystem storage for the deployed SQLite database.

---

# 4. Users, permissions, and terminology

## 4.1 Primary persona

**Console user / assignment reviewer** - signs in with the provided demo credentials, inspects the AWS-like UI, creates a zone, manages records, tests search/filter behaviour, refreshes pages to verify persistence, and evaluates code quality/documentation.

There is no separate administrator persona for MVP. IAM and permissions configuration are explicitly mocked.

## 4.2 Authentication and ownership model

- The UI exposes a single sign-in flow and sign-out action.
- **[RECOMMENDATION]** Seed one demo user from environment configuration. Do not hardcode a production password or add public sign-up unless separately approved.
- The schema must include a user owner for zones and records must be reachable only through an owned zone. This keeps authorization correct if the mock identity is expanded later.
- No user may read, edit, or delete another user's zone by guessing an ID.
- IAM policies and AWS accounts shown in the global header are decorative/mock context only. Do not build an IAM editor.

## 4.3 Terminology

| Term | Meaning in this application |
|---|---|
| Hosted zone | A persisted container for DNS record sets and zone metadata |
| DNS record / resource record set | A record name + type + TTL + one or more typed values within a zone |
| Zone apex | The hosted-zone root, represented to the user as `@` in a name input or as the zone's full domain |
| FQDN | Fully qualified domain name, e.g. `www.example.com` |
| Record value | Type-specific content such as an IP address, mail server, text value, or service target |
| Simple routing | The only implemented routing policy in the MVP |
| System record | A seeded NS/SOA record created with a zone to mimic Route 53 defaults |
| Mocked value | Data that looks plausible in the UI but is not connected to AWS or public DNS |

---

# 5. Scope and priority

## 5.1 P0 - Mandatory for initial acceptance

- Next.js + TypeScript frontend, FastAPI backend, SQLite database.
- Mocked login, logout, and session persistence.
- Shared console shell with AWS/Route 53-style navigation.
- Hosted Zone list with search, list/table, create, edit metadata, delete, confirmation, and persistent storage.
- Hosted Zone detail page with zone details and record table.
- Record CRUD for A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA.
- Search/filter, pagination, modals/forms, notifications, loading/empty/error states.
- Dashboard, Traffic Policies, Health Checks, Resolver, and Profiles placeholder pages.
- README, architecture/schema/API documentation, GitHub repository structure, deployed working link.

## 5.2 P1 - Strongly recommended quality requirements

- Type-aware DNS validation and useful inline errors.
- Seeded demo records and safe synthetic NS/SOA values.
- Table sorting and row selection for supported actions.
- Accessible labels, keyboard operation, responsive layout, and a consistent component system.
- Unit, API integration, and browser end-to-end tests.
- Structured error responses, request logging, DB migrations, health endpoint, environment-based settings.
- Empty/loading/error states and protection against accidental deletion of system records.

## 5.3 P2 - Optional bonus features from the assignment

1. Export a hosted zone to JSON.
2. Export a hosted zone to BIND zone-file format.
3. Import records from a BIND zone file with a preview and validation report.
4. Bulk delete of selected user-managed records.
5. Dark mode.
6. Keyboard shortcuts.

The team must first pass the P0 criteria. Bonus functionality is not a substitute for incomplete core CRUD or visual fidelity.

---

# 6. Information architecture and navigation

## 6.1 Global shell

All authenticated routes share a persistent shell inspired by the AWS Management Console:

- **Global top bar:** AWS-style dark/navy header, service name/Route 53 context, global search placeholder or functional local service search if implemented, help/notifications icons, account/menu control, and mock region/global indicator.
- **Service navigation:** left navigation rail/pane with Route 53 sections.
- **Main content area:** breadcrumbs, heading, concise description, contextual action buttons, alerts/notifications, and page content.
- **Responsive behaviour:** left navigation collapses behind a navigation toggle on smaller viewports; tables may scroll horizontally rather than crushing columns.
- **Identity menu:** displays a mock demo user and a working Sign out command.

No top-bar control may suggest a real AWS connection. The account display should say “Demo account” or equivalent if that prevents confusion.

## 6.2 Navigation tree

| Navigation item | Route | Behaviour |
|---|---|---|
| Dashboard | `/dashboard` | Static overview/Coming soon-compatible landing screen; can link to Hosted zones |
| Hosted zones | `/hosted-zones` | Fully functional list and management page |
| Health checks | `/health-checks` | Coming soon page |
| Traffic policies | `/traffic-policies` | Coming soon page |
| Resolver | `/resolver` | Coming soon page |
| Profiles | `/profiles` | Coming soon page |

If the reference console labels/order differ, prefer the current reference screenshot/site used for visual comparison, provided required destinations remain discoverable. Do not invent functional workflows for placeholder sections.

## 6.3 Route map

- `/login` - public sign-in page
- `/` - redirects to `/hosted-zones` when authenticated; otherwise `/login`
- `/dashboard` - placeholder or lightweight dashboard
- `/hosted-zones` - hosted zone list
- `/hosted-zones/new` - create hosted zone page or modal route
- `/hosted-zones/[zoneId]` - hosted zone detail and records
- `/hosted-zones/[zoneId]/records/new` - create record page or drawer/modal route
- `/hosted-zones/[zoneId]/records/[recordId]/edit` - edit record page or drawer/modal route
- `/health-checks`, `/traffic-policies`, `/resolver`, `/profiles` - placeholder pages

The same workflow may use dialogs/drawers instead of dedicated route pages when that better matches the reference console. Direct URL loading and browser refresh must still work.

---

# 7. Screen-level requirements

## 7.1 Login page

**Goal:** allow the reviewer to enter the application without real AWS identity.

**Required UI:** application/service identity, email/username field, password field, primary Sign in button, inline validation/error alert, and a small notice that this is a demo console. Visual styling should feel consistent with AWS sign-in patterns without pretending to be the real AWS sign-in portal.

**Behaviour:**

- Empty fields are rejected client-side and server-side.
- Incorrect credentials return a generic error such as “Sign-in failed. Check your credentials.” Do not reveal which credential was wrong.
- Success stores the authenticated session in an HttpOnly cookie, then navigates to `/hosted-zones` or the originally requested authenticated route.
- Reloading a protected route restores the session when the session is valid.
- Logout revokes the server-side session, clears the cookie, and returns to `/login`.
- Login must not create a user account or trigger external authentication.

**Acceptance check:** login → create a zone → refresh browser → zone remains visible → sign out → protected route redirects to login.

## 7.2 Hosted Zones list page

**Header area:** breadcrumb (`Route 53 > Hosted zones`), page title `Hosted zones`, concise explanatory text, and primary `Create hosted zone` action.

**Table/list capabilities:**

- Search by zone name and comment. Search is case-insensitive and trims leading/trailing whitespace.
- Optional zone-type filter (Public / Private), if type is shown in the zone model.
- Sorting by name, type, created/updated time (only expose sort controls supported by the API).
- Pagination with selectable page size (default 10 or 20; maximum 100 server-side).
- Columns: row selection (if bulk zone operations are supported), Domain name, Type, Record count, Description/Comment, Hosted zone ID, and contextual action or link.
- Clicking a zone name opens that zone's detail page.
- Empty state for a first-time user: brief explanation and `Create hosted zone` action.
- No-results state distinguishes “No hosted zones” from “No results match your search”.
- Refresh/reload action may be included if it refreshes server data.

**Create hosted zone:** open a Route 53-style dialog/drawer or dedicated form. Fields: Domain name (required), Type (Public hosted zone default; Public/Private selection is a UI-level mock), Comment/Description (optional). If Private is available, indicate that VPC association is simulated and do not call AWS APIs. The exact form may vary to match the current reference console; the fields and behaviour above are the baseline.

**Edit hosted zone:** edit Comment/Description only. The domain name and public/private type are immutable after creation in this clone, reflecting the replacement workflow of the real service. Explain this in the UI rather than showing a fake editable name field. Record count and created time are read-only.

**Delete hosted zone:** a confirmation dialog must state the domain name and number of contained records. Deleting the zone deletes its record sets in one database transaction. System/default records are included in the cascade. Cancel leaves state unchanged.

**Duplicate zone names:** allow zones with the same domain name, because separate hosted zones can share a domain name. Zone IDs distinguish them.

## 7.3 Hosted Zone detail page

**Header:** breadcrumb (`Route 53 > Hosted zones > <domain>`), zone name, Public/Private badge, and contextual actions aligned to the reference interface. Actions may include Delete zone and Edit hosted zone.

**Zone details panel:** collapsible/expandable section displaying hosted-zone name, type, mock hosted-zone ID, comment, created time, number of records, and synthetic nameserver list where appropriate. Do not imply that synthetic nameservers are registered or publicly delegated.

**Tabs:** `Records` must work. Tabs such as `Hosted zone details`, `Hosted zone tags`, or `DNSSEC signing` may be shown only if useful and their inactive areas are clearly mock/Coming soon. Do not build DNSSEC or tag management as an unrequested hidden subsystem.

**Records toolbar:** refresh button; search/filter by property or value; Record type filter; Routing policy filter defaulting to Simple; Alias filter may be displayed but should be inert only if disabled with an explanation. Create record action. Import zone file is optional, and must be implemented before enabled.

**Record table columns:** checkbox (for bulk actions when enabled), Record name, Type, Routing policy, Alias (No for MVP records), TTL (seconds), Value/Route traffic to, and Actions. Additional columns such as Health check or Record ID may appear if visual fidelity needs them, but unsupported values must display a dash and must not imply a real configured health check.

**Record table behaviour:**

- Search by record name, type, or displayed value (case-insensitive substring match).
- Type filter includes the nine assignment-required types; system SOA rows may also appear in the table but must not be offered as a createable user type.
- Pagination and sorting are functional.
- Row click opens record detail/edit only if it does not conflict with checkbox/action behaviour.
- Row actions include Edit and Delete. Delete is disabled or replaced by an explanatory message for protected system records.
- Multi-value records show a readable summary such as `192.0.2.10 + 1 more`; a details drawer/modal shows all values.
- Display the persisted record count and update after mutations.
- Empty state: explain that the hosted zone has no user-managed records (while default system records may still be present) and provide a create action.

## 7.4 Create / edit record form

The form must adapt to the selected record type. It must not render every possible field for every type.

**Common fields:** Record name, Record type, Routing policy (Simple only in MVP), TTL (seconds; default 300), value editor, optional comment if included in the data model, Cancel, and Save/Create record action.

**Record-name input:** allow `@` for the zone apex, a relative label such as `www`, or an FQDN inside the selected zone. Display the canonical full record name before submission. Reject names outside the hosted zone.

**Value editor:** allow a list of values for record types that support multiple values. Each value has its own validation error. For MX/SRV/CAA, provide structured inputs rather than asking the user to reverse-engineer a wire format.

**Behaviour:**

- Validation appears next to the specific field and is retained until corrected or resubmitted.
- Changing record type clears incompatible fields or asks before discarding unsaved values.
- Submit remains disabled while a request is in flight; repeated submit must not create duplicate rows.
- Successful save closes/navigates away from the form, refreshes server data, and emits a success notification.
- Failed save retains the user's input and displays a useful message.
- Edit starts with all existing values populated. Saving updates the selected record and must not create a second record.

## 7.5 Placeholder feature pages

The Dashboard, Health checks, Traffic policies, Resolver, and Profiles may use a common placeholder layout with:

- shared console shell and breadcrumb,
- page heading matching the navigation item,
- `Coming soon` status,
- one concise sentence explaining the feature is outside this assignment's functional scope,
- optional link back to Hosted zones.

They must not contain broken links, dead buttons, or fabricated charts that look like live telemetry.

---

# 8. User journeys and state transitions

## 8.1 Primary journey: manage a hosted zone

1. Navigate to `/login`.
2. Enter demo credentials and sign in.
3. Application redirects to Hosted zones.
4. Select `Create hosted zone`.
5. Enter a valid domain name, choose Public/Private type, optionally add a comment, and save.
6. Backend validates and persists zone and system records in one transaction.
7. Frontend shows a success notification and the new zone in the list.
8. Open the zone and confirm zone details and record table are present.
9. Edit zone comment and save; verify updated comment persists after refresh.
10. Delete the zone only after confirming in a destructive-action dialog.

## 8.2 Primary journey: create and edit a record

1. Open an existing hosted zone.
2. Choose Create record.
3. Enter record name, type, TTL, and type-specific values.
4. Submit; backend validates ownership, canonical name, type, value format, and duplicate/CNAME constraints.
5. UI displays the record row and success notification.
6. Search/filter to find the record.
7. Open Edit, alter TTL or value, and save.
8. Verify the existing record changed without a duplicate row.
9. Delete the user-managed record and confirm its absence from list and database-backed refresh.

## 8.3 Session journey

- Valid session on refresh: the app restores the session by calling `GET /api/v1/auth/me` or a server-side equivalent.
- Expired/revoked session: protected screens redirect to login; the app clears stale local user state.
- API 401 response: do not loop redirects indefinitely; clear cached identity and send the user to login.
- Logout: revoke the session server-side first, then clear UI state and navigate to login. If the request fails due to an outage, still show that logout could not be confirmed and avoid claiming server revocation succeeded.

## 8.4 Deletion journey

- Destructive actions always require confirmation.
- The confirmation identifies the exact target and consequences.
- Cancel is the default safe action when the user dismisses the dialog.
- API deletion is atomic. If the operation fails, keep the row and show an error notification.
- Zone deletion cascades only to records belonging to that exact zone.

## 8.5 Search and pagination state

- Search/filter/sort/page/page-size state should be represented in URL query parameters where practical, so the page can be refreshed or shared inside the authenticated app without losing context.
- Any change to search or filter resets the page to 1.
- Changing page size resets the page to 1.
- If deletion makes the current page empty, move to the previous valid page.
- The frontend must not fetch every row and paginate only in memory for normal operations; the API owns filtering, sorting, and pagination.

---

# 9. UX, visual fidelity, and accessibility requirements

## 9.1 Fidelity approach

**Recommended approach:** use the Cloudscape Design System (`@cloudscape-design/components`, `@cloudscape-design/global-styles`) as the first-choice component base. Cloudscape is an open-source React design system built for and used by AWS products. Use it to accelerate fidelity for AppLayout, side navigation, Header, Table, pagination, FormField, Input, Select, Modal, Flashbar, StatusIndicator, and related patterns. See Section 25 for official references.

Cloudscape is a strong starting point, not proof of pixel-perfect parity. Compare the finished implementation side by side with a current Route 53 reference at the same viewport and refine spacing, hierarchy, density, typography, colors, borders, icons, and table behaviour. Do not use a generic dashboard template or introduce a visually unrelated component library.

## 9.2 Visual reference and viewport

- Primary visual QA viewport: desktop 1440 × 900 CSS pixels.
- Secondary viewports: 1280 × 800, 1024 × 768, and a mobile width around 390 px.
- At desktop sizes, prioritize the current AWS console's compact utility layout: dark global header; pale/neutral content surfaces; clearly separated navigation; dense tables; understated borders; clear heading/action hierarchy; blue links; visually distinct primary action; concise status colours.
- Keep text, number, and table density close to the reference rather than using oversized marketing typography/cards.
- Use the reference console's wording for navigation/actions where possible, while avoiding claims that simulated actions affect real AWS resources.

## 9.3 Component behaviour

- Use a consistent spacing, typography, and border-token system.
- Prefer standard buttons and form fields from the chosen component system.
- Use modal/dialog patterns for confirmation and compact create/edit flows where matching the reference. Use drawers or a dedicated form route only when needed for space/accessibility.
- Notifications must be visible without covering critical input. Success, warning, and error states must have both colour and text/icon cues.
- Loading states should preserve layout where practical to avoid abrupt jumps.
- Table columns should have intentional widths and truncate long values with an accessible way to reveal full content.

## 9.4 Accessibility baseline

- All inputs have visible labels; placeholders are not labels.
- Dialog focus is trapped, initial focus is intentional, and focus returns to the invoking control on close.
- All actions work with keyboard only; tab order follows visual reading order.
- Links, buttons, selected rows, and form errors have accessible names/states.
- Colour alone does not communicate success/failure/record type.
- Do not remove visible focus indicators.
- Respect reduced-motion preferences for nonessential animation.
- Provide responsive overflow for tables and navigation.

## 9.5 Visual quality gate

Before acceptance, compare at least the Hosted zones list, Zone detail/Records, Create record form, Delete confirmation, and Login screen against the Route 53 reference. Record visible differences as issues; fix structural differences before decorative refinements. The target is a high-fidelity imitation of the core workflow, not an assertion of pixel-perfect identity without evidence.

---

# 10. Functional requirements

The MUST/SHOULD labels below define expected implementation behaviour.

## 10.1 Authentication

- **AUTH-01 [MUST]** User can log in with configured mock credentials.
- **AUTH-02 [MUST]** User can log out.
- **AUTH-03 [MUST]** Session survives page refresh and valid browser navigation.
- **AUTH-04 [MUST]** Unauthenticated access to protected pages redirects to login.
- **AUTH-05 [MUST]** Session state is validated server-side; localStorage alone is not authentication.
- **AUTH-06 [MUST]** Logout invalidates/revokes the server-side session and clears the cookie.
- **AUTH-07 [SHOULD]** Session expires after a configurable duration and the UI handles expiry gracefully.
- **AUTH-08 [MUST]** User-specific API endpoints are protected; unauthenticated requests return 401.

## 10.2 Hosted zones

- **HZ-01 [MUST]** List the authenticated user's hosted zones from SQLite.
- **HZ-02 [MUST]** Search by domain name and comment; server-side filtering.
- **HZ-03 [MUST]** Create a zone after validation and persist it.
- **HZ-04 [MUST]** View details for a selected zone.
- **HZ-05 [MUST]** Edit zone metadata (comment/description); domain and zone type remain immutable after creation.
- **HZ-06 [MUST]** Delete a zone after confirmation and cascade-delete child records atomically.
- **HZ-07 [MUST]** Each zone has a stable ID independent of the domain name.
- **HZ-08 [MUST]** Zones with the same normalized domain name may coexist and remain individually addressable by ID.
- **HZ-09 [MUST]** A user cannot access another user's zone by supplying its ID.
- **HZ-10 [SHOULD]** Support type filter, sorting, row count, record count, and pagination.
- **HZ-11 [SHOULD]** New zones contain mock system NS and SOA records to better reproduce the Route 53 model. System records are clearly distinguished and cannot be deleted through normal UI actions.

## 10.3 DNS records

- **DNS-01 [MUST]** List records belonging to one hosted zone.
- **DNS-02 [MUST]** Search records by name, type, and displayed value.
- **DNS-03 [MUST]** Create supported record types A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, and CAA.
- **DNS-04 [MUST]** Edit a user-managed record in place.
- **DNS-05 [MUST]** Delete a user-managed record after confirmation.
- **DNS-06 [MUST]** Persist records and all record values in SQLite.
- **DNS-07 [MUST]** A record is always scoped to a hosted zone; record API requests verify ownership of the parent zone.
- **DNS-08 [MUST]** Type-specific form fields and validation are used.
- **DNS-09 [MUST]** Support TTL in seconds, with a default of 300 for newly created user records.
- **DNS-10 [MUST]** Support one or multiple values depending on record type; preserve value order.
- **DNS-11 [MUST]** In the MVP, routing policy is Simple. Other complex policy types are not selectable as working functionality.
- **DNS-12 [PRODUCT MUST]** Reject invalid record combinations, duplicate simple record sets, out-of-zone names, CNAME apex records, and CNAME coexistence violations.
- **DNS-13 [SHOULD]** Search/filter/type choices persist in URL query parameters.
- **DNS-14 [SHOULD]** Seed default NS/SOA system records in each new zone. These records may be displayed but not offered as user-creatable types.
- **DNS-15 [SHOULD]** Provide bulk delete as optional bonus only after single-record CRUD is complete.

## 10.4 UX mechanics

- **UX-01 [MUST]** Navigation links navigate to real routes.
- **UX-02 [MUST]** Search and filters change the displayed results.
- **UX-03 [MUST]** Pagination changes the API result page.
- **UX-04 [MUST]** Create/edit forms validate and submit to FastAPI.
- **UX-05 [MUST]** Destructive actions show a confirmation modal/dialog.
- **UX-06 [MUST]** Successful operations display a success notification; failed operations display an error notification/message.
- **UX-07 [MUST]** Empty, loading, validation, unauthenticated, and server-error states are deliberately designed.
- **UX-08 [MUST]** No visible control is intentionally inert. Unsupported functionality is disabled or routes to an explicit Coming soon page.
- **UX-09 [SHOULD]** Search text is debounced (approximately 250-350 ms) or submitted on Enter; avoid a request on every keystroke without throttling.
- **UX-10 [SHOULD]** Browser refresh on a valid detail URL reloads the same resource and preserves list state when navigated back.

## 10.5 Optional functionality

- **OPT-01 [OPTIONAL]** Export zone to JSON.
- **OPT-02 [OPTIONAL]** Export zone to BIND format.
- **OPT-03 [OPTIONAL]** Import BIND zone file, validate it, show a preview, then commit atomically.
- **OPT-04 [OPTIONAL]** Bulk delete selected records with one confirmation step and per-record outcome reporting.
- **OPT-05 [OPTIONAL]** Dark mode using supported theme tokens, with persisted preference if implemented.
- **OPT-06 [OPTIONAL]** Keyboard shortcuts with a visible help affordance and no conflict with normal typing in form fields.

---

# 11. DNS record model and validation rules

The application stores and edits records as data objects; it does not serialize them into DNS wire format or publish them to a resolver.

## 11.1 Shared record fields

| Field | Required | Rules |
|---|---|---|
| Hosted zone | Yes | Must exist and belong to authenticated user |
| Record name | Yes | `@`, relative name, or FQDN within selected zone; normalized to canonical FQDN |
| Type | Yes | One of A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA for user-created records |
| Routing policy | Yes | `SIMPLE` only in MVP |
| TTL seconds | Yes for user records | Integer 0 through 2,147,483,647; default 300; reject non-integer and negative input |
| Values | Yes | At least one correctly formatted value for the selected type |
| Comment | Optional | Plain text; maximum 1,000 characters if field is included |
| System flag | Backend-generated | True only for seeded/protected NS/SOA records |
| Created/updated timestamps | Backend-generated | ISO 8601 UTC timestamps |

## 11.2 Record type rules

| Type | Value structure | Validation for MVP | Example (documentation-only/test data) |
|---|---|---|---|
| A | One or more IPv4 addresses | Parse each with an IPv4 address parser; reject IPv6 and malformed input | `192.0.2.10` |
| AAAA | One or more IPv6 addresses | Parse each with an IPv6 address parser; reject IPv4 and malformed input | `2001:db8::10` |
| CNAME | One canonical target hostname | Target must be a hostname; cannot be used at the zone apex; no other type may coexist at the same owner name | `app.example.net` |
| TXT | One or more text strings | Preserve content exactly; trim only unintended outer form whitespace; enforce a sensible per-value limit (1,024 characters for this app) | `v=spf1 include:example.net -all` |
| MX | One or more `{priority, exchange}` values | Priority integer 0-65535; exchange must be a hostname | `10 mail.example.net` |
| NS | One or more target hostnames | Hostname values only; normal user NS record must not be confused with protected system NS record | `ns1.example.net` |
| PTR | One or more target hostnames | Target hostname syntax; no reverse-zone auto-generation is required | `host.example.net` |
| SRV | One or more `{priority, weight, port, target}` values | Priority/weight/port integers 0-65535; target hostname; `.` target may be allowed to represent unavailable service if consistently handled | `10 5 443 service.example.net` |
| CAA | One or more `{flags, tag, value}` values | Flags integer 0-255; tag restricted to `issue`, `issuewild`, or `iodef` for MVP; value required and escaped/displayed safely | `0 issue "letsencrypt.org"` |
| SOA | Seeded system value only | Not in create selector; protected in the UI; generated with mock values | Display-only synthetic SOA value |

**Note:** the assignment names nine user-creatable record types and does not require SOA as a user-created type. SOA can still exist as a system/default record to reproduce Route 53 behaviour. Do not add unsupported types into the mandatory create selector.

## 11.3 Name normalization

1. Trim outer whitespace.
2. Convert an accepted domain name to lowercase for matching and storage.
3. Remove a single trailing dot from the input for canonical database storage; the UI may choose Route 53-like presentation formatting independently.
4. Interpret `@` as the hosted-zone apex.
5. Interpret a relative name (for example, `www`) as `www.<zone-name>`.
6. Accept an FQDN only when it equals the zone apex or ends on a label boundary with `.<zone-name>`.
7. Reject empty labels in the middle, URL schemes (`http://`), paths, whitespace inside labels, underscores in ordinary host labels, labels longer than 63 characters, total FQDN longer than 253 characters, and a name outside the zone.
8. Use one canonicalization helper in the API/domain layer; do not reproduce subtly different validation in each endpoint.

For MVP, ASCII DNS names are supported. Internationalized domain names may be added later by converting to punycode consistently; do not half-support Unicode labels.

## 11.4 Cross-record constraints

- A simple record set is unique by `(hosted_zone_id, canonical_name, type)` in the MVP.
- A CNAME cannot coexist with any other type at the same canonical owner name.
- A CNAME cannot be created at the hosted-zone apex.
- The record's owner name must fall within the parent hosted zone.
- User-created NS records can exist for delegation of subdomains; the zone apex system NS record is protected.
- Default system NS/SOA rows are marked as system records and cannot be edited/deleted through ordinary record CRUD.
- Do not silently drop invalid values when editing. Return field-level validation errors and preserve the user's input in the UI.

## 11.5 System record creation

When a hosted zone is created, the backend should create the zone and its two system record sets in a single database transaction:

- NS record at the zone apex with four synthetic name server hostnames under a reserved `.invalid` suffix.
- SOA record at the zone apex with synthetic primary name server, responsible party, serial, refresh, retry, expire, and minimum TTL fields represented as a display string or structured internal value.

Use `.invalid` and documentation-only values so users cannot mistake or successfully rely on them as real delegation data. The system records must be tagged `is_system = true`. A failed system-record insert must roll back the zone insert.

## 11.6 TTL semantics

TTL is a stored integer expressed in seconds. The default of 300 is a UI/product default, not a promise of external DNS caching. Because the app performs no DNS resolution, changing TTL does not change any real cache or propagation time.

---

# 12. Technical architecture

## 12.1 Logical architecture

```text
Browser
  |
  v
Next.js App Router (TypeScript)
  - shared console layout / navigation
  - pages, tables, forms, dialogs, notifications
  - session-aware route handling
  - typed API client
  |
  | same-origin /api/v1 requests (dev proxy or deployment rewrite)
  v
FastAPI application
  - authentication/session dependencies
  - route handlers / Pydantic request-response schemas
  - domain/service layer (authorization + business rules)
  - SQLAlchemy persistence layer
  |
  v
SQLite database file
  - users / sessions / hosted_zones / dns_records / record_values
  - Alembic migrations
```

Optional testing-only components: pytest and HTTPX for backend tests; Playwright for browser journeys. No message broker, cache, cloud database, or external DNS service is required.

## 12.2 Request flow

1. User interacts with a page.
2. Frontend calls a typed API client using `/api/v1/...`.
3. FastAPI authenticates the session cookie and resolves the user.
4. A router validates request shape via Pydantic and calls a service function.
5. Service function checks resource ownership and business rules, then uses a database session/transaction.
6. API returns the documented response envelope or standardized error.
7. Frontend invalidates/refetches relevant query data and presents feedback.

The frontend must not duplicate business rules as the only enforcement. Frontend validation is for usability; backend validation is authoritative.

## 12.3 Architectural choices

- **Modular monolith:** one FastAPI app with routers, schemas, services, and repositories; no microservices.
- **API-first contract:** stable request/response schemas documented in code and README; frontend should not import ORM models.
- **Data access:** SQLAlchemy 2.x ORM, typed models, explicit transactions for compound writes.
- **Migrations:** Alembic is recommended even for SQLite so schema changes are reproducible.
- **Persistence:** SQLite with foreign keys enabled on every connection. For single-instance deployment, use a persistent disk and a single application writer process unless concurrency has been explicitly tested.
- **Frontend state:** server data is authoritative. Use local component state for open dialogs/form drafts; avoid a second shadow copy of database records.
- **Component system:** Cloudscape is recommended for the AWS-console-like UI; isolate any custom overrides in a small theme layer.

## 12.4 Transaction boundaries

- Create zone + create its system records: one transaction.
- Update a record + replace its value children: one transaction.
- Delete zone + dependent records: rely on enforced cascade and commit as one operation.
- Bulk delete: one transaction for all valid selected record IDs; if partial outcomes are intentionally allowed, define and return per-item results explicitly. Do not leave half-mutated state without explanation.
- BIND import (optional): parse/validate the entire file first, preview result, then commit all accepted rows atomically after user confirmation.

---

# 13. Technology stack

The assignment fixes the main stack. The supporting libraries below are recommendations to make the design implementable and testable, not additional assignment mandates.

## 13.1 Frontend

| Concern | Selected technology | Why |
|---|---|---|
| Framework | Next.js App Router | Required frontend framework; route-based console pages and deployable frontend |
| Language | TypeScript, strict mode | Required; safer data contracts and maintainability |
| UI/design | `@cloudscape-design/components` + `@cloudscape-design/global-styles` | AWS-origin design system and ready-made tables/forms/dialogs/navigation |
| API client | Small typed `fetch` wrapper; TanStack Query may be used if useful | Centralized error handling, query invalidation, no scattered request logic |
| Runtime validation | Zod optional for frontend form schemas | Improve form feedback while retaining backend validation |
| Test runner | Vitest + React Testing Library (recommended) | Unit and component tests |
| Browser tests | Playwright (recommended) | End-to-end critical journeys and regressions |
| Styling | Cloudscape tokens plus limited local CSS | Avoid an unrelated design language or broad one-off overrides |

Implementation notes:

- Use stable compatible package versions chosen at project kickoff and commit the lockfile.
- Use strict TypeScript; do not default to `any` for API objects.
- Keep API types in a dedicated `lib/api/types.ts` module or generate them from OpenAPI if the team chooses to automate type generation.
- Use a single shared authenticated shell, not repeated header/sidebar markup on every page.
- If the team decides Cloudscape cannot reproduce a particular reference detail, document the exception and build a small custom component; do not replace the entire system casually.

## 13.2 Backend

| Concern | Selected technology | Why |
|---|---|---|
| Language | Python 3.12+ (or current supported Python at implementation kickoff) | Mature ecosystem and clean API development |
| API framework | FastAPI | Required backend framework, validation, OpenAPI docs |
| Request/response schema | Pydantic v2 | Typed and centrally validated API contracts |
| ORM | SQLAlchemy 2.x | Explicit models/relationships and database sessions |
| Migration tool | Alembic | Versioned and repeatable schema changes |
| Database | SQLite | Required persistence layer, file-based and simple to deploy |
| Password hashing | Argon2id through a maintained password-hashing library | Even mocked credentials should not be stored in plaintext in the DB |
| Session token | Cryptographically random opaque token, hash stored server-side | Revocable, simple mocked session model without a third-party identity provider |
| Backend tests | pytest + HTTPX TestClient | API and service-level tests |
| Lint/type checks | Ruff; mypy or pyright optional | Consistent Python quality gates |

## 13.3 Infrastructure and delivery

- Git repository with `frontend/` and `backend/` at the root.
- `.env.example` files document required configuration with placeholders only.
- Local development may use a local SQLite file under a gitignored `data/` directory.
- Production/demo deployment must use durable filesystem storage for SQLite. Do not use an ephemeral filesystem and assume the database will persist through redeploys.
- Use a single backend instance with a persistent volume for the initial demo. SQLite is acceptable for this assignment; migrate to a server database only if the product's future scope genuinely requires concurrent multi-instance writes.
- Frontend deployment may be on Vercel or an equivalent Next.js host. Backend may be on a service that supports FastAPI and a persistent volume. Ensure a same-origin `/api` rewrite/reverse proxy or configure CORS and cookie attributes correctly.
- Use HTTPS in production; keep secrets in deployment environment variables.

## 13.4 Environment variables

Suggested variables (names may be refined, but semantics must remain documented):

**Backend**

- `APP_ENV=development|test|production`
- `DATABASE_URL=sqlite:///./data/route53_clone.db`
- `SESSION_COOKIE_NAME=route53_session`
- `SESSION_TTL_SECONDS=43200` (12 hours; configurable)
- `SESSION_COOKIE_SECURE=true` in production, false only for local HTTP development
- `DEMO_USER_EMAIL=demo@example.test`
- `DEMO_USER_PASSWORD` supplied locally/deployment secret; never commit its value
- `CORS_ALLOWED_ORIGINS` only needed if not using same-origin proxying
- `LOG_LEVEL=INFO`

**Frontend**

- `NEXT_PUBLIC_APP_NAME=Route 53 Clone`
- `API_INTERNAL_BASE_URL` or equivalent server-side target for a same-origin proxy/rewrite, depending on hosting provider
- Never place backend secrets in `NEXT_PUBLIC_*` variables.

---

# 14. Data model and persistence

## 14.1 Entity relationship overview

```text
users 1 ---- * sessions
users 1 ---- * hosted_zones
hosted_zones 1 ---- * dns_records
 dns_records 1 ---- * record_values
```

`audit_events` is optional but recommended if a small audit/debug trail is useful. It is not mandatory for assignment acceptance.

## 14.2 Table: `users`

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT UUID | Primary key |
| `email` | TEXT | Unique, normalized lowercase |
| `display_name` | TEXT | Required |
| `password_hash` | TEXT | Required; never store plaintext |
| `is_active` | INTEGER/BOOLEAN | Default true |
| `created_at` | TEXT UTC ISO timestamp | Required |

No public user registration is required. A seed/init command creates the configured demo identity if it does not exist, without overwriting an explicitly changed password on every startup.

## 14.3 Table: `sessions`

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT UUID | Primary key |
| `user_id` | TEXT UUID | FK to `users.id`, `ON DELETE CASCADE` |
| `token_hash` | TEXT | Unique hash of opaque session token; raw token is cookie-only |
| `created_at` | TEXT UTC timestamp | Required |
| `expires_at` | TEXT UTC timestamp | Required and checked on every authenticated request |
| `last_seen_at` | TEXT UTC timestamp | Updated at a reasonable interval, not necessarily every request |
| `revoked_at` | TEXT UTC timestamp nullable | Set at logout/revocation |

Indexes: unique index on `token_hash`; index on `user_id`; index on `expires_at` for cleanup.

## 14.4 Table: `hosted_zones`

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT UUID | Primary key; internal stable key |
| `zone_id` | TEXT | Display identifier resembling a Route 53 zone ID; unique |
| `user_id` | TEXT UUID | FK to `users.id`, `ON DELETE CASCADE` |
| `name` | TEXT | Normalized domain name, lowercase, no final dot |
| `zone_type` | TEXT enum | `PUBLIC` or `PRIVATE`; immutable after creation |
| `comment` | TEXT nullable | Maximum 1,000 characters |
| `created_at` | TEXT UTC timestamp | Required |
| `updated_at` | TEXT UTC timestamp | Required |

Indexes: `(user_id, name)` for search and `(user_id, created_at)` for list views. Do **not** make `(user_id, name)` unique; repeated zone names are allowed and each zone has a distinct ID.

Record count should be computed from related records or maintained only if atomic consistency is guaranteed. For this project, a count query is preferred to avoid stale cached counts.

## 14.5 Table: `dns_records`

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT UUID | Primary key |
| `hosted_zone_id` | TEXT UUID | FK to `hosted_zones.id`, `ON DELETE CASCADE` |
| `name` | TEXT | Canonical FQDN within the zone |
| `record_type` | TEXT enum | Nine user types plus `SOA` for seeded system records |
| `routing_policy` | TEXT | `SIMPLE` for MVP |
| `ttl_seconds` | INTEGER nullable | Required for user records; system SOA may render TTL according to its data model |
| `comment` | TEXT nullable | Optional bounded text |
| `is_system` | INTEGER/BOOLEAN | Default false; only backend may set true |
| `created_at` | TEXT UTC timestamp | Required |
| `updated_at` | TEXT UTC timestamp | Required |

Indexes: `(hosted_zone_id, name)`, `(hosted_zone_id, record_type)`, and relevant composite indexes used by filters. Enforce the uniqueness rule for a simple record set at the service layer and, where compatible with the chosen normalized columns, via a database constraint/index.

## 14.6 Table: `record_values`

Use one child row for each ordered value in a record set. Recommended columns:

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT UUID | Primary key |
| `record_id` | TEXT UUID | FK to `dns_records.id`, `ON DELETE CASCADE` |
| `position` | INTEGER | Zero-based or one-based order, consistent across code |
| `value_json` | TEXT JSON | Typed value payload; schema depends on parent `record_type` |
| `display_value` | TEXT nullable | Optional denormalized display form; avoid if it can become inconsistent |

Suggested `value_json` shapes:

```json
{"value": "192.0.2.10"}
{"value": "2001:db8::10"}
{"value": "app.example.net"}
{"value": "v=spf1 include:example.net -all"}
{"priority": 10, "exchange": "mail.example.net"}
{"value": "ns1.example.net"}
{"value": "host.example.net"}
{"priority": 10, "weight": 5, "port": 443, "target": "service.example.net"}
{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}
```

The backend must validate the JSON shape against the record type before persistence and when reading older rows. The client must not be trusted to submit arbitrary type/value combinations.

Alternative implementation: use per-type typed columns or SQLAlchemy joined models if the team prefers stronger relational typing. The chosen design must remain understandable and fully documented; don't create two competing storage representations.

## 14.7 Table: `audit_events` (optional)

Columns: `id`, `user_id`, `entity_type`, `entity_id`, `action`, `summary`, `created_at`. Avoid storing passwords, session tokens, or unnecessary raw record values. Use this only if it adds debugging value without delaying P0.

## 14.8 Database invariants

- SQLite foreign keys are enabled in every connection.
- Use UTC timestamps in ISO 8601 format.
- All mutations commit only after validation succeeds.
- Zone deletion cascades through records and record values.
- Record-value ordering is deterministic.
- IDs are generated by the backend, not accepted from create requests.
- Ownership is derived from the authenticated user and parent relationships, not a trusted `user_id` posted by the frontend.
- Apply Alembic migrations before serving application traffic; do not rely on ad hoc table creation in production.
- Seed/demo initialization is idempotent.

---

# 15. API specification

## 15.1 API conventions

- Base path: `/api/v1`.
- Request and response bodies are JSON unless an optional export/import endpoint explicitly returns a file.
- Authenticated endpoints use an HttpOnly session cookie.
- Responses use ISO 8601 UTC timestamps.
- List endpoints are paginated server-side.
- Record endpoints are nested under the parent hosted zone to communicate ownership and scope.
- Do not expose SQLAlchemy model internals directly. Use Pydantic response schemas.
- Interactive OpenAPI docs are available in development; production exposure may be disabled or restricted as desired.

## 15.2 Standard list response

```json
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total_items": 0,
  "total_pages": 0
}
```

`total_pages` is 0 when there are no results or may be 1 by a consistently documented convention. Choose one convention and keep the frontend/API aligned; this PRD recommends 0 for empty results.

## 15.3 Standard error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {"field": "values.0.value", "message": "Enter a valid IPv4 address."}
    ],
    "request_id": "req_..."
  }
}
```

`details` may be empty when not relevant. Never include stack traces, SQL queries, secrets, password hashes, or session tokens in client-visible errors.

## 15.4 Authentication endpoints

| Method + path | Auth | Request | Success |
|---|---|---|---|
| `POST /api/v1/auth/login` | No | `{ "email": "demo@example.test", "password": "..." }` | `200` user summary + Set-Cookie session |
| `POST /api/v1/auth/logout` | Yes when possible | Empty JSON body | `204`; session revoked and cookie cleared |
| `GET /api/v1/auth/me` | Yes | None | `200` current user summary; `401` if absent/expired |

Example user summary:

```json
{"id":"<uuid>","email":"demo@example.test","display_name":"Demo User"}
```

Login error should be a generic `401 AUTHENTICATION_FAILED`. Rate limiting is optional for this mocked setup, but repeated invalid attempts must not generate noisy sensitive logs.

## 15.5 Hosted zone endpoints

### `GET /api/v1/hosted-zones`

Query parameters:

- `q` optional text search across name/comment
- `zone_type` optional `PUBLIC` or `PRIVATE`
- `page` default 1, minimum 1
- `page_size` default 20, range 1-100
- `sort_by` allowlist: `name`, `zone_type`, `created_at`, `updated_at`
- `sort_order`: `asc` or `desc`

Returns paginated zone summaries, with `record_count` and stable `zone_id`.

### `POST /api/v1/hosted-zones`

Request:

```json
{"name":"example.com","zone_type":"PUBLIC","comment":"Primary demo zone"}
```

Returns `201 Created` with the zone and, if the P1 system-record decision is enabled, the zone's initial mock NS/SOA record count. Invalid domains return `422`; authenticated duplicate domain names are allowed; server-generated ID is returned.

### `GET /api/v1/hosted-zones/{zone_id}`

Returns the complete zone details for an owned zone. A nonexistent or non-owned ID returns `404` to avoid leaking another user's resource.

### `PATCH /api/v1/hosted-zones/{zone_id}`

Request:

```json
{"comment":"Updated description"}
```

Only metadata fields explicitly allowed by the schema can be changed. `name`, `zone_type`, `id`, `zone_id`, `user_id`, and timestamps are not directly writable from client input. Returns `200` updated object.

### `DELETE /api/v1/hosted-zones/{zone_id}`

Returns `204 No Content`. Backend deletes the owned zone and cascading records in a transaction. The UI is responsible for a confirmation dialog; backend does not assume UI confirmation means authorization.

## 15.6 DNS record endpoints

### `GET /api/v1/hosted-zones/{zone_id}/records`

Query parameters:

- `q` optional search across name, type, and normalized/display value
- `record_type` optional one supported type (SOA may be included for read/filter)
- `routing_policy` optional; only `SIMPLE` yields MVP records
- `page`, `page_size` (maximum 100), `sort_by` (`name`, `record_type`, `ttl_seconds`, `updated_at`), `sort_order`

Returns a paginated list. Each record includes values sufficient to render its row and open detail/edit.

### `POST /api/v1/hosted-zones/{zone_id}/records`

Example A record request:

```json
{
  "name":"www",
  "record_type":"A",
  "routing_policy":"SIMPLE",
  "ttl_seconds":300,
  "values":[{"value":"192.0.2.10"}],
  "comment":"Demo web endpoint"
}
```

Returns `201 Created`. The server canonicalizes the name to `www.example.com` and persists the record and ordered values atomically.

Example type payloads:

```json
{"name":"@","record_type":"MX","ttl_seconds":300,"values":[{"priority":10,"exchange":"mail.example.com"}]}
{"name":"_service._tcp","record_type":"SRV","ttl_seconds":300,"values":[{"priority":10,"weight":5,"port":443,"target":"service.example.com"}]}
{"name":"@","record_type":"CAA","ttl_seconds":300,"values":[{"flags":0,"tag":"issue","value":"letsencrypt.org"}]}
```

### `GET /api/v1/hosted-zones/{zone_id}/records/{record_id}`

Returns one owned record and all ordered values. System records can be read but are protected from normal edit/delete routes.

### `PATCH /api/v1/hosted-zones/{zone_id}/records/{record_id}`

Accepts the same mutable fields as record create, excluding IDs/ownership/system flag. Editing replaces all child values in one transaction. The server must validate both parent-zone ownership and record-zone association. It must not accept a record ID belonging to another zone simply because both IDs are valid.

### `DELETE /api/v1/hosted-zones/{zone_id}/records/{record_id}`

Returns `204 No Content` for a user-managed record. Returns a documented conflict/forbidden-style error for a protected system record (`409 SYSTEM_RECORD_PROTECTED` recommended). Non-owned/mismatched resources return `404`.

### Optional endpoints

- `GET /api/v1/hosted-zones/{zone_id}/export?format=json|bind` - downloads a JSON or BIND representation.
- `POST /api/v1/hosted-zones/{zone_id}/import/bind` - accepts a file, parses and validates it, returns a preview/report; a separate commit endpoint or explicit confirmation token may be used to apply the preview.
- `POST /api/v1/hosted-zones/{zone_id}/records/bulk-delete` - accepts IDs, validates all are user-managed records in the same owned zone, and returns a deterministic result.

Optional endpoints must not be added to the main implementation until P0 functionality is accepted.

## 15.7 Health endpoint

`GET /healthz` returns a small non-sensitive status object or `200 OK`. It may verify the application is alive and, if practical, can reach SQLite. Do not disclose filesystem paths, credentials, or database internals.

## 15.8 HTTP status and error-code mapping

| HTTP | When to use | Example error code |
|---|---|---|
| `200` | Successful read/update/login | - |
| `201` | New zone/record created | - |
| `204` | Successful delete/logout | - |
| `400` | Malformed request not covered by field validation | `BAD_REQUEST` |
| `401` | Missing/expired/invalid session or invalid login | `UNAUTHENTICATED` / `AUTHENTICATION_FAILED` |
| `403` | Authenticated user lacks permission where resource existence is not hidden | `FORBIDDEN` |
| `404` | Resource missing or deliberately hidden due to ownership mismatch | `NOT_FOUND` |
| `409` | Duplicate record set, CNAME conflict, or protected system mutation | `RECORD_CONFLICT` / `SYSTEM_RECORD_PROTECTED` |
| `422` | Schema or semantic field validation error | `VALIDATION_ERROR` |
| `429` | Optional rate-limit exceeded | `RATE_LIMITED` |
| `500` | Unexpected internal failure | `INTERNAL_ERROR` |

Maintain one central exception handler so all API routes share the same error shape.

## 15.9 API contract examples are normative for shape, not every exact field

The snippets above define the intended style. The team may add safe read-only fields or split schemas where helpful, but must keep the API consistent, versioned, and fully documented. Any field rename must be reflected in frontend types, tests, and README in the same change.

---

# 16. Authentication and security

## 16.1 Mock login design

- Seed the demo user through a CLI/bootstrap task or a controlled application-startup initializer.
- Store password hashes, not plaintext credentials.
- Compare credentials using the selected password-hashing library.
- On successful login, create a cryptographically random opaque session token. Store only its hash in `sessions`; set the raw token in an HttpOnly cookie.
- Cookie properties: `HttpOnly`, `SameSite=Lax`, `Path=/`, configured expiration; `Secure=true` in production HTTPS.
- Every authenticated request validates session hash, revocation state, expiration, and active user status.
- Logout revokes the session and expires the cookie.
- Expired sessions may be cleaned up periodically or during auth operations.

This is a mocked identity system, not a claim of AWS-grade identity assurance. Do not add JWT complexity unless a concrete deployment constraint requires it.

## 16.2 Same-origin/API deployment

Preferred setup: expose the frontend and API under one browser origin using a Next.js rewrite or reverse proxy. This reduces cookie and CORS complexity. If separate origins are unavoidable, explicitly configure allowed origins with credentials, cookie `SameSite`/`Secure` settings, and deployment-specific behaviour; never use wildcard CORS with credentials.

## 16.3 Authorization rules

- All `/hosted-zones` and nested `/records` routes require a valid session.
- Database queries filter via the authenticated user, either directly (`hosted_zones.user_id`) or through a parent join.
- Never trust a posted `user_id` or frontend-only permission check.
- A record can be accessed only if its parent zone is owned by the current user and the record belongs to that zone.
- A public response to an unknown ID and a known-but-non-owned ID should be indistinguishable where practical (`404`).
- Only backend-created system records can set `is_system=true`.

## 16.4 Input and output safety

- Validate all request data through Pydantic and domain validation.
- Store user-provided comments/text as data; escape/render them safely in the UI.
- Do not interpolate user values into SQL. Use SQLAlchemy bound parameters.
- Do not allow zone files to execute code; treat imports as untrusted text and enforce a size limit.
- Set a reasonable request body/upload limit if import is enabled.
- Avoid logging passwords, raw session tokens, secret environment values, or unnecessary user-supplied record contents.

## 16.5 CSRF, CORS, and browser boundaries

- With cookie-based auth, keep `SameSite=Lax`, use same-origin API routing when possible, and reject state-changing requests from unexpected origins where feasible.
- If the API is publicly available cross-origin, define a CSRF strategy before shipping; do not rely on CORS alone as CSRF protection.
- Production traffic must use HTTPS.
- No API endpoint should perform DNS lookups or arbitrary outbound requests based on a submitted hostname.

## 16.6 Secret and environment management

- Commit `.env.example`, not `.env`.
- Ignore local database files, secrets, caches, build artifacts, and test outputs in `.gitignore`.
- Configure demo credentials as deployment secrets.
- Use separate test database files for automated tests to avoid corrupting developer/demo data.

---

# 17. Error handling and application states

Every major screen must define these states explicitly.

| State | Expected UI |
|---|---|
| Initial loading | Skeleton/spinner at the page/table region; disable conflicting actions |
| Empty collection | Helpful explanation and the primary create action |
| No search results | “No results match your filters” plus clear/reset filters affordance |
| Form validation | Inline field message; focus first invalid field or summary |
| Saving | Show progress; prevent duplicate submission |
| Save success | Close form or navigate to detail; success Flashbar/toast; refresh canonical data |
| Save error | Keep user input; show safe actionable message; do not clear draft |
| Session expired | Clear current identity and route to login with a non-looping redirect |
| Resource not found | Friendly Not found message and a route back to Hosted zones |
| Backend unavailable | Error state with Retry; never show stale state as confirmed success |
| Delete confirmation | Name and impact; destructive action visually distinguished; safe Cancel option |
| Protected system record | Show row/details; disable destructive actions and explain why |

## 17.1 Notification rules

- Use one consistent notification/Flashbar mechanism.
- Success text names the action (`Hosted zone created`, `Record updated`, etc.).
- Error text does not expose stack traces. It should state what the user can do next where possible.
- For an operation that may have succeeded but whose response was lost, refetch canonical state before repeating a destructive or create operation.
- Do not show a success notification before the backend confirms success.

## 17.2 Resilient client behaviour

- Use request cancellation or ignore stale search responses so slower requests cannot overwrite newer filter results.
- Centralize 401 handling.
- Do not silently swallow errors in `catch` blocks.
- Optimistic updates are not required for this assignment; prefer server-confirmed updates for data integrity.

---

# 18. Non-functional requirements

## 18.1 Maintainability

- Use feature-oriented folders and small service functions.
- Separate API schemas from database models.
- Avoid a giant page component or a single backend file containing every route and all business logic.
- Establish lint/type/test commands in each package and make them easy to run in CI.
- Use descriptive names; avoid abbreviations that obscure DNS semantics.
- Record non-obvious assumptions in code comments and this document, not extensive comments that restate obvious lines.

## 18.2 Reliability and consistency

- Persist changes transactionally.
- Enforce SQLite foreign keys.
- API errors are predictable and do not crash the process.
- Refresh after a mutation produces the same result the UI just showed.
- A failed multi-step write leaves no partial zone/record/value state.
- The deployed SQLite file resides on a persistent volume or durable disk.

## 18.3 Performance

- Server-side query, filter, sort, and pagination for list endpoints.
- Add indexes used by query patterns rather than indexing every column by default.
- Do not load unlimited zone/record datasets into browser memory.
- Search UI debounce or Enter-to-search is acceptable; interactions should feel immediate at target demo scale.
- Keep bundle size manageable; avoid large libraries unless used by several flows.

## 18.4 Compatibility

- Target current stable desktop Chrome, Firefox, and Edge at implementation kickoff.
- Layout must remain functional at tablet/mobile widths even though desktop is the main visual evaluation target.
- Pin dependency versions through the package lockfile/requirements lock or compatible constraints.
- Deployment configuration should be reproducible from README.

## 18.5 Accessibility

Meet the Section 9.4 baseline. Run an accessibility audit or equivalent automated scan on core pages. Automated tools are not a substitute for keyboard testing of dialogs/forms.

## 18.6 Privacy and data minimization

Only demo content is expected. Do not ask users for real AWS credentials, production secrets, or private key material. Seed sample records with reserved example IP ranges and synthetic hostnames. The demo notice should state that changes are local to the clone.

---

# 19. Testing and quality gates

## 19.1 Test layers

### Backend unit tests

Test domain/service logic independently of HTTP where practical:

- domain name canonicalization and boundary checks,
- supported record type parsing,
- IPv4/IPv6 validation,
- MX/SRV/CAA structure validation,
- TTL bounds,
- CNAME apex and coexistence rules,
- duplicate record-set rejection,
- default system-record generation,
- ownership filters and protected system mutation rules,
- zone deletion cascade and transaction rollback.

### Backend API integration tests

Use a temporary test SQLite database per test run:

- login with correct/incorrect credentials,
- session persistence through `/auth/me`, logout revocation, expired token rejection,
- zone list/create/read/patch/delete,
- duplicate domain name zones allowed,
- user scope enforced by zone and record ID,
- records list/create/read/patch/delete for all nine types,
- search/filter/sort/pagination totals,
- field validation maps to expected status/error shape,
- system records cannot be mutated by standard API calls,
- deleting a zone removes its user/system records and values,
- no test writes into the developer's default DB.

### Frontend unit/component tests

- form changes when record type changes,
- field-level validation displays expected message,
- modal open/close and focus behaviour,
- notification rendering,
- table empty/no-results states,
- pagination reset when filters change,
- API error handling preserves the form draft,
- protected routes react to unauthenticated state.

### End-to-end tests

At minimum, automate these journeys in a browser:

1. Sign in and sign out.
2. Create zone; confirm it appears in list; refresh and confirm persistence.
3. Search zones and verify result filtering.
4. Edit zone comment and confirm persistence.
5. Create one A record and at least one structured record (MX/SRV/CAA); verify row values.
6. Search and filter records; navigate pagination when enough fixtures exist.
7. Edit a record and verify no duplicate row was created.
8. Delete a record after confirmation; cancel another deletion and verify no change.
9. Delete a zone and verify its records are removed.
10. Open each placeholder page and verify no broken navigation.

## 19.2 Test data

Use reserved example values only:

- IPv4: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`.
- IPv6: `2001:db8::/32`.
- Domains under `example.com`, `example.net`, or `.invalid` for synthetic internal values.
- Never put real personal or customer domain data into fixtures.

## 19.3 Definition of passing

- Backend tests pass locally and in CI.
- Frontend lint and type-check pass.
- Frontend production build succeeds.
- Browser end-to-end critical journeys pass against a clean test database.
- No known severe accessibility issue in core form/table flows.
- Visual QA checklist in Section 9.5 is reviewed.
- README steps are tested from a fresh clone or clean environment.

Do not claim tests passed unless they have actually been run. Report skipped tests and their reasons.

---

# 20. Deployment and operations

## 20.1 Local development

A new developer should be able to run the entire project using documented steps:

1. Install the supported Node.js and Python versions.
2. Copy `.env.example` to a local environment file and set demo credentials.
3. Install frontend packages from the committed lockfile.
4. Install backend dependencies in a virtual environment.
5. Run Alembic migrations and seed/bootstrap the demo user.
6. Start FastAPI and Next.js in separate terminals, or use a documented orchestration command.
7. Open the local frontend URL, sign in, and follow the demo journey.

Use separate local/test DB paths. Keep local `.db` files out of Git.

## 20.2 Demo/production-like deployment

- Deploy Next.js to a compatible host.
- Deploy FastAPI to a host that supports a persistent data volume or durable disk.
- Configure API proxy/rewrite so browser calls use the public frontend origin when possible.
- Configure `DATABASE_URL`, demo credentials, cookie flags, and `APP_ENV` through the host's secret/environment configuration.
- Run migrations as an explicit release/start step and fail deployment clearly if migrations fail.
- Configure a persistent SQLite path and confirm redeploying the backend does not reset user data.
- Add a health check to the hosting platform and validate `/healthz`.
- Include a public demo URL and any non-sensitive demo login instructions in README.

## 20.3 Database backup/reset

For the assignment, a sophisticated backup system is unnecessary. Provide a documented safe method to reset demo data locally and to back up the deployed SQLite file. Do not expose a public endpoint that resets production/demo data without authentication and intentional operator access.

## 20.4 Logging and diagnostics

- Log startup, migrations, and application errors.
- Include a request ID in logs and API error responses when practical.
- Log operation category/resource ID, not sensitive session contents.
- Configure log level through environment variable.
- A startup DB failure should fail clearly rather than quietly create an empty database at an unexpected path.

---

# 21. Repository structure and engineering conventions

The assignment requires a GitHub repository containing `frontend/` and `backend/`. The following structure is recommended; teams may refine subfolders without changing separation of concerns.

```text
route53-clone/
├── README.md
├── .gitignore
├── .editorconfig
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DATABASE.md
├── frontend/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (console)/layout.tsx
│   │   ├── (console)/dashboard/page.tsx
│   │   ├── (console)/hosted-zones/page.tsx
│   │   ├── (console)/hosted-zones/new/page.tsx
│   │   ├── (console)/hosted-zones/[zoneId]/page.tsx
│   │   ├── (console)/health-checks/page.tsx
│   │   ├── (console)/traffic-policies/page.tsx
│   │   ├── (console)/resolver/page.tsx
│   │   ├── (console)/profiles/page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── console-shell/
│   │   ├── hosted-zones/
│   │   ├── records/
│   │   ├── forms/
│   │   ├── dialogs/
│   │   └── feedback/
│   ├── lib/
│   │   ├── api/client.ts
│   │   ├── api/types.ts
│   │   ├── auth/
│   │   ├── validation/
│   │   └── formatters/
│   ├── public/
│   ├── tests/
│   ├── package.json
│   └── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py
│   │   ├── core/security.py
│   │   ├── db/session.py
│   │   ├── db/base.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/v1/
│   │   │   ├── auth.py
│   │   │   ├── hosted_zones.py
│   │   │   └── records.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── hosted_zone_service.py
│   │   │   ├── record_service.py
│   │   │   └── dns_validation.py
│   │   └── tests/
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt or pyproject.toml
│   └── .env.example
└── .github/workflows/ci.yml
```

## 21.1 Coding conventions

- Name route handlers for HTTP/application concerns; put multi-step rules in service functions.
- Keep Pydantic schemas explicit; never expose `password_hash`, session token hashes, internal flags without reason, or the raw ORM object.
- Use dependency injection for current user and database session.
- Use one centralized frontend API client for credentials, content type, JSON parsing, and error conversion.
- Use reusable table/form/confirmation components where patterns repeat.
- Keep design tokens and application-specific overrides centralized.
- Do not store server data indefinitely in React state when it can be refetched.
- Keep generated/build files and SQLite DB out of Git.

## 21.2 Required developer scripts

Document equivalent commands for the chosen setup. Minimum commands:

- Frontend: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
- Backend: `run`, `test`, `lint`, `migrate`, `seed-demo-user`.
- Root/CI: `test` or a clearly documented sequence that executes checks for both packages.

The precise command names may differ by package coupon.prd, but the functionality must exist and be described in README.

---

# 22. Delivery plan and definition of done

The project owner can parallelize by feature, but the API/schema contract should be agreed before frontend and backend work proceed independently.

## Phase 0 - Reference audit and foundation

**Deliverables:** review the assignment and current Route 53 reference; capture screenshots of core pages at the target viewport; settle Cloudscape/theme plan; scaffold repository; define env variables, lint/test commands, and initial OpenAPI contract.

**Exit gate:** app starts locally; navigation skeleton renders; both packages build; conventions are documented.

## Phase 1 - Persistence and mocked authentication

**Deliverables:** SQLAlchemy models, Alembic migrations, seed-demo command, login/logout/me endpoints, session cookie behaviour, protected frontend shell, logout menu.

**Exit gate:** successful login, refresh persistence, failed login, logout revocation, and 401 handling pass tests.

## Phase 2 - Hosted-zone management

**Deliverables:** create/list/search/filter/sort/paginate/detail/edit-comment/delete; confirmation modal; system NS/SOA record creation; user ownership checks.

**Exit gate:** all hosted-zone requirements pass API and browser tests; records appear/count correctly; zone cascade is atomic.

## Phase 3 - DNS record management

**Deliverables:** typed schemas, per-type form variants, create/list/search/filter/sort/paginate/detail/edit/delete, type validations, CNAME/duplicate constraints, protected system records.

**Exit gate:** all nine user record types round-trip through the API/database/UI; search/filter and persistence tests pass.

## Phase 4 - Fidelity and usability

**Deliverables:** visual refinements, empty/loading/error states, accessibility/keyboard pass, responsive behaviour, Coming soon pages, demo seed data, consistent notifications.

**Exit gate:** visual QA performed for core pages; no dead controls; clean happy-path demonstration.

## Phase 5 - Optional bonuses and deployment

**Deliverables:** optional export/import/bulk operations/dark mode/shortcuts as time permits; hosted deployment with persistent storage; README, API/schema docs, public demo URL.

**Exit gate:** clean deployment test; persisted data survives redeploy; final acceptance checklist signed off.

## Definition of done for a feature

A feature is done only when its UI, API, validation, persistence, error handling, automated tests, accessibility basics, and documentation are complete. A static mockup does not count as a functional CRUD feature. A handler that only works with the in-memory state does not count as persistent storage.

---

# 23. Acceptance criteria and traceability matrix

## 23.1 Release acceptance checklist

### Authentication
- [ ] User can log in with documented demo credentials.
- [ ] Invalid credentials return a clear generic error.
- [ ] Session remains valid after browser refresh until expiration/revocation.
- [ ] Protected pages redirect when unauthenticated.
- [ ] Logout revokes the session and returns the user to login.

### Hosted zones
- [ ] User can list, search, sort/filter (where exposed), paginate, and open zones.
- [ ] User can create a zone with a valid domain and optional comment.
- [ ] Invalid domain names produce clear validation messages and create no DB rows.
- [ ] New zone exists after refresh and backend restart.
- [ ] User can edit zone metadata and verify the change persists.
- [ ] User can delete a zone after confirmation.
- [ ] Zone deletion removes dependent records and record values.
- [ ] Same domain name can exist in multiple zones with different IDs.
- [ ] Non-owned zone IDs do not reveal or mutate another user's data.

### DNS records
- [ ] User can create each of A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA.
- [ ] Invalid values are rejected by the backend with field-level error details.
- [ ] TTL defaults to 300 and persists as seconds.
- [ ] User can view, search, filter, paginate, edit, and delete records.
- [ ] Editing updates the existing record and replaces ordered values correctly.
- [ ] Duplicate simple record sets and CNAME conflicts are rejected.
- [ ] A record name outside the parent zone is rejected.
- [ ] System NS/SOA records are shown if seeded and protected against ordinary edit/delete.
- [ ] Changes persist after refresh and API restart.

### UI/UX
- [ ] Shared top bar/sidebar/navigation and breadcrumbs are present.
- [ ] Hosted Zones list and Zone Records table resemble the Route 53 console.
- [ ] Tables, forms, search, filters, pagination, dialogs, and notifications are functional.
- [ ] Loading, empty, no-results, form-error, API-error, and unauthenticated states are handled.
- [ ] Placeholder features show clear Coming soon pages.
- [ ] No visible button/link is inert or falsely implies a real AWS operation.
- [ ] Core workflows are keyboard-usable and layouts do not break at supported widths.

### Engineering and delivery
- [ ] Repository contains `frontend/` and `backend/`.
- [ ] README includes setup, architecture, schema, API overview, and demo URL.
- [ ] Database migrations and seed/setup procedure are documented.
- [ ] Backend tests, frontend lint/typecheck/build, and critical E2E tests pass.
- [ ] Deployment uses durable SQLite storage and HTTPS.
- [ ] No credentials, real customer data, or local database files are committed.

## 23.2 Assignment requirement traceability

| Source assignment item | PRD location | Acceptance evidence |
|---|---|---|
| Functional Route 53 web-app clone; UI/UX should match original | Sections 2, 6, 7, 9 | Visual comparison checklist/screenshots; reviewer demo |
| Frontend Next.js TypeScript | Sections 12, 13 | `frontend/` builds successfully with TypeScript |
| Backend FastAPI | Sections 12, 13, 15 | API starts; OpenAPI docs; integration tests |
| SQLite persistent storage | Sections 12, 14, 20 | DB rows persist after refresh/restart; migrations present |
| Mock login/logout/session | Sections 7.1, 8.3, 10.1, 16 | Auth unit/API/E2E tests |
| Hosted-zone CRUD and search | Sections 7.2, 10.2, 15.5 | Hosted-zone acceptance checklist |
| Record CRUD for A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA | Sections 7.3-7.4, 10.3, 11, 15.6 | Type matrix tests and UI flows |
| Navigation, tables, forms, search, filters, pagination, modals, notifications | Sections 6-9, 17 | Functional test + visual review |
| Dashboard, Traffic Policies, Health Checks, Resolver, Profiles placeholders | Sections 6.2, 7.5 | Every route loads and has Coming soon content |
| BIND import, JSON/BIND export, dark mode, shortcuts, bulk ops optional | Sections 5.3, 10.5, 15.6 | Bonus demos if implemented |
| GitHub repo with frontend/ and backend/ | Sections 20-21 | Repository structure |
| README setup, architecture, schema, API overview | Sections 12-15, 20-21 | README review from clean checkout |
| Hosted working link | Sections 20, 23.1 | Public demo URL and smoke test |
| Evaluation: UI, engineering, API, DB, code quality, docs, completeness | Sections 9, 12-21, 23 | Visual review, automated tests, repository/doc review |

---

# 24. Risks, assumptions, and decision log

## 24.1 Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Generic-looking UI | The assignment explicitly scores Route 53 visual similarity | Use Cloudscape; compare live reference; focus effort on list/detail/forms first |
| Overbuilding DNS/AWS features | Could delay mandatory CRUD and increase failure risk | Keep real DNS, complex routing, IAM, health checks, and traffic policies out of scope |
| Fake functionality | Inert filters/actions undermine completeness | Acceptance test every visible control; disable or label placeholders explicitly |
| SQLite data loss on deployment | Some app hosts use ephemeral disks | Use persistent volume; test a backend redeploy and confirm rows remain |
| Inconsistent name validation | Different endpoints may accept conflicting names | Centralize normalization/validation in backend service |
| Record value modelling becomes messy | Types have different value structures | Use typed Pydantic union/schema per type and one documented DB representation |
| Accidental system record deletion | Zone NS/SOA records are part of Route 53's default model | Mark as system records, display clearly, protect via API and UI |
| Cookie/CORS configuration error | Session fails on deployed frontend/backend origins | Prefer same-origin reverse proxy; test login and refresh on deployed URL |
| Scope creep into bonus features | Bonus items are optional | Gate work by P0 acceptance checklist and defer all P2 items |

## 24.2 Explicit assumptions

1. The assignment does not mandate exact framework/library versions beyond Next.js, TypeScript, FastAPI, and SQLite. Supporting versions are recommendations.
2. “Hosted zone CRUD” means the user can create, view, edit allowed metadata, and delete zones. Domain name and type are immutable after creation; the edit operation updates comment/description.
3. Zones may optionally model Public/Private type for Route 53 fidelity, but private VPC association remains simulated.
4. A newly created zone may create default mock NS/SOA records for fidelity. These are protected system records; user-created records remain fully CRUD-manageable.
5. “Full CRUD for DNS records” applies to the assignment-listed user-managed types. SOA is a system/default display record only, not a new user-createable type.
6. Routing policy is Simple for MVP. Complex Route 53 routing is explicitly outside scope.
7. A single configured demo user is enough to satisfy mocked auth; the data model remains owner-scoped for safe expansion.
8. SQLite is sufficient for this assignment if a durable volume and single-instance deployment are used.
9. Hosted URL, exact credentials, and selected deployment host are environment-specific and must be supplied when deploying.

## 24.3 Decision log

| ID | Decision | Reason | Revisit when |
|---|---|---|---|
| D-001 | Use Cloudscape as the first-choice UI system | Best available alignment with AWS console patterns and components | Reference parity tests expose a specific limitation |
| D-002 | Keep one FastAPI application and one SQLite DB | Matches assignment scope and reduces operational complexity | Multi-instance or higher-write requirements emerge |
| D-003 | Use cookie-backed opaque server-side sessions | Supports refresh persistence and logout revocation without real IAM | Hosting architecture makes same-origin cookies infeasible |
| D-004 | Zone names may duplicate; IDs are unique | Separate hosted zones can share a name | Assignment evaluator explicitly demands uniqueness |
| D-005 | Zone name/type are immutable; comment is editable | Keeps workflow close to hosted-zone semantics | Project owner confirms different interpretation of Edit |
| D-006 | Seed protected NS/SOA system records with `.invalid` values | Reproduces expected zone model without suggesting real delegation | Assignment rubric expects a blank record set instead |
| D-007 | Simple routing only | Core assignment asks CRUD/common record types, not complex routing | All P0 requirements are complete and time remains |
| D-008 | Same-origin API proxy is preferred | Reduces credentialed CORS/cookie complexity | Hosting provider cannot support proxy/rewrite |
| D-009 | BIND/import/export, dark mode, shortcuts, bulk operations are P2 | Explicitly optional assignment scope | P0 is complete |

Any change to a decision must be documented with a reason, an affected-requirements list, and the tests/docs that must change.

---

# 25. Reference material

## 25.1 Primary project source

- **Scaler SDE Fullstack Assignment - AWS Route53 Clone**, provided PDF. This document's mandatory scope and deliverables are derived from it.

## 25.2 Official product/design references used to operationalize the PRD

- **Amazon Route 53 - Creating a public hosted zone:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html
- **Amazon Route 53 - Working with records:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/rrsets-working-with.html
- **Amazon Route 53 - Creating records by using the console:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html
- **Amazon Route 53 - Supported DNS record types:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ResourceRecordTypes.html
- **Amazon Route 53 - NS and SOA records created for hosted zones:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/SOA-NSrecords.html
- **Cloudscape Design System:** https://cloudscape.design/
- **Cloudscape React components:** https://github.com/cloudscape-design/components

These references support the implementation interpretation and visual design approach; they do not expand the assignment into a real AWS integration. The live AWS console can evolve, so the team should capture its current core screens before final visual QA.

---

## Final implementation rule

When the team must choose between adding another feature and making a core screen accurate, persistent, tested, and reliable, prioritize the core screen. A small but convincing Route 53 control-plane simulation that genuinely works is the target; a broad set of nonfunctional AWS-looking pages is not.