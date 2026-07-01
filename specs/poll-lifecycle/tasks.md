---
description: "Migrated task list — Poll Lifecycle (already implemented)"
---

# Tasks: Poll Lifecycle

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — all tasks reflect shipped code and are marked `[x]`.

## Phase 1: Setup (Data + Shared Types)

- [x] T001 Define `Poll`, `PollVote`, `PollExcludedMenu`, `AuditLog` models in `prisma/schema.prisma`
- [x] T002 Add cleanup for poll tables in `tests/server/helpers/db.ts`
- [x] T003 [P] Define shared `Poll` type in `src/lib/types.ts`

## Phase 2: Foundational

- [x] T004 SSE `broadcast(event, payload, officeLocationId)` + `formatPoll` in `src/server/sse.ts`
- [x] T005 Office resolution + default food-selection duration in `src/server/services/officeLocation.ts`
- [x] T006 In-process expiry timer map (`scheduleTimer`/`clearTimer`/`clearAllTimers`) in `src/server/services/poll.ts`

## Phase 3: User Story 1 — Start & run poll (P1)

- [x] T007 [US1] `startPoll` — validate description/duration, exclusions, single-poll + ongoing-order guards, create + broadcast `poll_started`
- [x] T008 [US1] `castVote` / `withdrawVote` / `withdrawAllVotes` with expiry + duplicate guards, broadcast vote events
- [x] T009 [US1] `endPoll` — count votes, single-winner vs tie, persist + broadcast `poll_ended`
- [x] T010 [US1] `createAutoFinishedPoll` — single-menu skip-vote path
- [x] T011 [US1] Routes `POST /api/polls`, `/votes`, vote withdrawal in `src/server/routes/polls.ts`
- [x] T012 [US1] Client `PollIdleView` + `PollActiveView` (countdown ring, live histogram, voter list)
- [x] T013 [US1] Tests: `poll-service.test.ts`, `poll-routes.test.ts`, `poll-timer.test.ts`

## Phase 4: User Story 2 — Tie resolution (P1)

- [x] T014 [US2] `extendPoll` (5/10/15/30) + reschedule timer + `poll_extended`
- [x] T015 [US2] `randomWinner` — uniform pick among tied tops, `winner_selected_randomly`
- [x] T016 [US2] Auto-start food selection after finish (`autoStartFoodSelectionForPoll`)
- [x] T017 [US2] Routes `POST /api/polls/:id/extend`, `/random-winner` with admin/creator authz
- [x] T018 [US2] Client `PollTiedView` + `PollFinishedView` (random-winner label)
- [x] T019 [US2] Tests: tie + extension + authz in `poll-authz.test.ts`, `poll-service.test.ts`

## Phase 5: User Story 3 — Early end & abort (P2)

- [x] T020 [US3] `endPoll(allowPremature)` → `ended_prematurely`, `poll_closed_early` audit
- [x] T021 [US3] `abortPoll` → `status=aborted`, `poll_killed_by_admin` audit
- [x] T022 [US3] `updateActivePollTimer` — admin manual timer adjust
- [x] T023 [US3] Routes + confirmation UI; tests in `poll-authz.test.ts`

## Phase 6: Cross-cutting

- [x] T024 Poll-start email to approved users (`notifyRegisteredUsersAboutPollStart`, best-effort)
- [x] T025 Office-scoping on all queries
- [x] T026 `initial_state` SSE payload includes current poll

## Identified Gaps

- ⚠️ **Multi-node**: expiry timers are in-process (`Map` in `poll.ts`). A second
  server instance would not fire timers for polls it didn't create. Out of scope
  today (single-instance), but note before horizontal scaling.
- ⚠️ **Audit best-effort**: `poll_closed_early` / `poll_killed_by_admin` swallow
  errors by design — no test asserts the failure path is silent. Low risk.
- ℹ️ **Verify**: confirm a test covers `createAutoFinishedPoll` (single-menu
  instant finish); not obvious from the service file alone.

## Notes

- Run `pwsh -File ./validate.ps1 all` before marking the task shipped; `full` adds Playwright E2E.
- Service logic precedes routes; routes stay thin and own authz.
