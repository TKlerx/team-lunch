# Implementation Plan: Poll Lifecycle

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code)

## Summary

Timed menu poll with real-time voting, tie resolution (extend / random), manual
early end, and admin abort. Single active poll per office. State changes fan out
over SSE; expiry is driven by an in-process timer keyed by poll id.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5 (routes), Prisma 6 (Poll/PollVote/PollExcludedMenu/AuditLog), SSE manager (`src/server/sse.ts`)

**Storage**: PostgreSQL — PostgreSQL Prisma schema

**Testing**: Vitest + Supertest — `tests/server/poll-*.test.ts`, `office-poll-schedule.test.ts`

**Project Type**: Single-package full-stack web app

**Constraints**: One `active`/`tied` poll per office; no new poll while an order is ongoing; timers must `unref()` so they never keep the test process alive.

**Scale/Scope**: 1 service (`poll.ts`, ~810 lines), 1 route module, 4 client Poll views + dashboard.

## Constitution Check

- Thin routes → logic in `poll.ts`: **pass** (routes delegate).
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts` (`Poll`): **pass**.
- SSE on every state change: **pass** (started/vote/extended/ended).
- Tests mandatory: **pass** (service + routes + authz + timer suites).
- Name snapshots alongside FK: **pass** (`menu_name`, `winner_menu_name`).

## Project Structure

```text
src/server/services/poll.ts          # all poll business logic + expiry timers
src/server/services/officeLocation.ts # office resolution + default FS duration
src/server/routes/polls.ts            # thin HTTP handlers + authz gating
src/server/sse.ts                     # broadcast(event, payload, officeLocationId)
src/lib/types.ts                      # Poll type (shared client/server)
src/client/components/Poll{Idle,Active,Tied,Finished}View.tsx
prisma/schema.prisma   # Poll, PollVote, PollExcludedMenu, AuditLog
tests/server/poll-{service,routes,authz,timer}.test.ts
tests/server/office-poll-schedule.test.ts
tests/client/Poll*.test.tsx
```

**Structure Decision**: Standard layer split. Timers live in a module-level
`Map<pollId, Timeout>` in `poll.ts`; `getActiveTimers`/`clearAllTimers` are
exported for test teardown.

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| In-process timer map | Drives expiry without external scheduler | Single-instance assumption; not multi-node safe |
| Auto-start food selection after finish | One-click flow continuity | Dynamic `import('./foodSelection.js')` avoids circular dep |
| Audit logging best-effort (swallows errors) | Poll completion must never fail on logging | Intentional |
