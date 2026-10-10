# Specs Backlog

**Last Updated**: 2026-10-02

This backlog is the canonical intake list for unstructured feature wishes before
they become numbered specs.

## Intake Rules

- Before creating any new numbered spec, review this file.
- If a request matches an existing backlog item, link the new spec back to that backlog ID.
- If a request is new, add it here first, then decide whether to promote it immediately.
- During planning/reconciliation sessions, treat this file as the canonical source for unstructured feature wishes.
- If a backlog item has a GitHub issue, keep the backlink in the notes and include the backlog ID in the issue title.

## Items

| ID | Title | Status | Promoted Spec | Notes |
|----|-------|--------|---------------|-------|
| BACKLOG-001 | AI meal recommendations from ratings | Promoted | [002-ai-meal-recommendations](002-ai-meal-recommendations/spec.md) | Builds on persisted order ratings, remarks, preferences, and retained poll/food-selection history. |
| BACKLOG-002 | Learned meal recommender (factorization machines / contextual bandit) | Delivered | [003-learned-meal-recommender](003-learned-meal-recommender/spec.md) | Delivered in [003-learned-meal-recommender](003-learned-meal-recommender/spec.md); successor to BACKLOG-001's deterministic feature scorer. See notes below. |
| BACKLOG-003 | Ordering claim timeout and recovery | Backlog | - | Prevents a lunch from staying locked if the person who claimed ordering disappears before placing the real order. Not implemented; promote to a focused food-selection spec update before building. |
| BACKLOG-004 | Office-scoped admin roles | Backlog | - | Add office-location admins who can manage assigned offices without global admin powers. |
| BACKLOG-005 | Multiple concurrent polls per office | Backlog | - | Requires product model redesign because current phase/SSE semantics assume at most one active poll per office. |
| BACKLOG-006 | Live Entra account verification | Backlog | - | Manual tenant/app-registration validation that mocked tests cannot cover. |
| BACKLOG-007 | Prisma 7 production verification | Backlog | - | Production smoke checklist for pg driver-adapter behavior, deploy safety, and critical flows. |
| BACKLOG-008 | Menu allergens and additives | Planned | [004-menu-safety-labels](004-menu-safety-labels/spec.md) | Extend imported and manually managed menu items with distinct allergen/additive metadata. Show them apart from preference tags and let food-selection users temporarily exclude matching dishes. |
| BACKLOG-009 | Office ordering interval policy | Delivered | [005-ordering-interval-policy](005-ordering-interval-policy/spec.md) | Fixed office-local calendar periods, pre-poll soft warning with recorded exceptions, scheduler compliance, and landing countdown. |
| BACKLOG-010 | Individual food-order item removal | Promoted | [006-individual-order-removal](006-individual-order-removal/spec.md) | [Issue #66](https://github.com/TKlerx/team-lunch/issues/66): expose the existing order-ID withdrawal in the user's added-meals summary. |

## BACKLOG-009 notes — Office ordering interval policy

Delivered in [005-ordering-interval-policy](005-ordering-interval-policy/spec.md).
All 17 tasks are complete; automated acceptance and full-gate evidence, plus
manual rollout limitations, are recorded in that feature's tasks/quickstart.
Office admins configure Unrestricted or one completed lunch per fixed 1/2/3/4-week
period, an office timezone, and a starting Monday at 00:00. Default is weekly.
Unused opportunities expire; exceptions do not shift period boundaries. Count
successful lunches by `completedAt`, not placement time. Check before all manual
poll/quick starts: Cancel is default; authorized starters can proceed with a
recorded justification. Automatic polls never override. The landing page shows
policy availability/countdown. Restricted-only fields are disabled and not
evaluated in Unrestricted mode; validate settings on both client and server.

## BACKLOG-007 notes — Prisma 7 production verification

### Scoped deployment maintenance — 2026-10-02

User-approved scope: ship referenced public assets and verify application
readiness before deployment reports success. No auth/bootstrap, environment
forwarding, database-identity, or broader hardening changes are authorized.

Implementation plan: copy `public/` into the Docker builder; add a native Node
HTTP healthcheck that requires `status: ok` (database connected), respects PORT,
and uses the internal `/api/health` route even for prefixed deployments; make
`deploy.sh` wait at most 120 seconds for app health. Test the probe's success,
degraded/error paths and configuration wiring; build and smoke-test the actual
image without accessing the application database, then run the aggregate gate.

- [x] DEPLOY-001 Complete the scoped Docker assets/readiness changes, regression tests, local startup instructions and deliberately deferred-gap documentation; record validation below before marking done.

Validation/completion evidence — 2026-10-02:
- `tests/server/docker-deployment.test.ts` passed all 6 checks, executing the actual Docker probe with successful, degraded, HTTP-failure, rejected-request and unexpected-payload responses; the config check covers assets-before-build and bounded deployment wait.
- Compose config and deployment shell syntax passed. Built both actual Compose images and started project `team-lunch-readiness` with its own fresh PostgreSQL volume, port 4180 and `/readiness` prefix; migrations completed and app health became healthy. Verified successful HTTP/database readiness and correct nonempty MIME-typed responses for all five public favicon/touch-icon/manifest assets. The documented one-time admin seed command worked with the env-file email; generated password was suppressed in validation logs. Existing app/test databases were not modified.
- `pwsh -File ./validate.ps1 all` passed every gate: 95 files / 1,477 tests, 88.69% line / 81.83% branch coverage. README now explains Docker-only local startup and explicitly lists the deferred gaps. No runtime dependency, schema/migration, login bootstrap automation or optional feature env forwarding was added.

Main integration validation — 2026-10-02:
- User committed/pushed scoped maintenance as `e01cccc`. Final pre-merge `validate.ps1 full` passed 1,477 tests, Trivy and 3 Playwright smoke tests. Recreated only the disposable test PostgreSQL container after Docker reported a stale network reference; no application data was reset.
- Integrated `origin/main` at `8d240d2` without committing/pushing. Resolved `AGENTS.md`, package manifest, workspace and lockfile conflicts: retained newer branch security patches and all policy/assets/readiness changes, incorporated upstream pnpm 11.21.0 and tooling/security updates, schema-qualified import fixes, and CSV personal exports. Removed obsolete ExcelJS compatibility/override and added CSV policy-privacy/ownership coverage. Vitest 4 uses `maxWorkers: 1` instead of removed `poolOptions`.
- Focused merged checks passed 84 tests, typecheck and production audit. Final merged `validate.ps1 full` passed every gate: 95 files / 1,483 tests, 85.91% line / 77.13% branch coverage under Vitest 4, pinned Trivy and 3 Playwright smoke tests. Compose config, shell syntax, and conflict/whitespace checks passed. Selective FAIM refresh/validation passed with zero stale facts/violations and unchanged axioms; the existing untracked tool notice remains.

Deliberately deferred:
- The fresh-install `ALLOW_EMPTY_DATABASE_DEPLOY` override is not forwarded to the migration container by the deploy wrapper.
- Compose does not forward Graph mail, AI recommendation, reminder and global food-selection fallback settings. Setting them only in the host `.env` does not configure the app container.
- First local-user provisioning is manual; a strong session secret and configured local account or Entra are prerequisites, not automatically created by Compose.
- PostgreSQL host-port exposure, fallback credentials, missing `.dockerignore`, HTTPS/proxy setup and database major-version/identity upgrades remain operator/follow-up work. Coordinate `COMPOSE_DATABASE_URL` with PostgreSQL credentials; do not change an existing volume's major version in place.

Manual production checks after the Prisma 7 driver-adapter migration:

- Confirm TLS/SSL connectivity to production Postgres for both `app` and `migrate`; add `sslmode=require` or `NODE_EXTRA_CA_CERTS` if cert handling requires it.
- Run the full `docker compose up` stack against the target environment: `db` healthy, `migrate` completes `prisma migrate deploy`, and `app` serves traffic.
- Smoke-test read/write queries against the intended schema; runtime schema selection depends on `src/server/db.ts` parsing `?schema=` and passing it to `PrismaPg`.
- Watch connection-pool behavior under real traffic; configure pool size/timeouts in `PrismaPg` options if defaults are insufficient.
- Confirm `scripts/prisma-production-data-check.mjs` reports live row counts and blocks unintended empty-DB deploys.
- Smoke-test auth login (Entra + local), poll lifecycle, food-selection/order flow, and CSV export after deploy.

## BACKLOG-006 notes — Live Entra account verification

Verify against a real Entra tenant and app registration:

- Redirect URI matches `${APP_PUBLIC_URL}${BASE_PATH}/api/auth/entra/callback`.
- First login creates/syncs the approved access user as expected.
- Entra display-name changes sync into account display-name cache.
- Disabled/removed accounts fail safely on protected routes.
- Logout/session expiry behavior matches production expectations.

## BACKLOG-005 notes — Multiple concurrent polls per office

Current behavior intentionally enforces one active poll per office. Before building,
define how users distinguish polls and how voting, tie handling, timers,
notifications, dashboard summaries, and start-food-selection targeting work when
multiple polls coexist. Revisit SSE `initial_state`, browser notifications, client
phase derivation, and the food-selection guard.

## BACKLOG-004 notes — Office-scoped admin roles

Introduce office-scoped admins who can manage one or more assigned offices without
global powers. Likely permissions: menu and shopping-list management, poll and
food-selection lifecycle actions, office user management, and office settings.
Define how office roles interact with the global bootstrap admin and any future
organization model before implementation.

## BACKLOG-003 notes — Ordering claim timeout and recovery

Current shipped behavior records exactly one ordering claimer and blocks a second
claim while that claim remains active. There is no claim lease, no claim expiry,
and no automatic release if the claimer walks away.

Potential feature shape:

- Give an ordering claim a default `10`-minute lease.
- Allow the current claimer to extend the lease by another `10` minutes while it
  is still active.
- When the lease expires, release the claim but keep the food selection in
  ordering so another approved user can take over.
- Broadcast claim extension and release/expiry state changes to all clients in
  the affected office.
- Show remaining claim time in the ordering UI and make the takeover path clear
  after expiry.

Promotion guidance: this is small enough to be a food-selection spec update if it
is bundled with existing ordering semantics. Create a separate numbered spec only
if the recovery behavior grows into broader handoff/audit/escalation flows.

## BACKLOG-002 notes — Learned recommender

Delivered successor to the current deterministic content-based scorer
(`src/server/services/mealFeatures.ts` + `mealRecommendation.ts`). Model in
**feature space, not item space**: menus are stable per office today but can be
re-imported or replaced (especially other offices), so classic user×item
collaborative filtering hits item cold-start on exactly the current menu, while
ingredient/style features stay dense and stable.

Candidate techniques (in rough order of fit for sparse, weekly, small-office data):

1. **Factorization Machines** — handle sparse categorical inputs (user ×
   item-feature × context like weekday/season) and degrade gracefully with
   little data. Principled step beyond hand-tuned weights.
2. **Contextual bandit** (e.g. Thompson sampling over features) — treats each
   weekly selection as a round: recommend → observe what was ordered → update.
   Balances explore/exploit, learns online with little data. Strong fit for the
   weekly cadence.

Prerequisites / enablers (do these first, mostly independent and useful on their own):

- **Implicit feedback capture** — DONE: orders now feed the taste profile as a
  mild positive signal (`IMPLICIT_ORDER_VALUE`), not just explicit ratings.
- **Persisted + AI-tagged item features** at menu import (`MenuItem.featuresJson`),
  with the keyword taxonomy as the offline fallback and AI only filling gaps —
  raises feature coverage beyond the curated keyword list.
- **Stable item identity** across menu re-imports (canonical item key) so history
  is not reset by renames.
- **Evaluation harness / hit-rate metric** off `meal_recommendation_impressions`
  (join shown rank vs. what was ordered) — required to tune or compare any model;
  without it, "good" is unmeasurable.

Decision: keep the deterministic feature scorer as the always-available baseline
and fallback; layer a learned model on top only once the eval harness exists to
prove it beats the baseline.
