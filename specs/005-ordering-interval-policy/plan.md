# Implementation Plan: Office Ordering Interval Policy

**Branch**: `005-ordering-interval-policy` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)
**Input**: BACKLOG-009 and confirmed calendar-quota requirements.

## Summary

Add office-level interval/timezone/Monday settings and a single server-owned
policy evaluator. Check every new-lunch creation path before writes; permit
manual exceptions only with validated reasons and immutable audit snapshots.
Scheduled polls skip noncompliant periods. Surface server-calculated availability
on the landing page and refresh via SSE plus boundary rechecks.

## Technical Context

**Language/Version**: TypeScript 5.x ESM; Node 24.
**Primary Dependencies**: Fastify 5, React 19, Vite 6, React Router 7, Prisma 7 with PostgreSQL adapter. Native Date/Intl for calendar/timezone operations; no new dependency planned.
**Storage**: Existing PostgreSQL/Prisma singleton; OfficeLocation fields and nullable Poll exception snapshot. Index completion lookup by office/status/completedAt.
**Testing**: Vitest server/client, Supertest, Testing Library; existing Playwright framework for the full gate.
**Target Platform**: Browser SPA and Fastify backend, Windows-first tooling.
**Project Type**: Single-package full-stack app.
**Performance Goals**: One indexed completion-existence lookup per policy decision; no history scans or per-second policy requests. Countdown updates locally at least every minute.
**Constraints**: Office-scoped auth, server-owned clock, DST-safe calendar blocks, no hard quotas, no new approval flow, no circular dependencies, max 300 lines per source function.
**Scale/Scope**: One policy service, one small timezone helper if needed, one reusable policy warning/countdown surface, one read endpoint, one scoped invalidation event; reuse current settings/start/history routes.

## Constitution Check

Before research and after design: PASS (no exemptions).
- Business rules stay in services; routes authenticate/validate/forward.
- All queries use `src/server/db.ts`.
- Shared types stay in `src/lib/types.ts`; exception actors come from signed sessions and retain display snapshots.
- Changes notify through SSE; countdown boundary refresh covers transitions without mutations.
- Each implementation task includes focused tests; aggregate validation precedes shipping.
- Migrations are additive and LF-only; historical data and applied migrations remain untouched.
- Retained history remains retained. No new persisted model requires an extra cleanup table, but office fixture defaults/reset must be covered.

## Project Structure

### Documentation

`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/ordering-policy.md`,
`quickstart.md`, `tasks.md`, and `checklists/requirements.md` in this directory.

### Source Code

Existing integration points:
- `prisma/schema.prisma`, new `prisma/migrations/` migration.
- `src/lib/types.ts`: office settings, availability, typed policy conflict, exception snapshot.
- `src/server/services/orderingPolicy.ts` (new): calendar evaluation, completion lookup, reason/snapshot validation.
- `src/server/services/officeTime.ts` (new if needed): small Date/Intl helpers shared by policy and scheduler, not a generic date framework.
- `src/server/services/officeLocation.ts`: validation/defaults/persistence and invalidation.
- `src/server/services/pollCreation.ts`, `poll.ts`: normal and auto-finished poll guards/snapshots before any write or timer.
- `src/server/services/officePollSchedule.ts`: office-local schedule and precheck; creation rechecks.
- `src/server/routes/polls.ts`, `foodSelections.ts`, `auth.ts`: thin forwarding, read endpoint, response filtering.
- `src/server/services/foodSelection.ts`, `src/server/sse.ts`: completion invalidation and admin-safe history snapshot projection.
- `src/client/pages/Administration.tsx`: timezone/interval/date settings, disabled anchor, inline validation.
- `src/client/components/PollIdleView.tsx`: normal and quick-start warning/countdown integration.
- `src/client/components/FoodSelectionCompletedView.tsx` and poll detail rendering: admin-only exception information.
- `src/client/api.ts`, `hooks/useSSE.ts`, `context/AppContext.tsx`: typed conflict handling and office-scoped refresh.
- `tests/server/`, `tests/client/`: focused calendar, settings, creation, scheduler, SSE/history, UI coverage.

## Implementation Decisions

1. Initialize weekly settings with UTC and the current week's Monday, both editable; never derive an office zone from a browser. Preserve saved anchors while unrestricted.
2. Compute calendar-day offsets in the office zone, divide by `7 * intervalWeeks`, then convert each boundary's local Monday independently into UTC. Do not add elapsed 168-hour durations. Before the anchor, return `not_started` with the anchor as next availability.
3. Query existence of `status=completed` with non-null `completedAt` in `[start,end)` and the same office. An exception does not move blocks or add future debt.
4. Add a server preflight read for UX, but gate normal poll creation and auto-finished quick-start creation again using a shared service guard. Server-side source discriminator (`manual`/`scheduled`) is not trusted from request bodies. Manual calls pass the authenticated actor plus optional reason; scheduled calls cannot override.
5. Return a typed 409 policy conflict with current availability before any side effect. Valid manual justification permits the existing operation; existing activity conflicts remain non-overridable.
6. Store snapshot JSON on the originating Poll in the same create operation. No dedicated audit table or history endpoint. Project snapshot into admin REST details/history only; do not include private exception data in mixed-audience SSE payloads. Admin historical routes must use existing office authorization.
7. Add scoped `ordering_policy_changed` invalidation after settings changes and successful completion. Initial SSE includes public policy availability, not exceptions. Clients refetch public availability after invalidation, on office change/reconnect and countdown expiry. Discard late responses for a previous office.
8. Scheduled poll time/weekday/day marker calculations use office timezone; preserve existing schedule/activity constraints and do not introduce delayed catch-up or extra retries outside the existing scheduler tick.
9. Settings/anchor changes reinterpret retained completions immediately but never mutate exception snapshots or stop an active process. Unexpected evaluation/DB failures fail safely rather than silently authorizing a start.
10. Policy is not a period reservation or concurrency redesign. Recheck close to creation; retain existing single-active-process rules. Test stale preflight and shared-path bypasses. If creation/completion interleaving requires locking, use a narrow DB transaction rather than process-global locks; no speculative lock framework.

## Research and Delivery

Research is in [research.md](research.md); contracts and migration details are in
[data-model.md](data-model.md) and [contracts/ordering-policy.md](contracts/ordering-policy.md).
Implementation proceeds one checked task at a time from [tasks.md](tasks.md),
with tests in each task and no source changes in this planning phase.

## Complexity Tracking

No constitution violations or extra abstraction exceptions.
