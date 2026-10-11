# Custodian Frontend

SvelteKit and TypeScript interface for Brendan Nicholas Holdings' requisition and approval system. Development branch: `dev`. Use Node 24.21.0, pinned in `.nvmrc`, and npm's committed lockfile.

**Start here: [Clone, Set Up and Develop](docs/development.md).** The guide covers both repositories, configuration, first sign-in, the codebase map, tests and the feature delivery workflow. Keep `bnh-ui` beside `bnh-backend`.

## Run Locally

After starting the backend and creating your individual operator account as described in the guide:

```bash
nvm install
nvm use
npm ci
BACKEND_URL=http://127.0.0.1:8000 npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173/login`. Successful sign-in opens the dashboard at `/`. The frontend's `/api/v1` proxy forwards authenticated requests to the configured backend origin; secrets stay on the backend.

## Application Scope

The application uses fourteen reusable screens for sign-in/recovery, dashboard, requisitions, details/signing, assigned tasks, Board resolutions, vendors, staff, organisation, audit and account security. Shared drawers handle notifications, private documents, administration and signatures. Layouts adapt to mobile and desktop; available actions follow backend permissions and request state.

Requesters can persist drafts, attach documents, submit, retract before action, respond to revision requests and download permitted PDFs and approved transfer letters. Administrators configure three-letter department codes and company/department debit accounts; administration alone grants no financial approval authority.

## Documentation

- [Development and onboarding guide](docs/development.md)
- [Render deployment](docs/render.md)
- [Engineering and delivery instructions](AGENTS.md)
- [Fourteen-screen scope](docs/reference/ui_scrrens.md)
- [Feature requirements and tracker](docs/reference/implementation_pan.md)
- [Current integration notes](docs/reference/ui_todos.md)
- [Delivery and verification history](docs/reference/task_done.md)

The development guide lists all lint, formatting, type, unit and connected-browser checks. Browser tests require the sibling backend and isolated local PostgreSQL; they do not use deployed accounts or live provider keys. Deploy this repository as a Node web service using its tracked Dockerfile, not as a static site.
