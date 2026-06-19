# Team Lunch Constitution

Team Lunch is a collaborative lunch-coordination web app: a team starts a timed
poll to pick a menu/restaurant, runs a timed ordering round for the winner, then
tracks order placement and delivery in real time. State stays synced across
browsers via Server-Sent Events (SSE).

- **Primary language**: TypeScript (ESM, `"type": "module"`)
- **Architecture**: Single-package full-stack app — React 18 + Vite client and a
  Fastify backend in one repository (one `package.json`), with shared types.
- **Storage**: PostgreSQL (default) or SQLite (local/test) via Prisma 7 ORM with driver adapters.

## Core Principles

### I. Thin Routes, Service-Owned Logic
Route handlers in `src/server/routes/` MUST stay thin: validate input → call a
service → return the result. All business logic lives in `src/server/services/`.
No domain logic, DB queries, or branching business rules in route files.

### II. Single Prisma Client
Database access MUST go through the Prisma singleton in `src/server/db.ts`.
Never instantiate `PrismaClient` anywhere else. Generated client output
(`src/server/generated/`) is not committed.

### III. Shared Types, No Duplication
Request/response shapes and domain enums live in `src/lib/` and are imported by
both server and client. Do not redefine the same type on each side. Persisted
records MUST store a name/display snapshot alongside any FK or actor reference
(e.g. `menu_name`, `item_name`, `display_name_snapshot`) because source rows or
profile display names can change. User-attributed writes resolve stable identity
from the signed auth session (`actor_key` / `actor_email`); display names are
optional, non-unique labels, not identity.

### IV. Realtime via SSE
After any state change, services broadcast through the SSE manager
(`src/server/sse.ts`, `broadcast(eventName, payload)`); the client subscribes via
`src/client/hooks/useSSE.ts`. New realtime state transitions MUST emit an event —
no silent server-only mutations that the UI cannot observe.

### V. Tests Are Mandatory, No Stubs
Every feature ships its tests in the same change — never a follow-up. No stubs or
placeholders in delivered code. Server logic + routes are tested with Vitest +
Supertest in `tests/server/`; client components/hooks with Vitest +
Testing Library in `tests/client/`. Critical business paths (poll vote/winner/tie,
food-selection duration/session-attributed ordering/overtime, SSE
broadcast/cleanup) MUST stay covered.

## Quality Gates

All of the following MUST pass before commit. Run `pwsh -File ./validate.ps1 all`:

- `pnpm typecheck` — `tsc --noEmit` across server + client + lib
- `pnpm lint` — ESLint (`.ts`/`.tsx`), includes sonarjs rules
- `pnpm architecture` — dependency-cruiser architecture guard
- `pnpm complexity` — ESLint complexity ratchet
- `pnpm function-size` — non-test source function-size cap
- `pnpm duplication` — jscpd, fails over configured copy-paste threshold in `src/`
- `pnpm semgrep` — Semgrep auto ruleset security scan
- `pnpm audit --prod` — production/runtime dependency vulnerabilities
- `pnpm coverage` — Vitest with coverage (server + client projects)

Before push / before merge: `pwsh -File ./validate.ps1 full` (adds Playwright E2E
and pinned Trivy image scan). When changing workflow state or continuity docs,
run `pnpm continuity:update` or `pwsh -File ./validate.ps1 continuity` and commit
the resulting `specs/CURRENT-WORK.md` / `specs/RECONCILIATION.md` if changed.

## Database Rules

- Two Prisma schemas: `prisma/schema.prisma` (Postgres) and
  `prisma/schema.sqlite.prisma` (SQLite). Keep model changes in sync.
- After any schema change, run `pnpm prisma migrate dev` before server tests.
- Applied migration SQL is immutable — never edit an applied migration; force LF
  for `prisma/migrations/**/*.sql`. Use `prisma migrate resolve` to repair history.
- When adding a persisted model used by server tests, extend the cleanup list in
  `tests/server/helpers/db.ts` immediately to avoid cross-test row leakage.
- Poll and food-selection records are retained indefinitely (no auto-deletion) —
  kept for analytics/recommender use.

## Conventions

- **File naming**: PascalCase for React components (`FoodDeliveryView.tsx`);
  camelCase for services, hooks, and utils (`foodSelection.ts`, `useSSE.ts`).
- **Error responses**: `{ error: string }` JSON body with correct status —
  400 validation, 404 not found, 409 conflict.
- **Platform**: Windows-first tooling — port checks and `validate` are PowerShell
  scripts (`scripts/*.ps1`, `validate.ps1`).
- **Branch naming**: not enforced. The repo uses release/mirror branches
  (`main`, `public-main`); there is no `feat/*`/`fix/*` convention to require.
- **Commit style**: descriptive plain-English subjects. Conventional Commits is
  NOT in use and is not required.

## Governance

This constitution reflects conventions already practiced in the codebase and
documented in `AGENTS.md`; `AGENTS.md` remains the operational runbook (task loop,
backpressure commands, discoveries). Where the two overlap, this file states the
durable principle and `AGENTS.md` states the how-to. Spec-kit artifacts under
`specs/` are the planning source of truth.

Amendments require updating this file plus any dependent template, and a note in
the change description. All feature work MUST pass the Quality Gates above before
merge; deviations MUST be justified in the active spec plan's Complexity Tracking
section.

**Version**: 1.1.0 | **Ratified**: 2026-06-03 | **Last Amended**: 2026-06-19
