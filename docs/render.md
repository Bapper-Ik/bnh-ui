# Deploy the frontend on Render

Create a **Web Service** from this repository (not a Static Site), select branch **dev** and runtime **Docker**, and use `./Dockerfile` with build context `.`. Leave Docker Command empty. The image builds SvelteKit and runs its Node server on Render's `PORT`. You can also import this repository's `render.yaml`.

Set:

| Variable      | Value                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `BACKEND_URL` | The backend's actual origin, e.g. `https://YOUR-BACKEND.onrender.com`; do not append `/api/v1`. |
| `NODE_ENV`    | `production` (also set in the image).                                                           |

Health check: `/health`.

On the backend, set `ALLOWED_ORIGINS` to a JSON array containing this frontend's exact HTTPS URL with no trailing slash, and `COOKIE_SECURE=true`.

The browser talks to `/api/v1` on the frontend's own domain. The Svelte server forwards those requests to `BACKEND_URL` and returns session cookies unchanged. This keeps login/CSRF handling on one browser origin. Database credentials belong only to the backend.

The sign-in screen is available at `/login`; successful sign-in opens `/vendors`. Screens 1–3 include `/login`, `/forgot-password` and `/recover` (shared reset/activation). Vendors includes search and add/detail/edit drawers. Screen 11 (`/staff`) and screen 12 (`/organisation`) are also delivered; other journeys in the fourteen-screen inventory are unfinished. Configure account email on the backend as described below. To access the workspace, create a real configuration operator using the backend's one-time provisioning command. There are no seeded production passwords or pretend requisitions.

## Local container

```sh
docker build -t custodian-ui .
docker run --rm -p 3000:10000 -e BACKEND_URL=https://YOUR-BACKEND.onrender.com custodian-ui
```

For a complete local HTTP setup, set the backend's allowed origin to `http://localhost:3000`, use `COOKIE_SECURE=false` only locally, and provide a backend address reachable from the UI container.

Both build and runtime stages use Node 24. The final image runs as the non-root node user, contains the built application and production dependencies, and excludes local environment files.

Reference: [Render Docker deployments](https://render.com/docs/docker), [SvelteKit Node deployment](https://svelte.dev/docs/kit/adapter-node).

## Account access

Deploy the matching backend account-access release and let its startup script apply migration 0010. The backend uses one `DATABASE_URL` for migrations and the running application; `MIGRATION_DATABASE_URL` is no longer needed. Development and production each use a different database and backend connection. To send account links, configure backend `MAIL_FROM`, `RESEND_API_KEY`, `ACCOUNT_LINK_SECRET` and `FRONTEND_ORIGIN`, then set `MAIL_ENABLED=true`. See the backend deployment guide for sender verification and secret requirements. No email secrets belong on this frontend service.

Set `FRONTEND_ORIGIN` to this frontend's exact HTTPS origin and include it in backend `ALLOWED_ORIGINS`. With email disabled, the form reports unavailable delivery. Links use a fragment, which the page removes from visible/history state before validation. Passwords and tokens stay out of browser storage. Reset signs out existing sessions; activation grants no automatic authority. The invitation dialog is available on Staff & Access (`/staff`) for users with staff:manage. Create companies and departments on Organisation & Authority (`/organisation`), then assign approved staff memberships and offices on Staff & Access. Both screens require their specific administrative capabilities. No new environment variables or schema migration are needed for screen 12.

Render uses HTTPS. The browser test harness explicitly supplies a trusted loopback proxy protocol header for its local HTTP Node server; do not copy that test-only header configuration into an untrusted public proxy setup.
