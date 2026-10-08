# Custodian frontend

Minimal SvelteKit/TypeScript interface for BNH. The release scope is the fourteen reusable screens in [the screen inventory](docs/reference/ui_scrrens.md).

## Delivered journey

Screen 10, Vendors: company-scoped search and pagination; add/detail/edit drawers; contact and bank capture; server-controlled sensitive access; explicit unknown/restricted states; version conflict protection. Screens 1–3 also provide sign-in, forgot-password and a shared reset/activation form, including expired links, password matching and session revocation. Email requires backend Resend configuration. Screen 11 (`/staff`) adds staff search/status filters, invitations, account controls, department membership and protected office appointments in drawers. It requires staff:manage; additional actions require their own permissions. Screen 12 (`/organisation`) provides company/department creation, name and enabled-state changes, named officeholder history with eligibility and configuration gaps, and the read-only approval matrix. It requires organisation:manage. Dashboard remains unfinished. The root route currently opens Vendors. Screens 5–7 deliver saved drafts, private documents, signed submission and historical revision views. Screen 8 is My Tasks (`/requisitions?inbox=true`), with assigned HOD/Chief of Staff/MD approvals, rejection and return signing on the shared detail screen. Returned requests use Start correction, followed by a fresh signature and recalculated route. Screen 9 is the Board Resolution Workspace (`/requisitions/{id}/board`), reached from stage-specific My Tasks or the permitted requisition action. Secretary drafts, private formal evidence, signing, Chairman confirmation/return, correction history and later resolutions are persisted. Conditional approval remains explicitly on hold. Deploy the matching backend through schema 0014 before this frontend.

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

Deploy backend schema `0014` before this frontend; no new UI environment variables are required. An authorised configuration operator provisions company-scoped auditors with the backend's `scripts.configure_audit_reviewer` command. Deployment does not grant anyone access automatically. Audit names reflect current profiles; signed names remain in request history. Read-access events are recorded separately from the activity feed. Actual external archive delivery, notifications, PDFs and the dashboard are separate unfinished features.
