# Custodian frontend

Minimal SvelteKit/TypeScript interface for BNH. The release scope is the fourteen reusable screens in [the screen inventory](docs/reference/ui_scrrens.md).

## Delivered journey

Screen 10, Vendors: company-scoped search and pagination; add/detail/edit drawers; contact and bank capture; server-controlled sensitive access; explicit unknown/restricted states; version conflict protection. Screens 1–3 also provide sign-in, forgot-password and a shared reset/activation form, including expired links, password matching and session revocation. Email requires backend Resend configuration. Screen 11 (`/staff`) adds staff search/status filters, invitations, account controls, department membership and protected office appointments in drawers. It requires staff:manage; additional actions require their own permissions. Screen 12 (`/organisation`) provides company/department creation, name and enabled-state changes, named officeholder history with eligibility and configuration gaps, and the read-only approval matrix. It requires organisation:manage. Dashboard remains unfinished. The root route currently opens Vendors. Screens 5–7 deliver saved drafts, private documents, signed submission and historical revision views. Screen 8 is My Tasks (`/requisitions?inbox=true`), with assigned HOD/Chief of Staff/MD approvals, rejection and return signing on the shared detail screen. Returned requests use Start correction, followed by a fresh signature and recalculated route. Screen 9 is the Board Resolution Workspace (`/requisitions/{id}/board`), reached from stage-specific My Tasks or the permitted requisition action. Secretary drafts, private formal evidence, signing, Chairman confirmation/return, correction history and later resolutions are persisted. Conditional approval remains explicitly on hold. Deploy the matching backend through schema 0015 before this frontend.

## Render deployment

Dockerfile and render.yaml are included. Follow [the Render setup](docs/render.md), deploy branch `dev`, and configure the backend URL.

## Local development

Use Node 24.21.0 (`nvm use`) and `npm ci`. Start the delivered backend with `.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000` in `bnh-backend`, then run `npm run dev -- --host localhost` here. Use the configured individual operator/staff account. There are no default production credentials.

`BACKEND_URL` selects the trusted backend origin (default `http://127.0.0.1:8000`). Both development and production forward `/api/v1` through the same server proxy with HttpOnly session cookies and CSRF. Configure the backend's allowed origin to match the frontend.

## Verification

Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test -- --run`, and `npm run build`.

For real browser verification, keep both repositories as siblings. In the backend, provision the isolated local PostgreSQL database with `.venv/bin/python -m scripts.dev_database` and run `.venv/bin/pytest` to apply and verify migrations. Then run `npm run build` and `npm run test:e2e` here. Install Playwright Chromium or set `CHROME_PATH` to your installed Chrome executable. The runner starts its own backend on 8017 and the built Node application on 4173; those ports must be free. Fixture creation refuses non-loopback/non-test database URLs and uses synthetic accounts only. Results/screenshots and fixture credentials stay ignored in `test-results/`.

Generate the delivered API types with `.venv/bin/python -m scripts.export_openapi` in the backend. The default `app.main` contract includes the delivered requisition and Board journeys.

These checks do not establish a Render deployment or real staff acceptance.

## Request history and Audit Log

Screens 5/8 now include scoped requester, department, company, vendor, inclusive Lagos creation dates and own-request filters. Screen 7 shows the pending actor/assignment blocker and a paginated timeline with signed-revision and permitted Board-record references. Meeting dates are separate from system recording/signing times. Screen 13 (`/audit`) is visible only with explicit `audit:read`; the server separately limits each event and document to the viewer's scope. It supports action/reference, actor, company, outcome and inclusive Lagos event-date filters with bounded pagination. A read-only auditor can open permitted requests/evidence, without request mutations or confidential Board access.

Deploy backend schema `0014` before this frontend; no new UI environment variables are required. An authorised configuration operator provisions company-scoped auditors with the backend's `scripts.configure_audit_reviewer` command. Deployment does not grant anyone access automatically. Audit names reflect current profiles; signed names remain in request history. Read-access events are recorded separately from the activity feed. Actual external archive delivery, PDFs and the dashboard are separate unfinished features.

## Notifications

The workspace header has a notification drawer for requester updates and currently eligible assigned work, with unread filtering, paging, persisted read state, retries and honest email delivery status. Opening an alert marks it read and navigates to the authenticated requisition or private Board workspace; it never signs a decision. Alerts refresh on navigation, window focus and every 30 seconds while the page is visible. Failed refreshes clear displayed results; expired sessions return to sign-in.

Deploy backend schema `0015` before this UI. Existing backend Resend settings enable email; no new frontend variable is needed. In-app alerts remain available while email is disabled or delivery fails. See the backend notification operations guide for retry limits and historical-email handling. `tests/notifications.e2e.ts` verifies the drawer, role handoffs, persisted reads, mobile layout and error recovery against the real test backend with private synthetic email capture.

## Dashboard (screen 4)

Sign-in and the workspace brand open `/`. The dashboard shows real scoped status counts, own-request totals, latest requisitions, recent permitted activity and currently assigned work. Status cards open the existing filtered list; request links open the existing detail/review screen. Creation, task and administrative shortcuts follow current server capabilities. Read-only reviewers cannot create or approve, and technical administrators do not gain financial visibility.

Data refreshes on window focus or the explicit Refresh dashboard control. Failed refreshes clear the old results and provide retry; expired sessions return to sign-in. No extra environment variable or migration is needed. Deploy the backend dashboard API first. The real-backend dashboard tests cover persistence, scoped roles, links, mobile layout and failed/expired refreshes.

### My Account & Security

Screen 14 is available to every signed-in user at `/account`, including read-only reviewers. It shows read-only personal/company/department details and current office appointments, a current-password-protected password-change form, and paginated active sessions. Individual, other-session and all-session sign-outs require confirmation; changing a password signs out all sessions and cancels outstanding reset links. Server times display in Lagos time. Refresh/focus reloads current access, API failures clear stale details, and expiry returns to sign-in. Passwords are never stored in browser storage. Profile/department/authority editing and MFA setup are not exposed.

Deploy the matching backend security APIs before this frontend. Existing Dockerfiles and Render settings apply; no new configuration or migration is required. Connected browser tests use isolated synthetic accounts, not production staff.

### Mobile workspace (WEB-001)

At widths up to 900px, Open navigation reveals a modal drawer instead of wrapping sidebar links above the page. It closes on route selection, Escape, backdrop tap or a resize to desktop, with keyboard focus handling and background scroll locking. The sticky mobile header keeps navigation, branding, notifications and the account control on one row. Open Account menu for the full name/email, Account & Security and Sign out; long identities wrap inside the dropdown. Notifications retain unread badges and a private responsive drawer. Desktop retains its sidebar and labelled controls. Role visibility and all server permissions are unchanged.

Deploy only the frontend from dev using the existing Dockerfile. No API, database or Render setting changes are needed. Tests use isolated synthetic accounts; local verification does not establish live deployment.

### Administrator visibility

Full system administrators can browse requisitions and vendors across BNH using the existing screens, even without a department membership. Requisitions, dashboard counts and public history show the expanded scope; oversight-only details clearly state that the request is read-only. Bank values and supporting/Board documents retain their separate restrictions. Approval actions and My Tasks still depend on office assignments.

Vendors loads its company selector from `/api/v1/vendors/companies` instead of treating view access as membership. The server's company `can_create` flag controls Add vendor; requisition creation uses `UserView.can_create_requisitions`. Existing vendor edit capabilities remain server-authorised. No new screen or Render variable is introduced. Deploy the matching backend first. Existing administrators with all three staff, organisation and appointment-management permissions receive the view automatically; no live account changes are made by tests.
