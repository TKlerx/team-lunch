# Tasks: Office Ordering Interval Policy

**Input**: `specs/005-ordering-interval-policy/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/ordering-policy.md, quickstart.md.
**Tests**: Mandatory in every implementation task. No task is shipped until its focused tests and `pwsh -File ./validate.ps1 all` pass; update progress/discoveries afterward. Do not auto-commit without user authorization.
**Organization**: One unchecked task at a time, ordered by dependency and user story. All tasks below are pending; planning is complete, implementation has not started.

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add interval/timezone/Monday fields, nullable Poll exception JSON, completion lookup index, and safe editable default backfill in `prisma/schema.prisma` and a new LF migration under `prisma/migrations/`; update office creation/default-upsert/seeds and fixture defaults in `src/server/services/officeLocation.ts` and `tests/server/helpers/db.ts` as required, apply migration and regenerate client, and test existing/new office defaults in `tests/server/office-location-service.test.ts`.
- [ ] T002 Extend office settings, public availability, policy-warning, and admin exception contracts in `src/lib/types.ts` and serialization in `src/server/services/officeLocation.ts`; update affected test fixtures and add serialization/default coverage in `tests/server/office-location-service.test.ts` so all consumers typecheck.

## Phase 2: Foundational (Shared Decision)

- [ ] T003 Implement validated office-local calendar/date-boundary helpers in `src/server/services/officeTime.ts` using native Date/Intl; add runnable tests in `tests/server/office-time.test.ts` for strict dates, Monday, unknown zones, year/leap rollover, DST midnight conversion, fractional offsets, and server/office timezone mismatch.
- [ ] T004 Implement current-block/eligibility calculation, indexed completedAt existence query, before-anchor handling, Unrestricted short circuit, and reason/snapshot validation in `src/server/services/orderingPolicy.ts`; add `tests/server/ordering-policy.test.ts` for all five modes, Friday-to-Wednesday, empty elapsed blocks/no carryover, completion not placement, boundary equality, future anchors, exceptions/no future debt, and office isolation.

**Checkpoint**: One tested evaluator is available to creation, scheduling, and availability UI; no business policy is duplicated client-side.

## Phase 3: User Story 1 - Configure Office Policy (P1)

**Goal**: Admins save validated per-office settings and disable policy without losing the anchor.
**Independent Test**: Save/reload two differently configured offices, submit invalid settings, then disable/re-enable one office.

- [ ] T005 [US1] Extend settings validation and atomic persistence in `src/server/services/officeLocation.ts`, thin forwarding in `src/server/routes/auth.ts`, and typed settings calls in `src/client/api.ts`; test exact enum/types, Monday/date/zone validation, older-payload preservation, future anchors, disabled-anchor retention, and authorization in `tests/server/office-location-service.test.ts` and focused route tests in `tests/server/ordering-policy-settings.test.ts`.
- [ ] T006 [US1] Extend drafts/change detection/save payloads and native interval/date/timezone controls in `src/client/pages/Administration.tsx`; disable and explain the anchor in Unrestricted, retain its value, keep office timezone editable, and add save/reload/invalid-input/non-admin tests in `tests/client/Administration.test.tsx`.

## Phase 4: User Story 2 - Warn and Record Exceptions (P1)

**Goal**: Every manual new-lunch entry has a default-cancel warning and a durable authorized override.
**Independent Test**: Used-period normal/quick starts fail without a valid reason, cancel without side effects, then succeed with a server-attributed snapshot.

- [ ] T007 [US2] Gate normal poll creation and auto-finished quick starts before all writes/timers in `src/server/services/pollCreation.ts` and `src/server/services/poll.ts`; pass server-derived manual/scheduled source and signed actor via `src/server/routes/polls.ts` and `src/server/routes/foodSelections.ts`, persist actual override JSON atomically, and cover stale preflight, invalid/forged actor payloads, existing non-overridable conflicts, no-side-effect rejection, and both entry paths in `tests/server/ordering-policy-starts.test.ts`.
- [ ] T008 [US2] Add authenticated no-store public availability read in `src/server/routes/polls.ts` and typed availability/conflict/start payload handling in `src/client/api.ts`; add office/auth/error/privacy contract tests in `tests/server/ordering-policy-routes.test.ts` and `tests/client/ordering-policy-api.test.ts`.
- [ ] T009 [US2] Add a reusable accessible policy warning in `src/client/components/OrderingPolicyNotice.tsx` and wire normal/quick starts in `src/client/components/PollIdleView.tsx`; use default-focused Cancel, Escape/dismiss cancellation, trimmed 1–500-character reason, no automatic resubmission, duplicate-submit protection, and refreshed server warning handling; cover both flows and zero calls on cancel in `tests/client/OrderingPolicyNotice.test.tsx` and `tests/client/PollIdleView.test.tsx`.
- [ ] T010 [US2] Project original exception snapshots into authorized admin poll and food-selection REST detail/history in `src/server/services/poll.ts`, `src/server/services/foodSelection.ts`, `src/server/routes/polls.ts`, and `src/server/routes/foodSelections.ts`; prevent private JSON leaks through public formatters/SSE in `src/server/sse.ts`, and test admin visibility, non-admin omission, office isolation, and unchanged snapshots after edits in `tests/server/ordering-policy-history.test.ts`.
- [ ] T011 [US2] Display admin-only exception details in existing poll detail rendering under `src/client/App.tsx` and `src/client/components/FoodSelectionCompletedView.tsx`, fetching authorized detail when public SSE lacks private fields; add admin/non-admin and unchanged historical-context coverage in `tests/client/OrderingPolicyHistory.test.tsx`.

## Phase 5: User Story 3 - Compliant Scheduled Starts (P1)

**Goal**: Automation skips used periods/future anchors and uses office-local schedules.
**Independent Test**: Run controlled scheduler checks before and after eligibility in differing office/server zones.

- [ ] T012 [US3] Apply shared precheck and non-overridable creation recheck in `src/server/services/officePollSchedule.ts`, convert weekdays/finish times/day markers/activity windows to office-local time using `src/server/services/officeTime.ts`, and extend `tests/server/office-poll-schedule.test.ts` for skipped starts without notification/exception, fresh blocks, no carryover, Unrestricted, differing zones, and unchanged schedule/deduplication guards.

## Phase 6: User Story 4 - Landing Availability and Countdown (P1)

**Goal**: Selected-office availability stays visible and fresh without exposing audit metadata.
**Independent Test**: Complete a lunch, remotely change policy, switch offices and cross a boundary without reload.

- [ ] T013 [US4] Include public policy availability in initial hydration and emit scoped `ordering_policy_changed` after relevant settings saves/arrival confirmation in `src/server/sse.ts`, `src/server/services/officeLocation.ts`, and `src/server/services/foodSelection.ts`; add scoped hydration/invalidation/privacy tests in `tests/server/ordering-policy-realtime.test.ts` and document the event in `specs/realtime-events.md`.
- [ ] T014 [US4] Add office-scoped availability state/refetch handling in `src/client/context/AppContext.tsx`, `src/client/hooks/useSSE.ts`, and a small `src/client/hooks/useOrderingPolicy.ts` if needed; refresh on invalidation/reconnect/office change and discard old-office responses, with cleanup/error/loading tests in `tests/client/useOrderingPolicy.test.tsx`.
- [ ] T015 [US4] Show prominent Ready to start/Unrestricted/countdown with exact office-local target in `src/client/components/PollIdleView.tsx` or the shared `src/client/components/OrderingPolicyNotice.tsx`; reuse `src/client/hooks/useCountdown.ts` timing, add multi-day formatting and expiry recheck without claiming automatic poll creation, and test ticks/rollover/future anchor/unavailable state/office switch in `tests/client/PollIdleView.test.tsx`.

## Phase 7: Polish and Cross-Cutting Validation

- [ ] T016 Run scenarios and focused commands in `specs/005-ordering-interval-policy/quickstart.md`, then `pwsh -File ./validate.ps1 all`; fix feature-caused failures, verify accessibility/privacy and no new runtime dependency, and record actual command results/blockers in `specs/005-ordering-interval-policy/tasks.md`.
- [ ] T017 Update `USER_DOCUMENTATION.md`, `specs/OVERVIEW.md`, and implementation discoveries in `AGENTS.md`; selectively refresh affected `.faim` derived facts without changing axioms, run FAIM validation, and regenerate `specs/CURRENT-WORK.md`/`specs/RECONCILIATION.md` with `pnpm continuity:update` after task completion.

## Dependencies and Execution Order

```text
T001 → T002 → T003 → T004
  → US1: T005 → T006
  → US2: T007 → T008 → T009 → T010 → T011
  → US3: T012 (requires T007)
  → US4: T013 → T014 → T015 (requires T008)
  → T016 → T017
```

Work sequentially in this repository. US2/US3/US4 share creation/UI/state files,
so no task is marked parallel-safe for concurrent implementation. Independent
server/client test execution may run in parallel after each edit set is stable.
For example, US1 server settings checks and Administration component checks can
run together; US2 creation/privacy and warning-dialog checks can run together.

## Implementation Strategy

Deliver validated settings and the shared evaluator first, then all manual
entry-path guards/exceptions, compliant automation, and live availability.
US1 is an independently testable configuration increment, but the complete
policy MVP needs US1–US4 before rollout. Do not enable a partial policy rollout
that leaves quick starts or automatic creation unguarded.

## Planning Validation

17 uniquely numbered tasks; all are unchecked, include concrete paths, and
user-story tasks have US labels. Each implementation task names its tests.
No application implementation or runtime validation has occurred in this phase.
