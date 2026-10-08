# Custodian frontend instructions

## Scope and source of truth

Build the staff-facing application for **Custodian by Brendan**, BNH's requisitions and Delegation of Authority system. Implementation is underway. These conventions replace missing-scaffold references; inspect code and verification before treating any feature as complete.

Read `../docs/implementation_pan.md` for detailed requirements and feature IDs, `../docs/recap.md` for approval rules, and `../docs/features.md` for the scope summary. Images `../docs/1.jpeg` through `4.jpeg` supply form fields, not the approval route. `5.jpeg` is the visual standard and `6.jpeg` is the delivery brief. Read `../bnh-backend/AGENTS.md` when changing shared API contracts.

The user's latest decisions take precedence. This file establishes frontend engineering conventions in place of obsolete scaffold/Git assumptions in the specification. The detailed specification remains the canonical tracker. Do not create another status table or infer new financial policy.

## Release scope: fourteen screens

The latest user scope is `../docs/ui_scrrens.md` (the supplied filename has a typo). It is authoritative for release surfaces and supported functionality. In standalone clones use `docs/reference/ui_scrrens.md`. Build exactly these reusable screen templates:

1. Sign In
2. Forgot Password
3. Set Password / Activate Account
4. Dashboard
5. Requisitions
6. Create / Edit Requisition
7. Requisition Details & Review
8. My Tasks / Approval Inbox
9. Board Resolution Workspace
10. Vendors
11. Staff & Access Management
12. Organisation & Authority
13. Audit Log
14. My Account & Security

Use drawers/dialogs for vendor details and edits, invitations, appointments, department edits, and signing; a header drawer for notifications; and a viewer for attachments/generated documents. Reuse screens across roles and request states. No extra applications, screens, workflow builder, contracts, scoring, payments, or unrelated backend modules.

Implement backend capabilities only where they support these screens, their dialogs/viewers, or necessary security, persistence and deployment. Older requirements explain fields and business rules within this boundary; they do not expand it. Preserve the fixed authority rules and Secretary/Chairman separation. Map work to these screen numbers in the existing tracker. Existing backend completion does not imply screen completion. Continue the one-feature test → commit → push gate on `dev`; finish each connected screen journey before moving on.

## Mandatory feature delivery gate

The project owner's latest instruction is authoritative: implement **one feature at a time**, finish it fully, pass all required tests, then **commit and push before starting the next feature**. This replaces earlier guidance that treated publishing as optional. Routine commits and pushes to the configured project remotes are authorised; do not repeatedly ask permission to proceed.

1. **Select and assess.** Use the stable feature IDs and dependency order in `../docs/implementation_pan.md`. Select the next incomplete journey within the fourteen-screen scope and its necessary prerequisites; do not advance unrelated legacy-spec features. Read its complete deliverables and acceptance criteria, inspect existing code in both repositories, and record the actual gaps. Announce the current feature and what will establish completion.
2. **Implement the whole feature.** Complete its required backend, frontend, migrations, permissions, audit events, configuration, and error handling as applicable. Keep work within that feature and its necessary prerequisites. A feature is not complete merely because an endpoint, screen, or happy path exists.
3. **Verify.** Run all configured repository checks and the feature's required unit, integration, security, concurrency, and browser checks as applicable. Exercise the connected frontend/backend when the feature has a user journey. Fix failures and rerun affected checks. Skipped tests, missing services, untested acceptance criteria, and screenshots alone do not satisfy the gate.
4. **Document and review.** Update the existing feature block in the canonical tracker, `../docs/ui_todos.md`, and `../docs/task_done.md` with actual behaviour, commands/results, remaining limitations, and release implications. Inspect the exact changes to be committed; exclude secrets, local state, test artifacts, and unrelated unfinished work. Do not mark a feature Implemented while required deliverables or acceptance criteria remain incomplete.
5. **Commit and push.** Create a focused commit whose message includes the feature ID in every affected repository, then push to its configured remote and intended branch. Use the owner-requested `dev` branch for development and push to `origin/dev`. Do not merge into `master`/`main` automatically, force-push, or rewrite history. Verify the push succeeded and the remote branch contains the intended commit. Both repositories must pass this gate for a feature that spans them; an unaffected repository needs no empty commit.
6. **Close and advance.** Report the completed feature, verification results, and commit/remote references. Only then begin the next feature. A failed check, incomplete acceptance criterion, failed commit, or failed push leaves the current feature open. Diagnose and fix it; if external input or access is required, report the exact blocker without starting another feature or weakening the gate.

### Existing work and interruptions

- Preserve all existing partial implementation and user changes. Audit it against the feature criteria; do not delete or rebuild working code to create an artificial clean start.
- Several features may already have partial code. That does not authorise continuing them in parallel or labelling a broad initial commit as multiple completed features. Isolate the current feature's deliverable and necessary dependencies; leave unrelated work unstaged.
- Do not commit a broken or incomplete snapshot as a completed feature to satisfy the push requirement. If a clean, self-contained feature commit cannot be made from the existing work, explain the concrete dependency and resolve it within the current gate.
- A user-requested interruption changes the active work as directed. Preserve the unfinished feature's status and resume it before selecting a new feature, unless the user explicitly changes the order or scope.
- Deployment, independent recovery verification, and genuine staff acceptance retain their own criteria. Do not substitute local tests, fabricated records, or developer signatures for external acceptance.

## Stack and organisation

- Use Svelte with SvelteKit, strict TypeScript, and Vite. Use SvelteKit routing/data loading, native form controls, and Zod for client input validation. Prefer built-in Svelte reactivity; add a state or form library only for a demonstrated need. FastAPI owns authentication, business rules, and persistence; SvelteKit server code is only a thin integration layer when needed.
- Use npm and one committed `package-lock.json`; use `npm ci` after initial dependency resolution. Pin a supported Node LTS in `.nvmrc` and `package.json` during setup. Do not assume Node is installed.
- Use semantic HTML, Svelte component-scoped CSS, and shared CSS custom properties. Keep the interface minimal: clear hierarchy, restrained spacing, simple tables/forms, and purposeful controls. Add accessible primitives where needed; do not install a large UI kit or a second styling system by default.
- Use `src/routes/` for SvelteKit pages/layouts and route-specific loaders, `src/lib/features/<domain>/` for reusable feature components, `src/lib/components/ui/` for shared primitives, `src/lib/api/` for the client/generated types, and `src/lib/styles/` for tokens. Keep server-only integration code under `src/lib/server/`. Keep request/user state scoped to the request or component tree, never a shared mutable server singleton.
- Extract shared code when there is real reuse. Do not scaffold operational future-module screens or duplicate request details for every role.
- Generate and commit API types from backend OpenAPI; document regeneration. Do not hand-edit generated types or keep incompatible handwritten copies. Centralise network, session, and error handling.
- Use ESLint and Prettier with Svelte support, svelte-check for component/TypeScript checks, Vitest with Svelte component testing, and Playwright for browser journeys. Establish `dev`, `build`, `lint`, `format:check`, `typecheck`, `test`, and `test:e2e` scripts during setup; these are requirements, not existing tools. Base structure and test setup on the official [SvelteKit project guidance](https://svelte.dev/docs/kit/project-structure) and [Svelte testing guidance](https://svelte.dev/docs/svelte/testing).

## Visual and interaction standard

Define named tokens centrally:

| Purpose                                  | Colour    |
| ---------------------------------------- | --------- |
| Primary headings                         | `#000000` |
| Main interface text / secondary headings | `#1A1A1A` |
| Body text                                | `#595959` |
| Light / secondary metadata               | `#8C8C8C` |
| Borders and dividers                     | `#D9D9D9` |
| Subtle surfaces                          | `#F2F2F2` |
| Background                               | `#FFFFFF` |

- Use one clean sans-serif family, initially a system sans-serif stack, with at most two normal-use weights (400 and 600). No decorative letter spacing.
- Red/amber/green indicate functional status only and always have a label or icon. Navigation, action buttons, charts, and branding remain greyscale; Approve/Reject buttons are not exceptions.
- Check contrast. Light metadata colour is not automatically suitable for small text on white. Use a readable supplied dark token and record adjustments for visual-policy review; do not claim exceptions were approved.
- Provide visible focus, real labels, keyboard-operable forms/dialogs, accessible errors, and announced asynchronous states. Never rely on colour, position, or a signature canvas alone.
- Support desktop and narrow screens without clipping totals or hiding actions. Adapt cost tables appropriately.
- Provide loading, empty, error, forbidden, and stale/conflict states. Preserve unsaved edits where safe; never silently overwrite another revision.
- PDFs follow the separate A4/type rules in the specification. Browser typography does not replace document typography. Use authorised backend exports; never fabricate approval evidence in client-generated PDFs.

## Screens and behaviour

Deliver sign-in/recovery, restricted administration, a scoped dashboard, vendor capture, draft requisitions, review/signing, history, approval inboxes, Secretary/Chairman workspaces, notifications, and exports.

- Capture vendor/contact/bank information, scope/dates, payment terms, warranty, cost lines, attachments, and declarations. Follow stage-specific requiredness. Blank sample fields do not establish mandatory values. Bank details can be explicitly unknown; captured data is not automatically verified.
- Use authenticated server records for requester, department, entity eligibility, and available actions. No free-text authority settings or production role switcher. Administration does not imply approval authority.
- Route directly by amount and requester position. Ordinary staff route to their own HOD through ₦5m, Chief of Staff above ₦5m through ₦100m, MD above ₦100m through ₦500m, and Board above ₦500m. HOD requests have a Chief of Staff minimum, Chief of Staff requests an MD minimum, and every MD request goes to Board. Upper boundaries are inclusive.
- Display server-assigned authority and explanations. Do not implement an independent client policy engine; hiding buttons is never authorisation.
- Individual approvers approve, reject, or return with the required reason and signing ceremony. They cannot edit request amounts/vendors.
- Submitted content is read-only. Returned requests need a successor revision, fresh signing, and recalculated routing. Preserve earlier versions/decisions in history.
- Secretary recording and Chairman confirmation are separate responsibilities. Uploading a resolution is not approval. Confirmation must show the actual Board outcome, including rejection, deferment, and conditions.
- Distinguish return-to-Secretary from return-to-requester. Keep unresolved conditional holds visible.
- Show missing/conflicted assignments clearly, with no substitute selector or bypass. Offer no self-approval action.
- Approved means authorised, not paid. No legacy Accounts/CAO/Finance steps, payment status, Board voting, or misleading operational future-module placeholders.

## API integration, money, and signing

- Server responses determine totals, lifecycle, permissions, and next actions. Monetary values are decimal strings; account numbers remain strings. Use decimal arithmetic for previews, never JS Number arithmetic for totals or authority boundaries. Preserve server precision when formatting NGN and show Africa/Lagos timestamp context.
- Use same-origin `/api/v1` with an explicit dev proxy and production routing to FastAPI. Consume HttpOnly-cookie sessions; never store authentication/recovery secrets in localStorage. Follow backend CSRF and fresh-authentication contracts. If a SvelteKit server loader/action calls FastAPI, forward only the required session/CSRF context to the configured trusted backend and return only authorised data. Never expose server secrets or raw session tokens in page data.
- Send expected versions and idempotency keys for relevant mutations. Reuse keys for retries of identical intent, not changed content. Disable duplicate clicks while relying on backend enforcement.
- Signing displays the exact agreement, requires fresh authentication and explicit consent, and captures the configured representation against the server challenge/revision. Never pre-apply a saved signature or sign on page load. A canvas alone does not prove identity.
- Provide keyboard-accessible signature controls. Typed-only alternatives require the backend's approved setting; never silently substitute one. Record remaining accessibility limitations.
- Use private file APIs with progress and validation feedback. Uploaded evidence is not ready for submission until the server confirms basic validation and private storage. The owner explicitly deferred document malware scanning for this release (2026-10-08): do not add scanner setup or scanning progress gates, and never label files scanned, virus-checked or malware-free. Scanning is not performed; file type/size/content checks remain required.
- Respect evidence-level permissions. Request visibility does not imply access to all Board attachments/bank data. Do not persist restricted evidence in browser storage or render untrusted HTML from descriptions.
- Clear user-scoped caches on logout/account change and respond to revocation. Do not log credentials, bank details, signatures, or signed download URLs.
- Keep fixtures/mocks in tests or explicit isolated development mode. Never fall back to fake production success after an API failure.

## Delivery and verification

- Coordinate contract changes with backend schemas, generated types, and `../docs/ui_todos.md`. Record verification in `../docs/task_done.md` and the relevant existing feature block in `../docs/implementation_pan.md`. Create evidence files when there is work to record.
- Follow the mandatory feature delivery gate above. Verify the configured Git remote and branch; preserve unrelated changes. Never invent a successful build, deployment, commit, push, or human sign-off.
- Test meaningful behaviour: cost forms, validation, revision conflicts, permission-driven actions, signing, and Board outcome wording. Do not test merely to restate static markup/tokens.
- Use Playwright against a real test backend with distinct synthetic requester, approver, Secretary, and Chairman identities. Cover login, return/resubmission, stale/denied actions, and Board confirmation/correction. Mocked tests do not replace integration journeys.
- Inspect desktop/narrow layouts, keyboard navigation, readable errors, status labels, and private-data visibility. Do not copy personal/bank data from the supplied form into fixtures or screenshots.
- Once configured, run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test -- --run`, and `npm run build`. Run relevant `npm run test:e2e` journeys against documented services. Missing services/skipped tests are not passes.
- UI completion requires usable persisted journeys, not screenshots or mocks. Deployment and three genuine BNH staff requisitions remain separate verifications; never perform staff signatures for them.
