# Implementation plan: Auth bootstrap office privacy

Branch: codex/008-auth-config-privacy. Date: 2026-10-10. Spec: [spec.md](spec.md).

## Summary and technical context

Limit bootstrap projection after existing session validation, reuse authorization service summaries, retain full office administration for admins, and apply no-store at handler entry. TypeScript 5 / Node 24, Fastify 5, Prisma 7, React 19; existing Vitest 4 and Playwright. PostgreSQL persistence unchanged. No new dependency, endpoint, client state or SSE event. Anonymous bootstrap avoids the all-office query.

## Constitution check

Permission checks/projection remain at the existing auth route boundary; service-owned membership and office queries are reused. Import the existing shared response type instead of its duplicate in the route. No Prisma instance, schema or business transition change. One complete task includes regression tests and all/full gates. Design recheck: compliant; no exceptions.

## Structure and implementation

- src/server/routes/auth.ts: shared contract import, no-store header, clear stale private session state, guard admin data/office reads, project selector summaries.
- tests/server/auth-config-privacy.test.ts: real disposable DB and signed-session regressions, admin/nonadmin projections, login, failure headers.
- tests/client/AuthGate.test.tsx and existing auth/multi-office suites: compatibility verification, changing tests only if needed.
- specs/008-auth-config-privacy/: specification, research, contract, validation and task evidence.

## Validation strategy

Run focused auth/session/access/office tests, then validate.ps1 full (all gates plus image/E2E). Explicit disposable schema and test-only signing secret; no production requests/mutations. Build and tests are sequential per worktree; check Docker data-disk space before building.

## Complexity tracking

No new abstraction or dependency. The required image gate needs the existing source-map-js security override patch already verified for #68; repeat only that small patch on this independent security branch if main has not incorporated it.
