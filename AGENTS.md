## Working Mode

This project uses an interactive Ralph-style workflow via **GitHub Copilot in VS Code** (not Claude Code CLI).

### Task Loop (replaces `loop.sh`)

Each task follows this cycle — Copilot executes steps 1–7, user observes and steers:

1. **Orient** — read `specs/*` relevant to the task
2. **Read plan** — check `IMPLEMENTATION_PLAN.md` for the next highest-priority unchecked item
3. **Investigate** — search `src/` to confirm what exists (don't assume not implemented)
4. **Implement** — complete the task fully (no stubs or placeholders)
5. **Validate** — run `./validate.ps1` (typecheck + lint + duplication + semgrep + test + continuity freshness); fix all failures
6. **Update plan** — mark task `[x]` in `IMPLEMENTATION_PLAN.md`, note any discoveries
7. **Commit** — `git add -A && git commit -m "<description>"`

User can steer between tasks or say "continue" to proceed to the next item.

### Backpressure Commands

```powershell
./validate.ps1              # pre-commit default: typecheck + lint + duplication + semgrep + test + continuity freshness
./validate.ps1 full         # pre-push / before merge: all quality checks + tests + Playwright E2E (skips continuity freshness)
./validate.ps1 continuity   # refresh CURRENT-WORK/RECONCILIATION and fail if they changed
./validate.ps1 quick        # typecheck only (scaffolding phase)
./validate.ps1 test         # tests only
./validate.ps1 e2e          # Playwright E2E only
./validate.ps1 quality      # lint + duplication + semgrep
./validate.ps1 commit       # validate all, then git commit + push
npm run duplication         # jscpd copy-paste detection (src/, 5% threshold)
npm run semgrep             # Semgrep auto ruleset security scan
npm run test:e2e           # Playwright E2E tests (skips in validate when no e2e specs exist)
npm run ports:check         # interactive port blocker check/terminate for 3000 + 5173
npm run ports:check:ci      # non-interactive port blocker report (no termination)
```

### Key Rules

- **One task at a time** — finish and validate before moving on
- **Tests are mandatory** — every feature includes its tests in the same task
- **No stubs** — implement completely; placeholders waste future iterations
- **Update AGENTS.md** — when learning something new about running the project
- **Update IMPLEMENTATION_PLAN.md** — after every task, with discoveries and bugs

### Discoveries

- After any Prisma schema change, run `npx prisma migrate dev` before running server tests; otherwise tests may fail with missing DB column errors even if TypeScript compiles.
- Server tests run against a dedicated Postgres schema (`TEST_DATABASE_SCHEMA`, default `team_lunch_test`) and migrate it automatically in test setup; app data in `public` is preserved unless `TEST_DATABASE_SCHEMA` is set to `public`.
- Server test table cleanup (`deleteMany` via `tests/server/helpers/db.ts`) is now guarded by a setup runtime flag (`SERVER_TEST_RUNTIME=true`), so cleanup cannot run outside server test runtime.
- When adding a new persisted Prisma model used by server tests, extend `tests/server/helpers/db.ts` cleanup immediately; otherwise integration tests can leak rows between cases and fail non-deterministically.
- Local `npm run dev` can fail with `EADDRINUSE :3000` (and client-side Vite proxy `ECONNREFUSED`) if a stale `tsx watch src/server/index.ts` process is still listening; run `npm run ports:check` to terminate blockers before restarting.
- Background DB connectivity monitors should be disabled in test runtime (`NODE_ENV=test`) to avoid long-running/unstable server suites from persistent probe intervals.
- Server DB tests now enforce short DB connect/pool timeouts and cache unavailable-DB preflight failures, so when Postgres is down tests fail fast instead of timing out test-by-test.
- For Prisma migrations that replace an old unique key with a new one, include both `ALTER TABLE ... DROP CONSTRAINT` and `DROP INDEX IF EXISTS` for the legacy key name; some historical schemas may retain the old unique index and still enforce stale uniqueness.
- Prisma migration checksums are based on raw file bytes; changing line endings or editing an already-applied migration file will trigger checksum drift. Keep applied migration SQL immutable, force LF for `prisma/migrations/**/*.sql`, and if a later migration was applied manually use `npx prisma migrate resolve --applied <migration_name>` to repair history instead of resetting immediately.
- For custom URL-prefix deployments, set `VITE_BASE_PATH` (frontend) and `BASE_PATH` (backend) to the same value (for example `/team-lunch`); mismatched values break API/SSE routing.
- Backend startup now fails fast when both `VITE_BASE_PATH` and `BASE_PATH` are set but do not match.
- For custom server ports (for example `PORT=3830`), Vite proxy and `ports:check` now follow env vars (`PORT` and optional `VITE_PORT`) instead of fixed `3000/5173`.
- For local backend testing without Postgres, use `npm run dev:server:sqlite` (or `npm run test:server:sqlite`); this uses `DB_PROVIDER=sqlite` and `prisma/schema.sqlite.prisma`.
- Docker Compose now runs a dedicated `migrate` service (`npx prisma migrate deploy`) before `app`; app startup no longer executes migrations in its container command.
- When Entra SSO is enabled, backend auth routes enforce `ENTRA_TENANT_ID` against returned ID-token claims and sync `team_lunch_nickname` from the Entra username (rename is disabled).
- Dual-auth mode is now backend-driven: users can sign in via local username/password (`/api/auth/local/login`) and/or Entra SSO when corresponding backend env vars are configured.
- Entra redirect/login configuration is backend env-driven: set `APP_PUBLIC_URL` and `BASE_PATH` to derive callback URI automatically (`${APP_PUBLIC_URL}${BASE_PATH}/api/auth/entra/callback`), with optional explicit override via `ENTRA_REDIRECT_URI`.
- In Docker, `VITE_BASE_PATH` is build-time (image build arg) while `BASE_PATH` is runtime; for prefixed deployments set both to the same value and rebuild with `docker compose up --build`.
- For Nginx reverse proxy deployments, keep the app prefix in forwarded URLs (no prefix stripping) and disable proxy buffering for SSE (`/api/events`) to preserve realtime updates.
- Local auth now supports DB-backed email/password users with admin-managed credential generation via `POST /api/auth/local/users/generate` guarded by authenticated admin session role.
- Admins can now promote/demote approved users via `POST /api/auth/users/promote` and `POST /api/auth/users/demote`; role state persists in `auth_access_users.is_admin` while `AUTH_ADMIN_EMAIL` remains an undeletable/demotion-protected bootstrap admin.
- If `AUTH_ADMIN_EMAIL` is set, approval workflow is enabled: non-admin users stay blocked in a waiting screen until the admin approves them (persisted in `auth_access_users`).
- Local-auth env bootstrap credentials were removed; local accounts are now only DB-managed by admin and Docker port mapping now uses a single `PORT` variable.
- `npm run prisma:generate:sqlite` writes generated client code to `src/server/generated/sqlite-client`; do not commit this output and remove it before lint/duplication runs if it was generated locally.
- If a new phase view reuses large markup from another view, `npm run duplication` can exceed the 5% jscpd threshold; extract shared UI components early to keep duplication below the gate.
- Do not delete migration directories that were already applied in your dev DB; Prisma will report drift/divergence (`P3015`) if a recorded migration folder is missing locally.
- On Windows, `npx prisma generate` may fail with `EPERM ... query_engine-windows.dll.node` if the engine file is locked by a running process; use `npx prisma generate --no-engine` to refresh client types while keeping local services running.
- Running server tests with a Prisma client generated via `--no-engine` can fail with datasource validation expecting `prisma://`; regenerate with `npx prisma generate` (engine-enabled) before `npm test`/`./validate.ps1`.
- Food-selection no-order reminders for voters are scheduled from `FOOD_SELECTION_REMINDER_MINUTES_BEFORE` (default `5`) and only target vote nicknames that are valid email addresses.
- Microsoft Graph mail delivery now reuses the Entra app registration (`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`) and requires `GRAPH_MAIL_SENDER`; if Graph mail is not configured, approval/poll/reminder notifications are skipped without failing core flows.
- Real Graph-mail smoke delivery is test-gated by `GRAPH_MAIL_TEST_RECIPIENT`; when unset, `tests/server/notification-email.test.ts` does not send any real mail.
- During server test runtime, real Graph delivery is suppressed for all recipients except the explicit `GRAPH_MAIL_TEST_RECIPIENT` smoke-test target, so normal tests never fan out real emails.
- `validate.ps1` should run native commands directly; piping npm/vitest stderr through PowerShell (`2>&1 | Out-String`) can surface warning output as `NativeCommandError` and falsely fail validation even when `npm test` exits `0`.
- `validate.ps1` now buffers stdout/stderr per step and only prints the full command log when that step fails; successful steps stay concise with `[OK]` summaries.
- `validate.ps1 all` now treats continuity freshness as commit-time validation, while `validate.ps1 full` skips continuity freshness and is intended for pre-push / before-merge validation.
- Continuity snapshots are generated by `npm run continuity:update` into `specs/CURRENT-WORK.md` and `specs/RECONCILIATION.md`; commit those files whenever the continuity check reports drift.
- Repo hooks now live in `.githooks`; run `git config core.hooksPath .githooks` after clone so pre-commit runs `./validate.ps1 all` and pre-push runs `./validate.ps1 full`.
- Semgrep uses the locally installed `semgrep` CLI (`npm run semgrep`); install it on dev machines before relying on `./validate.ps1 quality`, `all`, or `full`.
- `validate.ps1` now runs `npm audit --omit=dev`, so the dependency gate tracks production/runtime vulnerabilities without failing on dev-only tooling advisories such as `sharp-cli`.
- Running `npm audit fix --omit=dev` can prune dev dependencies from local `node_modules`; run `npm install` afterward before `npm run lint`/`npm test` to restore full tooling.
- Server test setup must load `.env` before rewriting `DATABASE_URL` to the test schema; otherwise runtime env loading in app code can make tests hit the wrong schema.
- If host port `5433` is already occupied, set `DB_PORT` and update `DATABASE_URL` to match (for example `55433`); Docker Compose now maps Postgres via `${DB_PORT}:5432`.
- Docker Compose now pins `postgres:18-alpine`; because the official PostgreSQL 18 image uses the newer `/var/lib/postgresql` volume layout, keep the named volume mounted at `/var/lib/postgresql` and set `PGDATA=/var/lib/postgresql/data/pgdata` to preserve durable data initialization.
- Poll and food-selection retention have been removed: records are kept indefinitely for analytics/recommender use.

---

## Project Layout

```
team-lunch/
├── src/
│   ├── server/          # Fastify backend (Node.js + TypeScript)
│   │   ├── routes/      # Route handlers (thin — delegate to services)
│   │   ├── services/    # All business logic lives here
│   │   ├── sse.ts       # SSE manager: broadcast(event, payload)
│   │   ├── db.ts        # Prisma client singleton
│   │   └── index.ts     # Server entry point
│   ├── client/          # React 18 + Vite + TypeScript frontend
│   │   ├── components/
│   │   ├── hooks/       # SSE subscription, phase state
│   │   ├── pages/
│   │   └── main.tsx
│   └── lib/             # Shared TypeScript types (used by both sides)
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── server/          # Vitest unit + integration (supertest) tests
│   └── client/          # Vitest + @testing-library/react tests
├── Dockerfile
├── docker-compose.yml
├── vite.config.ts
└── package.json         # Single package.json for the whole monorepo
```

## Build & Run

```bash
npm install                        # install all dependencies
npx prisma generate                # regenerate Prisma client after schema changes
npx prisma migrate dev             # apply pending DB migrations (dev only)
npm run dev:server                 # start backend with hot-reload (tsx watch)
npm run dev:client                 # start Vite dev server for frontend
npm run build                      # production build (tsc + vite build → dist/)
npm start                          # run production server (serves static client from dist/)
docker compose up --build          # full stack in Docker (preferred for production)
```

## Validation

Run ALL of these after any implementation. Fix every failure before committing.

```bash
npm run typecheck      # tsc --noEmit across server + client + lib
npm run lint           # ESLint for .ts and .tsx files
npm test               # vitest run — all tests
npm run test:server    # vitest run --project server (unit + integration)
npm run test:client    # vitest run --project client (component + hook tests)
```

Full one-liner (same as CI):
```bash
npm run validate       # typecheck && lint && npm test
```

## Test Coverage Requirements

Write tests for ALL of the following — these are the critical business logic paths:

**Poll service (`src/server/services/poll.ts`)**
- Vote counting per menu returns correct totals
- Winner determination: single highest vote count → `status=finished`
- Tie detection: two or more menus share top count → `status=tied`
- Random winner selection picks only from tied top candidates
- Duration validation: only multiples of 5 between 5–720 minutes are accepted
- Single active poll enforcement: creating a poll while one is `active` or `tied` throws HTTP 409
- Tie extension: sets `ends_at = now + extension` and returns `status=active`
- Poll persistence rule: finished/aborted polls are retained (no automatic poll deletion)

**Food selection service (`src/server/services/foodSelection.ts`)**
- Duration validation: only 10, 15, or 30 minutes are accepted
- One order per nickname: second submission from same nickname replaces the first
- No order changes accepted once `status=overtime`
- Extension sets `ends_at = now + extension`, returns `status=active`
- Food-selection persistence rule: completed food selections are retained (no automatic deletion)

**API routes (integration tests via supertest)**
- `POST /api/polls` — rejects with 409 if active poll exists
- `POST /api/polls/:id/votes` — rejects after timer expiry
- `POST /api/polls/:id/extend` — rejects if poll is not `tied`
- `POST /api/food-selections` — rejects if no finished poll
- `POST /api/food-selections/:id/orders` — rejects after timer expiry

**SSE manager (`src/server/sse.ts`)**
- `broadcast` delivers named event + JSON payload to all registered responses
- Disconnected clients are removed from the registry

**Client hooks**
- `useAppPhase` correctly derives phase enum from `initial_state` payload
- Nickname is read from `team_lunch_nickname` localStorage key

## Codebase Patterns

- **DB access**: always via the Prisma singleton in `src/server/db.ts` — never instantiate `PrismaClient` elsewhere
- **Business logic**: lives in `src/server/services/` — route handlers must stay thin (validate input → call service → return result)
- **SSE**: call `broadcast(eventName, payload)` from services after any state change; see `realtime-events.md` for the full event catalogue
- **Name snapshots**: when persisting a poll vote, food order, etc., always store the name string alongside the FK (e.g. `menu_name`, `item_name`) — FKs can become null if the source is deleted
- **Nickname**: never stored as a user entity; passed by the client in request bodies and stored as a plain `VARCHAR` on domain records
- **localStorage key**: `team_lunch_nickname`
- **Shared types**: define request/response shapes and domain enums in `src/lib/` and import from both server and client — no type duplication
- **Error responses**: `{ error: string }` JSON body with appropriate HTTP status codes (400 validation, 409 conflict, 404 not found)
