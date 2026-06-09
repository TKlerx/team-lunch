# Implementation Plan: Multi-Office Support

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code, cross-cutting)

## Summary

Office isolation threaded through every office-scoped feature: an `OfficeLocation`
entity with per-office lunch defaults, an `office_location_id` column on
menus/polls/food-selections/shopping-list, per-office single-active-poll, explicit
office input in service signatures, office-aware SSE broadcast + hydration, and an
admin/multi-office header selector. Regular users are bound to their assigned
office(s); global admins operate one selected office context at a time.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5, Prisma 6 (`OfficeLocation`, membership table, office columns), SSE manager (office-aware), React context (`AdminOfficeContext`)

**Storage**: PostgreSQL / SQLite — dual Prisma schema; staged migrations

**Testing**: Vitest + Supertest — `tests/server/office-location-service.test.ts`, `office-poll-schedule.test.ts`, plus office-scoping asserted within feature suites

**Project Type**: Single-package full-stack web app

**Constraints**: Never trust client-supplied office ids for regular users; SSE must not leak across offices; migrations staged (nullable → backfill → constrain).

**Scale/Scope**: Cross-cutting — touches every office-scoped service + SSE + client context/header.

## Constitution Check

- Thin routes → office resolution in services (`officeLocation`/`officeContext`): **pass**.
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts`: **pass**.
- SSE office-scoped (`broadcast(event, payload, officeLocationId)`): **pass**.
- Tests mandatory: **pass** (office suites + per-feature scoping tests).

## Project Structure

```text
src/server/services/officeLocation.ts     # office resolution, ensureDefault, per-office defaults
src/server/services/officeContext.ts       # request → office context resolution
src/server/services/officePollSchedule.ts  # auto-start scheduling per office
src/server/sse.ts                           # office-aware broadcast + initial_state
src/client/context/AdminOfficeContext.tsx   # admin/multi-office selector state
prisma/schema.prisma | schema.sqlite.prisma # OfficeLocation, auth_access_user_offices, office columns
tests/server/office-location-service.test.ts, office-poll-schedule.test.ts
```

**Structure Decision**: Office context is resolved once per request/SSE-open and
passed explicitly into services, keeping scoping visible in signatures rather than
hidden in route glue.

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| Direct `office_location_id` on `food_selections` | Simpler filtering/retention even though derivable from poll | Deliberate denormalization |
| Office id explicit in service signatures | Scoping visible + testable | More params, fewer leaks |
| Transitional `default`-office fallback for office-less admins | Smooth phased rollout | Marked for removal once selector adopted |
| Global-admin-only model | Keep permissions simple in first rollout | Office-scoped admin is a follow-up |
