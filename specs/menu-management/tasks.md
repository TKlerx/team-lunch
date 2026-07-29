---
description: "Migrated task list — Menu Management (already implemented)"
---

# Tasks: Menu Management

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — all tasks reflect shipped code and are marked `[x]`.

## Phase 1: Setup (Data + Shared Types)

- [x] T001 Define `Menu`, `MenuItem`, `UserMenuDefault` in both Prisma schemas (with import metadata fields)
- [x] T002 Add cleanup for menu tables in `tests/server/helpers/db.ts`
- [x] T003 [P] Menu/item shared types in `src/lib/types.ts`

## Phase 2: User Story 1 — Menu & item CRUD (P1)

- [x] T004 [US1] Menu create/rename/delete with CI-unique name + cascade in `menu.ts`
- [x] T005 [US1] Item create/edit/delete with within-menu uniqueness + field validation
- [x] T006 [US1] Preserve name snapshots in poll/order on delete
- [x] T007 [US1] Routes `GET/POST/PATCH/DELETE /api/menus` (+ items) in `routes/menus.ts`
- [x] T008 [US1] Broadcast SSE menu-changed on every mutation
- [x] T009 [US1] Client `ManageMenus.tsx` (list alphabetical, item counts, creation-order items)
- [x] T010 [US1] Tests: `menu-service.test.ts`, `menu-routes.test.ts`

## Phase 3: User Story 2 — Empty state (P2)

- [x] T011 [US2] `NoMenusView.tsx` empty-state CTA when no usable menus

## Phase 4: User Story 3 — Per-user default meals (P2)

- [x] T012 [US3] Default meal + optional default comment per menu in `userMenuDefaults.ts`
- [x] T013 [US3] Organizer fallback opt-in flag; clear-default removes preference
- [x] T014 [US3] Default-meal config UI in `ManageMenus.tsx`
- [x] T015 [US3] Tests: `user-menu-defaults-service.test.ts`

## Phase 5: User Story 4 — JSON import (P2)

- [x] T016 [US4] Full-payload validation before any write (atomic) in `menu.ts`
- [x] T017 [US4] Violation reporting `{ error, violations: [{ path, message }] }` with exact JSON paths
- [x] T018 [US4] Price/item-number rules (finite, 0–9999.99, ≤2 dp, item-number ≤40)
- [x] T019 [US4] Case-insensitive menu match → create-or-replace-items; persist menu metadata
- [x] T020 [US4] Import UI in `ManageMenus.tsx`; tests in `menu-routes.test.ts`
- [x] T021 [US4] Allow large atomic imports to exceed Prisma's five-second transaction default; regress with the 149-item Indish fixture

## Identified Gaps

- ℹ️ **Verify**: confirm an explicit test asserts a *partial* import never persists
  (rollback on mid-payload violation), not just top-level rejection.
- ℹ️ **Verify**: confirm price-precision edge (e.g. `10.005`) is rejected as >2 dp.
- ℹ️ **Categories**: import categories are silently dropped — intended, but no test
  asserts they are ignored without error.

## Notes

- Run `pwsh -File ./validate.ps1 all` before marking the task shipped.
- Keep name snapshots when adding any new FK to menus/items.
