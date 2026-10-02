# Implementation Plan: Food Selection Lifecycle

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code)

## Summary

Two-phase flow after a poll winner: (2) timed meal-line collection with
extend/overtime/ordering states, and (3) explicit real-world order claim, ETA
entry, and delivery tracking to completion — plus organizer fallback ordering and
post-delivery feedback/export. All transitions fan out over SSE; a single ongoing
selection per office blocks new lunch cycles.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5, Prisma 6 (FoodSelection/FoodOrder), SSE manager, Microsoft Graph mail (`notificationEmail.ts`)

**Storage**: PostgreSQL — PostgreSQL Prisma schema

**Testing**: Vitest + Supertest — `tests/server/food-selection-{service,routes,authz,timer,reminder}.test.ts`, `food-order-rating-export.test.ts`

**Project Type**: Single-package full-stack web app

**Constraints**: One ongoing selection per office; claim is the hard mutation cutoff; delivery timer must `unref()`; reminders/pings are best-effort and suppressed in test runtime except the configured smoke recipient.

**Scale/Scope**: 1 service (`foodSelection.ts`), 1 route module, client views: `FoodSelectionActiveView`, `FoodSelectionOrderingView`, `FoodSelectionOvertimeView`, `FoodSelectionCompletedView`, `FoodSelectionOrderBoard`, `FoodSelectionAbortControl`, `FoodDeliveryView`, `OrdersRail`.

## Constitution Check

- Thin routes → logic in `foodSelection.ts`: **pass**.
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts`: **pass**.
- SSE on every transition: **pass** (10 events).
- Tests mandatory: **pass** (5 server suites + export).
- Name snapshots (`menu_name`, `item_name`): **pass**.

## Project Structure

```text
src/server/services/foodSelection.ts        # phase 2+3 business logic + delivery timer
src/server/services/userMenuDefaults.ts     # saved default meal (fallback source)
src/server/services/notificationEmail.ts    # reminders + organizer pings (Graph)
src/server/routes/foodSelections.ts         # thin handlers + authz
src/lib/types.ts                            # FoodSelection / FoodOrder shared types
src/client/components/FoodSelection*.tsx, FoodDeliveryView.tsx, OrdersRail.tsx
prisma/schema.prisma # FoodSelection, FoodOrder
tests/server/food-selection-*.test.ts, food-order-rating-export.test.ts
tests/client/FoodSelection*.test.tsx, FoodDeliveryView.test.tsx
```

**Structure Decision**: Standard layer split. State machine lives entirely in the
service; routes enforce role/claim authz. Delivery timer mirrors the poll timer
pattern (module-level map, `unref`).

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| Two timers (selection window + delivery ETA) | Distinct phases | Both in-process; single-instance assumption |
| Claim as mutation cutoff (not overtime→ordering) | Let stragglers order until someone commits | Deliberate product rule |
| Organizer fallback with 4 preconditions | Avoid accidental/unwanted orders | Audit-noted; never automatic |
| Best-effort mail/notify | Core flow must not fail on delivery side-effects | Suppressed in tests except smoke recipient |
