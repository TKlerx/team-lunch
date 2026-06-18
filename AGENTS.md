## Working Mode

This project uses an interactive Ralph-style workflow via **AI agent in VS Code** (not CLI).

### Task Loop

Each task follows this cycle — AI agent execute steps 1–7, user observes and steers:

1. **Orient** — read `specs/*` relevant to the task
2. **Read plan** — check `IMPLEMENTATION_PLAN.md` for the next highest-priority unchecked item
3. **Investigate** — search `src/` to confirm what exists (don't assume not implemented)
4. **Implement** — complete the task fully (no stubs or placeholders) including tests in `tests/`
5. **Validate** — run `./validate.ps1` (typecheck + lint + architecture + complexity + function-size + duplication + semgrep + test); fix all failures before shipping
6. **Update plan** — mark task `[x]` in `IMPLEMENTATION_PLAN.md`, note any discoveries
7. **Commit** — `git add -A && git commit -m "<description>"`

User can steer between tasks or say "continue" to proceed to the next item.

### Backpressure Commands

```powershell
./validate.ps1              # local/CI quality gate: typecheck + lint + architecture + complexity + function-size + duplication + semgrep + audit + test
./validate.ps1 precommit    # pre-commit default: typecheck + lint + architecture + complexity + function-size + duplication
./validate.ps1 full         # pre-push / before merge: all quality checks + tests + pinned Trivy image scan + Playwright E2E
./validate.ps1 continuity   # optional: refresh CURRENT-WORK/RECONCILIATION and fail if they changed
./validate.ps1 quick        # typecheck only (scaffolding phase)
./validate.ps1 test         # tests only
./validate.ps1 e2e          # Playwright E2E only
./validate.ps1 quality      # lint + architecture + complexity + function-size + duplication + semgrep
./validate.ps1 commit       # validate all, then git commit + push
pnpm duplication            # jscpd copy-paste detection (src/, 5% threshold; QUALITY_THRESHOLDS_BYPASS=1 makes threshold advisory)
pnpm architecture           # dependency-cruiser architecture check; currently guards against circular runtime dependencies
pnpm complexity             # ESLint complexity ratchet; fails if complexity warning counts/worst metrics exceed complexity-baseline.json
pnpm complexity:update      # intentionally lower/update complexity-baseline.json after refactors improve the baseline
pnpm function-size          # hard non-test source function cap: 300 lines, with current oversized functions allowlisted at their existing size
pnpm format:check           # Prettier check with repo/tooling ignores; not part of validate until the formatting baseline is clean
pnpm semgrep                # Semgrep auto ruleset security scan
pnpm test:e2e               # Playwright E2E tests (skips in validate when no e2e specs exist)
pnpm db:test:up             # start the dedicated test Postgres (db-test) for server/e2e tests
pnpm ports:check            # interactive port blocker check/terminate for 3000 + 5173
pnpm ports:check:ci         # non-interactive port blocker report (no termination)
```

### Key Rules

- **One task at a time** — finish and validate before moving on
- **Tests are mandatory** — every feature includes its tests in the same task
- **No stubs** — implement completely; placeholders waste future iterations
- **Update AGENTS.md** — when learning something new about running the project
- **Update IMPLEMENTATION_PLAN.md** — after every task, with discoveries and bugs

### Discoveries

- Docker images use Node.js 24 LTS (`node:24-alpine`); keep local tooling on Node 24 where possible, or at least Node 20+ when not using Docker.
- After any Prisma schema change, run `npx prisma migrate dev` before running server tests; otherwise tests may fail with missing DB column errors even if TypeScript compiles.
- Server tests run against a dedicated Postgres schema (`TEST_DATABASE_SCHEMA`, default `team_lunch_test`) and migrate it automatically in test setup; app data in `public` is preserved unless `TEST_DATABASE_SCHEMA` is set to `public`.
- Server test table cleanup (`deleteMany` via `tests/server/helpers/db.ts`) is now guarded by a setup runtime flag (`SERVER_TEST_RUNTIME=true`), so cleanup cannot run outside server test runtime.
- When adding a new persisted Prisma model used by server tests, extend `tests/server/helpers/db.ts` cleanup immediately; otherwise integration tests can leak rows between cases and fail non-deterministically.
- Local `npm run dev` can fail with `EADDRINUSE :3000` (and client-side Vite proxy `ECONNREFUSED`) if a stale `tsx watch src/server/index.ts` process is still listening; run `npm run ports:check` to terminate blockers before restarting.
- `validate.ps1 all` refuses to fall back to a Prisma client without the query engine; stop the live `tsx watch src/server/index.ts` process if Windows reports the query-engine DLL is locked.
- Background DB connectivity monitors should be disabled in test runtime (`NODE_ENV=test`) to avoid long-running/unstable server suites from persistent probe intervals.
- Server DB tests now enforce short DB connect/pool timeouts and cache unavailable-DB preflight failures, so when Postgres is down tests fail fast instead of timing out test-by-test.
- For Prisma migrations that replace an old unique key with a new one, include both `ALTER TABLE ... DROP CONSTRAINT` and `DROP INDEX IF EXISTS` for the legacy key name; some historical schemas may retain the old unique index and still enforce stale uniqueness.
- Prisma migration checksums are based on raw file bytes; changing line endings or editing an already-applied migration file will trigger checksum drift. Keep applied migration SQL immutable, force LF for `prisma/migrations/**/*.sql`, and if a later migration was applied manually use `npx prisma migrate resolve --applied <migration_name>` to repair history instead of resetting immediately.
- For custom URL-prefix deployments, set `VITE_BASE_PATH` (frontend) and `BASE_PATH` (backend) to the same value (for example `/team-lunch`); mismatched values break API/SSE routing.
- Backend startup now fails fast when both `VITE_BASE_PATH` and `BASE_PATH` are set but do not match.
- For custom server ports (for example `PORT=3830`), Vite proxy and `ports:check` now follow env vars (`PORT` and optional `VITE_PORT`) instead of fixed `3000/5173`.
- For local backend testing without Postgres, use `npm run dev:server:sqlite` (or `npm run test:server:sqlite`); this uses `DB_PROVIDER=sqlite` and `prisma/schema.sqlite.prisma`.
- Docker Compose now runs a dedicated `migrate` service (`pnpm exec prisma migrate deploy`) before `app`; app startup no longer executes migrations in its container command.
- When Entra SSO is enabled, backend auth routes enforce `ENTRA_TENANT_ID` against returned ID-token claims and sync the Entra `name` claim into the account display-name cache; nickname/localStorage identity is retired.
- Dual-auth mode is now backend-driven: users can sign in via local username/password (`/api/auth/local/login`) and/or Entra SSO when corresponding backend env vars are configured; without any configured auth method, the app shows an auth setup error instead of open access.
- Entra redirect/login configuration is backend env-driven: set `APP_PUBLIC_URL` and `BASE_PATH` to derive callback URI automatically (`${APP_PUBLIC_URL}${BASE_PATH}/api/auth/entra/callback`), with optional explicit override via `ENTRA_REDIRECT_URI`.
- In Docker, `VITE_BASE_PATH` is build-time (image build arg) while `BASE_PATH` is runtime; for prefixed deployments set both to the same value and rebuild with `docker compose up --build`.
- For Nginx reverse proxy deployments, keep the app prefix in forwarded URLs (no prefix stripping) and disable proxy buffering for SSE (`/api/events`) to preserve realtime updates.
- Local auth now supports DB-backed email/password users with admin-managed credential generation via `POST /api/auth/local/users/generate` guarded by authenticated admin session role.
- Authenticated user-attributed routes now ignore request-body nickname compatibility fields and require a signed session; local-session cookies are rejected once the matching `local_auth_users` row is edited away or deleted.
- Auth-session cookies include `sessionVersion`, checked against `auth_access_users.session_version`; sensitive access/account mutations increment it and stale protected requests return `401 Session expired`, while display-name edits do not force logout.
- Auth/profile history is stored in `auth_audit_logs` for profile create/edit/delete, access changes, and local/Entra login success/failure; it is DB-only for now and has no admin UI.
- Entra profile photos are served only through the backend `/api/auth/me/avatar` endpoint; Graph URLs/tokens stay server-side, avatar bytes are cached only in bounded per-instance memory with TTLs, and clients must fall back to initials/generic UI on `204` or image load failure.
- Admins can edit/delete manually created local accounts in Administration; email edits/deletes broadcast `auth_session_revoked` over SSE for connected browsers and preserve historical vote/order display snapshots.
- Admins can now promote/demote approved users via `POST /api/auth/users/promote` and `POST /api/auth/users/demote`; role state persists in `auth_access_users.is_admin` while `AUTH_ADMIN_EMAIL` remains an undeletable/demotion-protected bootstrap admin.
- If `AUTH_ADMIN_EMAIL` is set, approval workflow is enabled: non-admin users stay blocked in a waiting screen until the admin approves them (persisted in `auth_access_users`).
- Local-auth env bootstrap credentials were removed; local accounts are now only DB-managed by admin and Docker port mapping now uses a single `PORT` variable.
- `npm run prisma:generate:sqlite` writes generated client code to `src/server/generated/sqlite-client`; do not commit this output and remove it before lint/duplication runs if it was generated locally.
- If a new phase view reuses large markup from another view, `npm run duplication` can exceed the 5% jscpd threshold; extract shared UI components early to keep duplication below the gate.
- `pnpm complexity` is now a validation gate that ratchets ESLint complexity warnings via `complexity-baseline.json`; reduce complexity where practical, then run `pnpm complexity:update` to lower the baseline intentionally.
- `pnpm function-size` blocks any non-test source function above 300 lines unless it is in `function-size-allowlist.json`; allowlisted functions are capped at their current size and should be removed from the list once refactored below 300.
- Complexity and duplication follow the template quality-threshold convention: `QUALITY_THRESHOLDS_BYPASS=1` makes threshold failures advisory, but lint correctness, tests, and security checks still block.
- `pnpm architecture` runs dependency-cruiser with `.dependency-cruiser.cjs`; keep circular runtime dependencies out of `src/`.
- `@wlearn/xlearn` 0.2.0 is available for the recommendation-model spike; import it as a CommonJS default/dynamic import, use `XLearnFM.create({ task: 'classification', ... })`, and always call `.dispose()` after tests or benchmarks because the WASM heap is not GC-managed.
- Learned-safe recommendations now derive `taste_match` copy from model feature contributions, not opaque model internals, and the AI overlay still reuses the same shared fallback path.
- Learned recommender server tests rely on a shared model cache; `tests/server/helpers/db.ts` now clears that cache during cleanup so model-id lookups do not go stale after DB resets.
- User Story 5 coverage now keys learned scoring, marks, and repeat-history checks on `item_identity_key`, which lets re-imported menu items keep their learned signal across renamed records.
- Allergy handling is a post-score filter: cold-start normalization happens first, then allergies are hard-excluded and dislikes are demoted on every recommendation path.
- Settings now offers canonical ingredient quick-picks plus free-text fallback; the saved payload still uses the existing `updateUserPreferences` API contract.
- Prettier config and ignores are present, but `pnpm format:check` is intentionally not part of `validate.ps1` until the existing formatting baseline is cleaned up.
- Do not delete migration directories that were already applied in your dev DB; Prisma will report drift/divergence (`P3015`) if a recorded migration folder is missing locally.
- On Windows, `npx prisma generate` may fail with `EPERM ... query_engine-windows.dll.node` if the engine file is locked by a running process; stop the locking process and regenerate normally before tests/builds. Use `PRISMA_GENERATE_ALLOW_NO_ENGINE=1 node ./scripts/prisma-generate-safe.mjs` only for type-only refreshes, then run `pnpm exec prisma generate` before server tests.
- Running server tests with a Prisma client generated via `--no-engine` fails with datasource validation expecting `prisma://`; regenerate with `pnpm exec prisma generate` (engine-enabled) before `pnpm test`/`./validate.ps1`.
- Food-selection no-order reminders for voters are scheduled from `FOOD_SELECTION_REMINDER_MINUTES_BEFORE` (default `5`) and only target vote nicknames that are valid email addresses.
- Microsoft Graph mail delivery now reuses the Entra app registration (`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`) and requires `GRAPH_MAIL_SENDER`; if Graph mail is not configured, approval/poll/reminder notifications are skipped without failing core flows.
- Real Graph-mail smoke delivery is test-gated by `GRAPH_MAIL_TEST_RECIPIENT`; when unset, `tests/server/notification-email.test.ts` does not send any real mail.
- During server test runtime, real Graph delivery is suppressed for all recipients except the explicit `GRAPH_MAIL_TEST_RECIPIENT` smoke-test target, so normal tests never fan out real emails.
- `validate.ps1` should run native commands directly; piping npm/vitest stderr through PowerShell (`2>&1 | Out-String`) can surface warning output as `NativeCommandError` and falsely fail validation even when `npm test` exits `0`.
- `validate.ps1` now buffers stdout/stderr per step and only prints the full command log when that step fails; successful steps stay concise with `[OK]` summaries.
- `validate.ps1 precommit` is the commit-time fast gate (`typecheck`, `lint`, architecture, complexity, function-size, duplication); `validate.ps1 all` remains the local/CI quality gate with tests/security, and continuity is still explicit/manual.
- Continuity snapshots are generated by `npm run continuity:update` into `specs/CURRENT-WORK.md` and `specs/RECONCILIATION.md`; use `./validate.ps1 continuity` only when you intentionally want to refresh/review those files.
- Repo hooks now live in `.githooks`; run `git config core.hooksPath .githooks` after clone so pre-commit runs `./validate.ps1 precommit` and pre-push runs `./validate.ps1 full`.
- Semgrep runs from a project-local Python venv (`.venv/Scripts/semgrep`); run `./setup.ps1` to create the venv and install semgrep alongside npm dependencies.
- `validate.ps1` now runs `npm audit --omit=dev`, so the dependency gate tracks production/runtime vulnerabilities without failing on dev-only tooling advisories such as `sharp-cli`.
- `validate.ps1 full` builds `team-lunch:trivy-scan` and scans it with the official Trivy Docker image pinned by digest (`aquasec/trivy@sha256:016eae51fdcf989332a5404af7e8f625cd5d95d7c0907a221d080a996f556500`, Trivy `0.71.0` manifest list). Use `TRIVY_IMAGE` only for deliberate scanner updates.
- Running `npm audit fix --omit=dev` can prune dev dependencies from local `node_modules`; run `npm install` afterward before `npm run lint`/`npm test` to restore full tooling.
- Server test setup must load `.env` before rewriting `DATABASE_URL` to the test schema; otherwise runtime env loading in app code can make tests hit the wrong schema.
- If host port `5433` is already occupied, set `DB_PORT` and update `DATABASE_URL` to match (for example `55433`); Docker Compose now maps Postgres via `${DB_PORT}:5432`.
- Docker Compose now pins `postgres:18-alpine`; because the official PostgreSQL 18 image uses the newer `/var/lib/postgresql` volume layout, keep the named volume mounted at `/var/lib/postgresql` and set `PGDATA=/var/lib/postgresql/data/pgdata` to preserve durable data initialization.
- Production Compose can override DB identity and major version via `.env`: `POSTGRES_IMAGE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PGDATA`, and `COMPOSE_DATABASE_URL`. Legacy Paiqo volumes need `postgres:16-alpine`, `POSTGRES_PGDATA=/var/lib/postgresql`, and `COMPOSE_DATABASE_URL=postgresql://paiqo:paiqo@db:5432/paiqo?schema=public` until migrated by dump/restore.
- Poll and food-selection retention have been removed: records are kept indefinitely for analytics/recommender use.
- Playwright e2e seeds a real local admin user into the dedicated test DB before booting the production server (`E2E_LOGIN_EMAIL` / `E2E_LOGIN_PASSWORD`, defaults in `.env.test.example`) and logs in through the normal local-auth UI; no auth bypass route is required.
- Production-style Docker deploys can use `pnpm deploy` / `scripts/deploy.sh`; it exports and prints `APP_VERSION`, `GIT_SHA`, `GIT_BRANCH`, `GIT_DIRTY`, and `BUILD_TIME`, lists Compose data volumes, builds app + migrate images, starts the DB, runs production data safety checks, creates a pre-deploy PostgreSQL backup, verifies Prisma migration status, runs `prisma migrate deploy`, restarts `app`, and checks data safety again. For intentional fresh installs, use `ALLOW_EMPTY_DATABASE_DEPLOY=true`.
- `POST /api/food-selections/:id/recommendations` persists a `MealRecommendationImpression` row per request (office/actor-scoped, ranked items + reasons snapshot) for audit/outcome-learning; no separate helpful/not-helpful feedback endpoint exists by design — order/rating history alone drives future ranking (`personal_rating` signal).
- AI-assisted recommendation explanations require all four `AI_RECOMMENDATION_ENDPOINT`/`AI_RECOMMENDATION_API_KEY`/`AI_RECOMMENDATION_MODEL`/`AI_RECOMMENDATION_PROVIDER` env vars; if any are missing, the provider errors, returns malformed output, or the 2s timeout elapses, the response falls back to `source: "deterministic_fallback"` with a warning instead of failing the request. Set `AI_RECOMMENDATION_PROVIDER="azure-openai"` to call an Azure OpenAI chat-completions deployment directly (`api-key` header, `response_format: json_object`, parses `choices[0].message.content`); any other provider value uses the generic `Authorization: Bearer` + `{model,items,preferences}` → `{explanations:[...]}` contract. The AI never ranks items, only rewrites reason text.
- Import-time feature gap-filling reuses the same `AI_RECOMMENDATION_*` env boundary and 2s timeout as recommendation explanations, but only for keyword-untagged imported items; the payload carries just item name + description, and imports still complete if AI is unavailable or malformed.
- If `pnpm exec prisma migrate dev` fails with a blank schema-engine error against the local dev database, double-check the dev Postgres at `DATABASE_URL`; `pnpm exec prisma generate` can still succeed, but the migration SQL may need to be added manually when the database is unavailable.
- `src/server/services/mealFeatures.ts` adds content-based per-person ranking: a curated ingredient/style keyword taxonomy (EN+DE) tags each item, a per-user `TasteProfile` is learned from order history, and the new `taste_match` signal scores unrated current-menu items by feature overlap with the profile (`SCORE_TASTE_PER_POINT=8`, clamped ±`SCORE_TASTE_MAX=40`). The profile blends explicit ratings (`rating-3`, confidence 1) with **implicit feedback** — every order is a mild positive vote for its features (`IMPLICIT_ORDER_VALUE=1`, confidence `0.4`) via a confidence-weighted mean, so the sparse weekly-ordering / rarely-rated regime still produces signal. Activates when `ratedCount >= TASTE_PROFILE_MIN_RATINGS(2)` OR `orderCount >= TASTE_PROFILE_MIN_ORDERS(4)`; below that, ranking keeps the exact-item-name behavior. Profile features come from item *name* only (history retains no description), so the taxonomy vocabulary is the shared space between history and current items. Modeling in feature space (not item space) is deliberate: menus churn weekly so classic user×item CF hits item cold-start on exactly today's menu; features stay dense and stable. Next candidate upgrades: persisted/AI-tagged item features at import, factorization machines, or a contextual bandit over features.
- Menu item writes now sync stable identity plus keyword feature tags immediately in `src/server/services/menu.ts`, so tests and downstream services can assume `menu_items.item_identity_key`, `menu_item_identities`, and `menu_item_features` are populated after manual create/update/import flows.

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
pnpm install                       # install all dependencies (pnpm — see packageManager)
pnpm exec prisma generate          # regenerate Prisma client after schema changes
pnpm exec prisma migrate dev       # apply pending DB migrations (dev only)
pnpm dev:server                    # start backend with hot-reload (tsx watch)
pnpm dev:client                    # start Vite dev server for frontend
pnpm build                         # production build (tsc + vite build → dist/)
pnpm start                         # run production server (serves static client from dist/)
docker compose up --build          # full stack in Docker (preferred for production)
```

## Validation

Run ALL of these after any implementation. Fix every failure before committing.

```bash
pnpm typecheck         # tsc --noEmit across server + client + lib
pnpm lint              # ESLint for .ts and .tsx files
pnpm test              # vitest run — all tests
pnpm test:server       # vitest run --project server (unit + integration)
pnpm test:client       # vitest run --project client (component + hook tests)
```

Full one-liner (same as CI):
```bash
pnpm validate          # runs ./validate.ps1 all (typecheck + lint + complexity + duplication + semgrep + test + audit)
```

## Test Database (dedicated Postgres)

Server integration tests and e2e run against a **dedicated, ephemeral Postgres
database**, isolated from the dev/app DB so tests never touch real data.

- Defined as the `db-test` service in `docker-compose.yml` (compose profile
  `test`, no named volume → data discarded on teardown).
- Tests pick it up via `TEST_DATABASE_URL`. When that var is set, the whole
  suite targets it (see `tests/server/setup.ts`); otherwise it falls back to a
  `TEST_DATABASE_SCHEMA` schema inside `DATABASE_URL`, then to SQLite when
  Postgres is unreachable.
- Teammates opt in by copying the committed template:
  `cp .env.test.example .env.test`. `.env.test` is gitignored; the suite then
  reads `TEST_DATABASE_URL` from it. Host port via `TEST_DB_PORT` (default
  `55434`). Skip the copy to use the `DATABASE_URL` / SQLite fallback.
- Caveat: with `.env.test` present, the dedicated DB is authoritative — the
  suite will NOT silently fall back to SQLite. The git hooks run the suite, so
  `pnpm db:test:up` must be running before you commit/push.

```bash
cp .env.test.example .env.test   # one-time opt-in (gitignored)
pnpm db:test:up        # start the dedicated test Postgres (docker compose db-test, waits healthy)
pnpm test              # runs against TEST_DATABASE_URL when set in .env.test / env
pnpm exec playwright install chromium   # one-time per machine/CI
pnpm test:e2e          # Playwright e2e against the same test DB
pnpm db:test:down      # stop + remove the test DB container (discards data)
```

The migration/seed of the server test schema is automatic in
`tests/server/setup.ts` (`prisma migrate deploy`); the suite refuses to run
against schema `public` unless `ALLOW_DANGEROUS_TEST_SCHEMA=true`.

**E2E (Playwright)**: `playwright.config.ts` has a `webServer` that runs
`pnpm build` then `scripts/e2e-server.mjs` — which migrates the dedicated test
DB and boots the **production** server (`NODE_ENV=production`, serving
`dist/client`) on `E2E_PORT` (default `4173`). It requires `TEST_DATABASE_URL`
(via `.env.test`) and `pnpm db:test:up`. Set `PLAYWRIGHT_BASE_URL` to point at an
already-running server instead (CI/remote). Note: `pnpm build` now also copies
the Prisma client into `dist` (`scripts/copy-prisma-client.mjs`), since it's
generated to `src/server/generated/client` (explicit output for pnpm).

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
- Duration validation: 1 minute or multiples of 5 between 5–30 minutes are accepted
- Food orders use line-item semantics; ownership checks use stable actor keys, not display names
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
- Authenticated display label is read from current auth/profile state, with email fallback

## Codebase Patterns

- **DB access**: always via the Prisma singleton in `src/server/db.ts` — never instantiate `PrismaClient` elsewhere
- **Business logic**: lives in `src/server/services/` — route handlers must stay thin (validate input → call service → return result)
- **SSE**: call `broadcast(eventName, payload)` from services after any state change; see `realtime-events.md` for the full event catalogue
- **Name snapshots**: when persisting a poll vote, food order, etc., always store the name string alongside the FK (e.g. `menu_name`, `item_name`) — FKs can become null if the source is deleted
- **Display identity**: user-attributed writes resolve the stable actor from the signed auth session (`actor_key` / `actor_email`) and store `display_name_snapshot`; display names are optional, non-unique, and validated server-side.
- **Retired nickname identity**: `team_lunch_nickname` is no longer an identity mechanism. Request-body nickname fields may remain in compatibility payloads, but authenticated routes ignore them for ownership/attribution.
- **Shared types**: define request/response shapes and domain enums in `src/lib/` and import from both server and client — no type duplication
- **Error responses**: `{ error: string }` JSON body with appropriate HTTP status codes (400 validation, 409 conflict, 404 not found)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## RTK
@(.agents|.codex|.claude)/skills/rtk/SKILL.md
