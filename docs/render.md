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

The sign-in screen is available at `/login`; successful sign-in opens `/vendors`. The current release includes vendor search and add/detail/edit drawers; the remaining fourteen-screen journeys are unfinished. To access the workspace, create a real configuration operator using the backend's one-time provisioning command. There are no seeded production passwords or pretend requisitions.

## Local container

```sh
docker build -t custodian-ui .
docker run --rm -p 3000:10000 -e BACKEND_URL=https://YOUR-BACKEND.onrender.com custodian-ui
```

For a complete local HTTP setup, set the backend's allowed origin to `http://localhost:3000`, use `COOKIE_SECURE=false` only locally, and provide a backend address reachable from the UI container.

Both build and runtime stages use Node 24. The final image runs as the non-root node user, contains the built application and production dependencies, and excludes local environment files.

Reference: [Render Docker deployments](https://render.com/docs/docker), [SvelteKit Node deployment](https://svelte.dev/docs/kit/adapter-node).
