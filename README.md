# Custodian frontend

Minimal SvelteKit/TypeScript interface for BNH. The release scope is the fourteen reusable screens in [the screen inventory](docs/reference/ui_scrrens.md).

## Delivered journey

Screen 10, Vendors: company-scoped search and pagination; add/detail/edit drawers; contact and bank capture; server-controlled sensitive access; explicit unknown/restricted states; version conflict protection. Screens 1–3 also provide sign-in, forgot-password and a shared reset/activation form, including expired links, password matching and session revocation. Email requires backend Resend configuration. Screen 11 (`/staff`) adds staff search/status filters, invitations, account controls, department membership and protected office appointments in drawers. It requires staff:manage; additional actions require their own permissions. Screen 12 (`/organisation`) provides company/department creation, name and enabled-state changes, named officeholder history with eligibility and configuration gaps, and the read-only approval matrix. It requires organisation:manage. Dashboard remains unfinished. The root route currently opens Vendors. Screens 5–7 deliver saved drafts, private documents, signed submission and historical revision views. Screen 8 is My Tasks (`/requisitions?inbox=true`), with assigned HOD/Chief of Staff/MD approvals, rejection and return signing on the shared detail screen. Returned requests use Start correction, followed by a fresh signature and recalculated route. Board work remains unfinished. Deploy the matching backend through schema 0012 before this frontend.

## Render deployment

Dockerfile and render.yaml are included. Follow [the Render setup](docs/render.md), deploy branch `dev`, and configure the backend URL.

## Local development

Use Node 24.21.0 (`nvm use`) and `npm ci`. Start the delivered backend with `.venv/bin/uvicorn app.vendor_app:create_app --factory --host 127.0.0.1 --port 8000` in `bnh-backend`, then run `npm run dev -- --host localhost` here. Use the configured individual operator/staff account. There are no default production credentials.

`BACKEND_URL` selects the trusted backend origin (default `http://127.0.0.1:8000`). Both development and production forward `/api/v1` through the same server proxy with HttpOnly session cookies and CSRF. Configure the backend's allowed origin to match the frontend.

## Verification

Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test -- --run`, and `npm run build`.

For real browser verification, keep both repositories as siblings. In the backend, provision the isolated local PostgreSQL database with `.venv/bin/python -m scripts.dev_database` and run `.venv/bin/pytest` to apply and verify migrations. Then run `npm run build` and `npm run test:e2e` here. Install Playwright Chromium or set `CHROME_PATH` to your installed Chrome executable. The runner starts its own backend on 8017 and the built Node application on 4173; those ports must be free. Fixture creation refuses non-loopback/non-test database URLs and uses synthetic accounts only. Results/screenshots and fixture credentials stay ignored in `test-results/`.

Generate the delivered API types with `.venv/bin/python -m scripts.export_openapi` in the backend. The optional `--app app.main` exports the broader unfinished workspace assembly; do not substitute that contract for the delivered feature in a release.

These checks do not establish a Render deployment or real staff acceptance.
