# Visual QA

Screenshots were captured with Playwright at 1440×900 (plus 1280, 1024, and 390 px for the list
and detail pages) against an isolated backend loaded with the demo data:

```bash
cd frontend && CAPTURE_SCREENSHOTS=1 E2E_SEED_DEMO_DATA=1 npx playwright test tests/e2e/quality.spec.ts
```

**Reference used.** No live AWS console session (and no AWS account) was available, so screens
were compared against the documented Route 53 console structure in the project brief (dark
navy top navigation, collapsible "Route 53" side navigation, breadcrumbs, Flashbar, dense
Cloudscape tables, one primary action per header) and the Cloudscape Visual Refresh components
that the AWS console itself uses. **No pixel-parity claim is made.**

## Screens

| Screen | Screenshot |
|---|---|
| Login | [login.png](screenshots/login.png) |
| Hosted zones list | [hosted-zones-list.png](screenshots/hosted-zones-list.png) (+ [1280](screenshots/hosted-zones-list-1280.png), [1024](screenshots/hosted-zones-list-1024.png), [390](screenshots/hosted-zones-list-390.png)) |
| Zone detail / records | [zone-detail-records.png](screenshots/zone-detail-records.png) (+ [1280](screenshots/zone-detail-1280.png), [1024](screenshots/zone-detail-1024.png), [390](screenshots/zone-detail-390.png)) |
| Record details split panel | [zone-detail-split-panel.png](screenshots/zone-detail-split-panel.png) |
| Create record (MX) | [create-record-mx.png](screenshots/create-record-mx.png) |
| Delete hosted zone modal | [delete-zone-modal.png](screenshots/delete-zone-modal.png) |
| Placeholder (Health checks) | [placeholder-health-checks.png](screenshots/placeholder-health-checks.png) |

## Comparison per screen

### Global shell
- **Matches:** dark navy TopNavigation with a text identity (no AWS logo); collapsible
  SideNavigation with a "Route 53" header and the Dashboard / Hosted zones / Health checks /
  Profiles / Traffic flow / Resolver structure; breadcrumbs above the page header; one Flashbar at
  the top of the content; blue links; Visual Refresh styling.
- **Differences (remaining, intentional):** the identity is "Fiftythree" (project name, not an
  AWS brand); the "Global" label sits in the centre slot (TopNavigation only allows buttons and
  menus on the right, which would be inert); no search, CloudShell, notifications, help, or
  settings icons (they would do nothing); the user menu has only "Sign out" with "Demo account".
- **Fixed during QA:** the globe icon was invisible on the dark bar; on phones the "Global" label
  folded into a fake search icon, so it is now shown at ≥ 688 px only.

### Hosted zones list
- **Matches:** title with count, description, actions in order Refresh, View details, Edit,
  Delete, Create hosted zone (primary); radio selection; search + Type filter; columns Hosted
  zone name, Type, Record count, Description, Hosted zone ID; pagination and the preferences gear
  at the top-right of the table.
- **Differences:** an optional "Created" column (hidden by default) instead of Route 53's extra
  columns (Created by, query logging, etc.); "Record count" is not sortable because the API does
  not sort by it.
- **Fixed during QA:** the search box clipped its placeholder (widened).

### Zone detail / records
- **Matches:** zone name header with a Public/Private badge and Delete zone / Edit hosted zone;
  expandable "Hosted zone details"; tabs with "Records (N)" first; records toolbar Refresh, Edit
  record, Delete record, Create record (primary); filters for property/value, Type, Routing
  policy; columns Record name, Type, Routing policy, Alias, TTL (seconds), Value/Route traffic
  to; a record details split panel.
- **Differences:** no "Test record", "Configure query logging", or "Import zone file" buttons
  (out of scope; omitted rather than inert); no Health check / Evaluate target health / Record ID
  columns (the Record ID is in the details panel); DNSSEC and tags tabs show "Coming soon"; editing
  opens a page rather than editing inside the split panel.

### Create / edit record
- **Matches:** a single "Quick create"-style page: record name input with the zone suffix and a
  live full-name preview, record type select with descriptions, Alias toggle (disabled with an
  explanation), type-specific value editors, TTL with 1m/1h/1d presets, routing policy, comment,
  and Cancel / Create records in the footer.
- **Differences:** one record per submission (Route 53's "Add another record" is not offered);
  routing policy is fixed to Simple (disabled select with an explanation).
- **Fixed during QA:** a duplicated "Value" label on single-column value editors.

### Delete confirmations
- **Matches:** modal naming the target and consequences; zone deletion requires typing
  "delete" and states the record count including the default NS and SOA records; record deletion
  lists the record's name, type, and every value; Cancel is the safe default.

### Login
- **Matches the brief:** centered sign-in card, clear demo notice, no AWS branding. Optionally
  shows demo credentials with a "Use demo credentials" button when the deployment sets
  `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD`.
- **Difference (intentional):** it does not imitate the AWS sign-in page.

## Inert-control audit

Every visible control and what it does. "Disabled" controls state their reason.

| Page | Control | Behaviour |
|---|---|---|
| All console pages | "Fiftythree" identity link | Goes to Hosted zones |
| | Side navigation links (6) | Navigate to their pages; current section highlighted |
| | Side navigation collapse / "Open navigation" | Toggle the navigation panel |
| | Breadcrumb links | Navigate to the parent pages |
| | "Demo User" menu → Sign out | Revokes the session server-side and returns to /login |
| | Flashbar dismiss (×) | Dismisses the notification |
| | "Global" | Plain text label, not a control |
| Login | Email, Password, Sign in | Sign in (client and server validation) |
| | Use demo credentials (only when configured) | Fills the form |
| Hosted zones list | Refresh | Refetches the list |
| | View details / Edit / Delete | Open detail / edit page / delete dialog; disabled until a zone is selected |
| | Create hosted zone | Opens the create page |
| | Search, Type filter | Server-side filtering (URL state) |
| | Column headers (name, type, created) | Server-side sorting |
| | Pagination, Preferences (page size, columns) | Server-side paging; column visibility |
| | Row radio, zone name link | Select / open the zone |
| | Clear filters (no-match state), Create hosted zone (empty state), Retry (error state) | As labelled |
| Create hosted zone | Domain name, Description, Type tiles | Form inputs |
| | Cancel | Back to the list (asks before discarding input) |
| | Create hosted zone | Creates the zone |
| Edit hosted zone | Description, Save changes | Saves; disabled until the description changes |
| | Cancel | Back to the zone |
| Zone detail | Delete zone, Edit hosted zone | Delete dialog / edit page |
| | Hosted zone details (expand/collapse) | Toggles the section |
| | Tabs Records / DNSSEC signing / Hosted zone tags | Switch tabs (the last two show "Coming soon") |
| | Records: Refresh, Create record | Refetch / create page |
| | Records: Edit record, Delete record | Disabled until a user record is selected; for NS/SOA disabled with "Default NS and SOA records are managed by the hosted zone and can't be edited or deleted." |
| | Records: search, Type, Routing policy, sortable headers, pagination, preferences | Server-side, in the URL |
| | Split panel: Edit, Delete (same rules), close (×), resize | As labelled |
| Create / edit record | Record name, Record type, value editor (Add value / Remove), TTL + 1m/1h/1d, Comment | Form inputs |
| | Alias toggle | Disabled: "Alias records are not supported in Fiftythree." |
| | Routing policy select | Disabled: "Other routing policies are not available in Fiftythree." |
| | Cancel / Create records / Save | Back (asks before discarding) / submit |
| Dialogs | Cancel, ×, confirm button | Close / confirm; delete-zone confirm disabled until "delete" is typed |
| Coming soon pages (5) | "Go to Hosted zones" | Navigates to Hosted zones (no other controls) |
| Not found | "Go to Hosted zones" / "Back to …" | Navigates back |

Result: no inert controls were found. Copy was searched for "propagat", "AWS account",
"created in AWS", and "delegat": every hit is a disclaimer ("No AWS account is used", "not
delegated or publicly resolvable").

## Accessibility and responsiveness (automated)

- `tests/e2e/quality.spec.ts` runs axe on login, the hosted zones list, zone detail, create
  record, the open delete-zone modal, and a placeholder page: 0 violations of any impact on the
  final run (scans use reduced motion so transitions do not skew contrast measurements).
- Keyboard-only: creating a hosted zone and an A record; the delete dialog traps focus and
  returns it to "Delete zone" on Escape.
- No page-level horizontal scroll at 1440, 1280, 1024, and 390 px (tables scroll inside their
  own container); the navigation collapses behind the toggle below 688 px.
- No custom animations are defined; Cloudscape honours `prefers-reduced-motion`.
