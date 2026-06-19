---
description: "Migrated task list — Food Selection Lifecycle (already implemented)"
---

# Tasks: Food Selection Lifecycle

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — all tasks reflect shipped code and are marked `[x]`.

## Phase 1: Setup (Data + Shared Types)

- [x] T001 Define `FoodSelection`, `FoodOrder` models in `prisma/schema.prisma` + `prisma/schema.sqlite.prisma` (with `menu_name`/`item_name` snapshots)
- [x] T002 Add cleanup for food-selection tables in `tests/server/helpers/db.ts`
- [x] T003 [P] Define `FoodSelection` / `FoodOrder` shared types in `src/lib/types.ts`

## Phase 2: Foundational

- [x] T004 Delivery + selection-window timers in `src/server/services/foodSelection.ts` (mirrors poll timer pattern)
- [x] T005 [P] User menu defaults service `src/server/services/userMenuDefaults.ts` (fallback source)
- [x] T006 [P] Notification email service `src/server/services/notificationEmail.ts` (reminders + pings)

## Phase 3: User Story 1 — Collect meal orders (P1)

- [x] T007 [US1] `startFoodSelection` — require finished poll + winner, single-selection guard, broadcast `food_selection_started`
- [x] T008 [US1] Add / withdraw-one / withdraw-all line items (note 0–200), `active`-only guard
- [x] T009 [US1] Timer expiry → `overtime` + `food_selection_overtime`
- [x] T010 [US1] Routes `POST /api/food-selections`, `/orders` in `src/server/routes/foodSelections.ts`
- [x] T011 [US1] Client `FoodSelectionActiveView` + `FoodSelectionOrderBoard`
- [x] T012 [US1] Tests: `food-selection-service.test.ts`, `food-selection-routes.test.ts`

## Phase 4: User Story 2 — Extend / move to ordering (P1)

- [x] T013 [US2] Extend (5/10/15) with admin/creator authz → `food_selection_extended`
- [x] T014 [US2] Move-to-ordering → `ordering`, clear timer, `food_selection_ordering_started`
- [x] T015 [US2] Client `FoodSelectionOvertimeView` + `FoodSelectionOrderingView`
- [x] T016 [US2] Tests: overtime/extension in `food-selection-timer.test.ts`, `food-selection-authz.test.ts`

## Phase 5: User Story 3 — Place order & track delivery (P1)

- [x] T017 [US3] Claim order → `claimed`, record claimer, lock mutations, `food_selection_ordering_claimed`
- [x] T018 [US3] Place order (ETA 1–240) → `delivering` + delivery fields, `food_selection_delivery_started`
- [x] T019 [US3] ETA update + zero → `delivery_due`, `food_selection_eta_updated` / `_delivery_due`
- [x] T020 [US3] Confirm arrival → `completed`, `completed_at`, `food_selection_completed`
- [x] T021 [US3] Client `FoodDeliveryView` + `FoodSelectionCompletedView` + `OrdersRail`
- [x] T022 [US3] Tests: claim/place/delivery in `food-selection-timer.test.ts`, `food-selection-authz.test.ts`

## Phase 6: User Story 4 — Organizer fallback (P2)

- [x] T023 [US4] Place missing user's saved default meal (4 preconditions + audit note)
- [x] T024 [US4] Ping missing user (best-effort email + targeted browser notification)
- [x] T025 [US4] No-order reminders from `FOOD_SELECTION_REMINDER_MINUTES_BEFORE`
- [x] T026 [US4] Tests: `food-selection-reminder.test.ts`

## Phase 7: User Story 5 — Feedback & export (P3)

- [x] T027 [US5] Per-order rating (1–5) + optional remark; keep 5 most recent completed
- [x] T028 [US5] Excel export via `exceljs`
- [x] T029 [US5] Tests: `food-order-rating-export.test.ts`

## Phase 8: Cross-cutting

- [x] T030 Abort selection → `aborted`, `food_selection_aborted`
- [x] T031 Block new lunch cycle while `ordering`/`delivering`/`delivery_due` (poll-start guard)
- [x] T032 Office-scoping on all queries

## Identified Gaps

- ⚠️ **Multi-node**: selection + delivery timers are in-process; second instance
  won't fire timers it didn't schedule. Single-instance assumption.
- ⚠️ **Fallback complexity**: 4 preconditions + audit note are intricate; confirm
  a test asserts each precondition rejection path individually (not obvious from
  file inventory).
- ℹ️ **Verify**: confirm the "keep 5 most recent completed" pruning has an explicit
  test, and that ETA-update timer restart is asserted at boundary (zero).

## Notes

- Run `pwsh -File ./validate.ps1 all` before marking the task shipped; `full` adds Playwright E2E.
- Claim is the hard mutation cutoff — keep that invariant when extending.
