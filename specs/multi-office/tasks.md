---
description: "Migrated task list — Multi-Office Support (cross-cutting, mostly shipped)"
---

# Tasks: Multi-Office Support

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — shipped tasks marked `[x]`; transitional/follow-up items
flagged in Gaps.

## Phase 1: Office model & membership

- [x] T001 `OfficeLocation` (`office_locations`) with per-office lunch defaults in both Prisma schemas
- [x] T002 `auth_access_user_offices` membership table + nullable preferred `office_location_id`
- [x] T003 Seed `default` office; backfill legacy records (menus/polls/food-selections/shopping-list/users)
- [x] T004 Office resolution services (`officeLocation.ts`, `officeContext.ts`); never trust regular-user office ids
- [x] T005 Tests: `office-location-service.test.ts`

## Phase 2: Scope menus & shopping list

- [x] T006 `menus.office_location_id` required; uniqueness `(office_location_id, name)`
- [x] T007 `shopping_list_items.office_location_id` required + index
- [x] T008 Office-scoped list/CRUD queries in `menu.ts` / `shoppingList.ts`

## Phase 3: Scope polls, food selections, orders, dashboard

- [x] T009 `polls.office_location_id` required; single-active-poll guard per office
- [x] T010 `food_selections.office_location_id` direct column (denormalized from poll)
- [x] T011 Office-scoped dashboard/history/analytics for regular users
- [x] T012 Per-office auto-start poll scheduling in `officePollSchedule.ts`
- [x] T013 Tests: `office-poll-schedule.test.ts` + per-office scoping in feature suites

## Phase 4: Office-aware SSE + admin selector

- [x] T014 SSE resolves office on `/api/events` open; `initial_state` + broadcasts office-scoped (`broadcast(event, payload, officeLocationId)`)
- [x] T015 Header office selector for global admins; persist selection locally; pass `officeLocationId` to REST/SSE
- [x] T016 Extend selector to multi-office regular users; validate against assigned set (`AdminOfficeContext.tsx`)
- [x] T017 Poll-start notifications target the poll office; global admins still included

## Phase 5: Migration hardening

- [x] T018 Staged migration (nullable → backfill → index/FK/unique → non-null)
- [x] T019 Require ≥1 office membership for approved non-admin users

## Identified Gaps

- ⚠️ **Transitional fallback**: office-less global admins fall back to the seeded
  `default` office. Prose says remove this once the admin selector (T015) is fully
  adopted — confirm it has actually been removed, not just superseded.
- ⚠️ **No office-scoped admin role**: only global admins exist (open question #6).
  Follow-up phase.
- ℹ️ **Verify**: explicit tests that SSE events do **not** leak across offices and
  that dashboard analytics exclude other offices (spec SC-002/SC-004) — asserted in
  prose testing requirements; confirm present in the suites.
- ℹ️ **Open questions** in `specs/old/multi-office.md` (#1–#6) record decisions, not
  all enforced in code — review before extending.

## Notes

- Run `./validate.ps1 all` before commit.
- Office context is resolved once and passed explicitly — keep it out of route glue.
