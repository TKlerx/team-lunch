---
description: "Migrated task list — Shared Shopping List (already implemented)"
---

# Tasks: Shared Shopping List

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — all tasks reflect shipped code and are marked `[x]`.

## Phase 1: Setup (Data + Shared Types)

- [x] T001 Define `ShoppingListItem` in both Prisma schemas (office column + index)
- [x] T002 Add cleanup for shopping-list table in `tests/server/helpers/db.ts`
- [x] T003 [P] Shopping-list shared types in `src/lib/types.ts`

## Phase 2: User Story 1 — Track shared supplies (P1)

- [x] T004 [US1] Add item (name + `requested_by`) in `shoppingList.ts` → `shopping_list_item_added`
- [x] T005 [US1] Mark bought (`bought_by`/`bought_at`) → `shopping_list_item_updated`
- [x] T006 [US1] "Bought all" pending items
- [x] T007 [US1] List query office-scoped, bought grouped by date
- [x] T008 [US1] Routes `GET /api/shopping-list`, `POST /api/shopping-list`, `POST /api/shopping-list/:id/bought`
- [x] T009 [US1] Client `ShoppingList.tsx` (To Buy / Bought sections + actions)
- [x] T010 [US1] Tests: `shopping-list-service.test.ts`, `shopping-list-routes.test.ts`

## Identified Gaps

- ℹ️ **Verify**: confirm "mark already-bought" is idempotent (no error / no double
  timestamp) in tests.
- ℹ️ **Notifications**: shopping-list email notifications are a multi-office
  follow-up candidate — not implemented today.

## Notes

- Run `./validate.ps1 all` before commit.
