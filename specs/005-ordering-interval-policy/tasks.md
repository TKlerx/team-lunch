# Tasks: Office Ordering Interval Policy

**Input**: `specs/005-ordering-interval-policy/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/ordering-policy.md, quickstart.md.
**Tests**: Mandatory in every implementation task. No task is shipped until its focused tests and `pwsh -File ./validate.ps1 all` pass; update progress/discoveries afterward. Do not auto-commit without user authorization.
**Organization**: One unchecked task at a time, ordered by dependency and user story. T001–T011 are complete, validated, and committed at HEAD `3373283`. T012 scheduler integration is complete, validated, and uncommitted. Next task: T013 SSE availability/invalidation. FAIM updates are explicitly deferred for this session.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add interval/timezone/Monday fields, nullable Poll exception JSON, completion lookup index, and safe editable default backfill in `prisma/schema.prisma` and a new LF migration under `prisma/migrations/`; update office creation/default-upsert/seeds and fixture defaults in `src/server/services/officeLocation.ts` and `tests/server/helpers/db.ts` as required, apply migration and regenerate client, and test existing/new office defaults in `tests/server/office-location-service.test.ts`.
- [x] T002 Extend office settings, public availability, policy-warning, and admin exception contracts in `src/lib/types.ts` and serialization in `src/server/services/officeLocation.ts`; update affected test fixtures and add serialization/default coverage in `tests/server/office-location-service.test.ts` so all consumers typecheck.

## Phase 2: Foundational (Shared Decision)

- [x] T003 Implement validated office-local calendar/date-boundary helpers in `src/server/services/officeTime.ts` using native Date/Intl; add runnable tests in `tests/server/office-time.test.ts` for strict dates, Monday, unknown zones, year/leap rollover, DST midnight conversion, fractional offsets, and server/office timezone mismatch.
- [x] T004 Implement current-block/eligibility calculation, indexed completedAt existence query, before-anchor handling, Unrestricted short circuit, and reason/snapshot validation in `src/server/services/orderingPolicy.ts`; add `tests/server/ordering-policy.test.ts` for all five modes, Friday-to-Wednesday, empty elapsed blocks/no carryover, completion not placement, boundary equality, future anchors, exceptions/no future debt, and office isolation.

**Checkpoint**: One tested evaluator is available to creation, scheduling, and availability UI; no business policy is duplicated client-side.

## Phase 3: User Story 1 - Configure Office Policy (P1)

**Goal**: Admins save validated per-office settings and disable policy without losing the anchor.
**Independent Test**: Save/reload two differently configured offices, submit invalid settings, then disable/re-enable one office.

- [x] T005 [US1] Extend settings validation and atomic persistence in `src/server/services/officeLocation.ts`, thin forwarding in `src/server/routes/auth.ts`, and typed settings calls in `src/client/api.ts`; test exact enum/types, Monday/date/zone validation, older-payload preservation, future anchors, disabled-anchor retention, and authorization in `tests/server/office-location-service.test.ts` and focused route tests in `tests/server/ordering-policy-settings.test.ts`.
- [x] T006 [US1] Extend drafts/change detection/save payloads and native interval/date/timezone controls in `src/client/pages/Administration.tsx`; disable and explain the anchor in Unrestricted, retain its value, keep office timezone editable, and add save/reload/invalid-input/non-admin tests in `tests/client/Administration.test.tsx`.

## Phase 4: User Story 2 - Warn and Record Exceptions (P1)

**Goal**: Every manual new-lunch entry has a default-cancel warning and a durable authorized override.
**Independent Test**: Used-period normal/quick starts fail without a valid reason, cancel without side effects, then succeed with a server-attributed snapshot.

- [x] T007 [US2] Gate normal poll creation and auto-finished quick starts before all writes/timers in `src/server/services/pollCreation.ts` and `src/server/services/poll.ts`; pass server-derived manual/scheduled source and signed actor via `src/server/routes/polls.ts` and `src/server/routes/foodSelections.ts`, persist actual override JSON atomically, and cover stale preflight, invalid/forged actor payloads, existing non-overridable conflicts, no-side-effect rejection, and both entry paths in `tests/server/ordering-policy-starts.test.ts`.
- [x] T008 [US2] Add authenticated no-store public availability read in `src/server/routes/polls.ts` and typed availability/conflict/start payload handling in `src/client/api.ts`; add office/auth/error/privacy contract tests in `tests/server/ordering-policy-routes.test.ts` and `tests/client/ordering-policy-api.test.ts`.
- [x] T009 [US2] Add a reusable accessible policy warning in `src/client/components/OrderingPolicyNotice.tsx` and wire normal/quick starts in `src/client/components/PollIdleView.tsx`; use default-focused Cancel, Escape/dismiss cancellation, trimmed 1–500-character reason, no automatic resubmission, duplicate-submit protection, and refreshed server warning handling; cover both flows and zero calls on cancel in `tests/client/OrderingPolicyNotice.test.tsx` and `tests/client/PollIdleView.test.tsx`.
- [x] T010 [US2] Project original exception snapshots into authorized admin poll and food-selection REST detail/history in `src/server/services/poll.ts`, `src/server/services/foodSelection.ts`, `src/server/routes/polls.ts`, and `src/server/routes/foodSelections.ts`; prevent private JSON leaks through public formatters/SSE in `src/server/sse.ts`, and test admin visibility, non-admin omission, office isolation, and unchanged snapshots after edits in `tests/server/ordering-policy-history.test.ts`.
- [x] T011 [US2] Display admin-only exception details in existing poll detail rendering under `src/client/App.tsx` and `src/client/components/FoodSelectionCompletedView.tsx`, fetching authorized detail when public SSE lacks private fields; add admin/non-admin and unchanged historical-context coverage in `tests/client/OrderingPolicyHistory.test.tsx`.

## Phase 5: User Story 3 - Compliant Scheduled Starts (P1)

**Goal**: Automation skips used periods/future anchors and uses office-local schedules.
**Independent Test**: Run controlled scheduler checks before and after eligibility in differing office/server zones.

- [x] T012 [US3] Apply shared precheck and non-overridable creation recheck in `src/server/services/officePollSchedule.ts`, convert weekdays/finish times/day markers/activity windows to office-local time using `src/server/services/officeTime.ts`, and extend `tests/server/office-poll-schedule.test.ts` for skipped starts without notification/exception, fresh blocks, no carryover, Unrestricted, differing zones, and unchanged schedule/deduplication guards.

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

## Implementation Evidence

### T001 — 2026-10-01

- Added weekly/UTC/date defaults, interval/Monday database checks, nullable Poll exception JSON, and the office/status/completedAt index in additive migration `20261001120000_add_ordering_interval_policy`.
- Office create/default-upsert explicitly initialize the creation week's UTC Monday; existing default-office settings are preserved. The dynamic database default supports direct-create fixtures. No separate office seed path exists; `cleanDatabase()` already deletes offices, so no fixture reset change was necessary.
- `pnpm exec prisma migrate dev` initially reported P1001 with the dev database stopped. Started `docker compose up -d --wait db`; migration applied, but the command timed out at an extra-migration prompt due to PostgreSQL default normalization. Matched the canonical expression in Prisma; reran `pnpm exec prisma migrate dev --name add_ordering_interval_policy`, which confirmed full sync without another migration or reset.
- `pnpm exec prisma generate` passed. Dedicated `db-test` started with `pnpm db:test:up`; focused server tests deployed the migration automatically and passed all 11 tests, including pre-existing-row backfill, dynamic defaults, preserved edits, database checks, and index/column metadata.
- First `pwsh -File ./validate.ps1 all` passed all non-test gates but failed an unrelated Settings input-clear test. That client file passed all 11 tests in isolation; no unrelated code was changed. Aggregate rerun passed all gates, 82 files / 919 tests, with 87.71% line and 79.6% branch coverage.
- Refreshed the four unchanged agent-derived office-service dependency facts; `faim validate` passed with no errors/warnings. Scanner-owned and other pre-existing stale facts remain for selective refresh in T017.
- Policy enforcement and public serialization remain intentionally deferred to subsequent tasks; this is not a complete feature rollout. No commit created.

### T002 — 2026-10-01

- T001 committed as `4f568da` (`feat: add office ordering policy storage`) before beginning T002.
- Added shared interval, public availability, warning, and exception contracts in `src/lib/types.ts`. Office responses require the persisted settings; update requests keep new settings optional for older clients. Normal/quick-start requests have an optional justification, and poll/selection shapes have optional admin-only exception fields. No endpoint, validation, enforcement, private-data projection, or SSE behavior was enabled ahead of its task.
- Office serialization returns the stored interval/timezone and a `YYYY-MM-DD` anchor without converting the calendar date into the office zone. Tests cover all five interval choices, new/default offices, read/list/rename/update/deactivate paths, and retention under older settings payloads.
- Updated Administration/AuthGate typed fixtures. First aggregate run passed all 925 tests but failed the complexity ratchet because three new nullish fallback branches pushed each fixture builder over the threshold. Replaced them with defaults plus override spreads; baseline unchanged.
- `pnpm typecheck` passed; focused office-service tests passed 17/17; focused Administration/AuthGate tests passed 25/25. Final `pwsh -File ./validate.ps1 all` passed all gates, 82 files / 925 tests, with 87.74% line and 79.62% branch coverage.
- Refreshed five unchanged agent-derived office-service/shared-module facts; `faim validate` passed with no errors/warnings. Scanner-owned freshness work remains deferred to T017. T002 is not committed.

### T003 — 2026-10-01

- Confirmed T001/T002 are committed as `4f568da` and `2fcb568`; the working tree was clean before T003.
- Added native Date/Intl helpers in `src/server/services/officeTime.ts` for strict calendar dates (years 0001–9999), Monday/timezone validation, calendar-day arithmetic/differences, office-local date/weekday/hour/minute extraction, and local-day boundaries. No dependency, policy evaluator, settings enforcement, or scheduler wiring was added.
- Local-midnight conversion finds the first instant of the requested office date: skipped midnight advances to the first valid time, repeated midnight selects the earlier occurrence, and a wholly skipped date fails explicitly. Weekly boundaries are converted independently rather than adding elapsed 168-hour durations.
- `pnpm exec vitest run --project server tests/server/office-time.test.ts` passed 53/53 tests covering strict/impossible dates, Monday, unknown zones, year/leap rollover, 167/169-hour DST weeks, skipped/repeated midnight, fractional offsets, and three server timezone settings distinct from office timezones.
- `pwsh -File ./validate.ps1 all` passed every gate, 83 files / 978 tests, with 87.8% line and 79.76% branch coverage. No complexity baseline changes or validation bypasses.
- T003 is complete; T004 remains unchecked. No commit created.

### T004 — 2026-10-01

- T003 committed as `46743bf` (`feat: add office-local calendar helpers`) before starting this task; the pre-commit hook passed.
- Added `src/server/services/orderingPolicy.ts` with server-owned office-scoped evaluation, independently converted calendar-block boundaries, one indexed completion evidence lookup (`status=completed`, `completedAt` in `[start,end)`), future-anchor handling, and an Unrestricted short circuit. Invalid settings, clocks, unavailable offices, and DB failures propagate errors instead of fabricating eligibility.
- Added trimmed 1–500-character justification validation and a server-derived exception snapshot builder using the existing signed actor type. Missing reasons on noncompliance produce a typed 409 warning; malformed supplied reasons return 400. Eligible/Unrestricted decisions do not produce stale exceptions. Creation guards, route error forwarding, settings validation, scheduler wiring, and snapshot projections remain deferred to their tasks.
- `pnpm typecheck` passed. Focused `pnpm exec vitest run --project server tests/server/ordering-policy.test.ts tests/server/office-time.test.ts` passed 98/98 tests (45 evaluator/snapshot tests plus 53 calendar tests). Coverage includes all five modes, Friday-to-Wednesday, no carryover, completion versus placement, half-open boundary equality, future anchors, DST/year/leap rollover, office isolation, exceptions/no future debt, retained-history re-evaluation, validation failures, and immutable snapshot values.
- Initial focused runs exposed test-harness issues: duplicate office fixture names and Prisma proxy-method spies that require explicit call-through/restoration. Fixed only the new fixtures. Simplified optional completion branches and split oversized test groups so `pnpm complexity` passed without changing its baseline.
- `pwsh -File ./validate.ps1 all` passed all gates, 84 files / 1,023 tests, with 87.85% line and 79.87% branch coverage. No dependency, migration, validation bypass, or Phase 3 implementation was added.
- Phase 2 is complete. T005 remains unchecked; stopped before Phase 3. T004 is not committed.

### T005 — 2026-10-01

- Confirmed T001–T004 were committed and the working tree was clean before starting. Extended office settings validation using the existing shared request contract and `officeTime.ts` helpers; exact numeric 0/1/2/3/4 intervals, IANA zones, and strict Monday calendar dates are validated before the single atomic settings update. Future Mondays are accepted.
- Omitted policy fields preserve stored values. Unrestricted mode ignores incoming anchor edits, retains the stored anchor, and still validates timezone; re-enabling validates the effective anchor. Invalid policy fields do not update scheduling, duration, policy, or timestamps.
- The auth settings route already forwards the full shared request and enforces signed-session/global-admin authorization; reused it unchanged rather than adding redundant forwarding. Added the typed settings call in `src/client/api.ts`; Administration wiring remains T006. Existing admins can configure any addressed active office; office-scoped admin roles remain BACKLOG-004.
- Extended service tests and added focused settings-route tests for types/values, invalid dates/zones, future anchors, omission, disable/re-enable, authorization, missing/inactive offices, and office isolation. Focused tests passed 68/68; `pnpm typecheck` passed.
- First aggregate run passed all 1,074 tests and every gate except the test-group function-length ratchet. Split the new route test groups without changing the baseline. Final `pwsh -File ./validate.ps1 all` passed every gate, 85 files / 1,074 tests, with 87.84% line and 79.98% branch coverage.
- Selectively rehashed the four unchanged agent-derived office-service facts and recorded its calendar-helper dependency. `faim validate` passed with no errors/warnings; 153 stale derived facts remain (scanner-owned/pre-existing freshness work is deferred to T017, not silently rehashed). Refreshed continuity with `pnpm continuity:update` to point at T006.
- No UI, creation enforcement, scheduling enforcement, SSE invalidation, dependency, migration, or commit added. T006 remains unchecked.

### T006 — 2026-10-01

- Started from a clean working tree with T005 committed as `d9f4b5a`. Extended per-office drafts, change detection, native interval/date/timezone controls, and save payloads in `src/client/pages/Administration.tsx`, reusing `updateOfficeLocationSettings` and shared contracts. Exactly Unrestricted and 1/2/3/4 weeks are offered; invalid intervals, IANA timezones, and strict non-Monday/impossible dates block saving. Future Monday anchors are accepted.
- Unrestricted disables and explains the anchor, omits it from requests, and preserves its unsaved draft even after settings refreshes. Timezone remains independently editable/validated. Re-enabling validates the retained effective anchor; ignored anchor differences do not make Unrestricted settings dirty. Existing scheduling and duration settings are unchanged.
- Extended `tests/client/Administration.test.tsx` with 19 cases covering all interval save/reload paths, future anchors, changes/reversions, invalid inputs, disable/save/re-enable retention, unrestricted timezone editing, office isolation across refreshes, and non-admin behavior. Focused `pnpm exec vitest run --project client tests/client/Administration.test.tsx` passed 36/36 tests.
- First aggregate run exposed three new complexity/function-length warnings. Reduced the validation branch count and split controls/test groups without raising the baseline. Final `pwsh -File ./validate.ps1 all` passed all gates: 85 files / 1,093 tests, 87.99% line and 80.22% branch coverage.
- Refreshed scanner-owned project memory with `pnpm faim:deps`; reviewed and rehashed the two unchanged pre-existing mealFeatures agent facts. `faim validate` passed with no errors/warnings and `faim stale` reported no stale facts. Refreshed continuity docs with `pnpm continuity:update`.
- T006 is complete and uncommitted. Stopped before T007; no creation enforcement, warning dialogs, scheduler integration, availability UI, dependency, or migration added.

### T007 — 2026-10-01

- Started from a clean working tree with T005/T006 committed as `d9f4b5a`/`9d0d246`. Added one shared creation guard in `pollCreation.ts`, reusing the policy evaluator, reason validator, and snapshot builder immediately before normal/auto-finished Poll writes. Internal/legacy callers default to scheduled and cannot override; HTTP routes explicitly pass manual context from the signed actor and only the justification from the body.
- Missing reasons on policy conflicts return the existing typed 409 warning with current public availability; malformed supplied reasons return 400. Actual authorized manual exceptions are stored in the same Poll create statement. Eligible/Unrestricted starts omit snapshots, including stale justification submissions. Explicit public formatting keeps private exception JSON out of REST start/detail responses and SSE.
- Existing auth, active/tied poll, and ongoing-delivery conflicts remain non-overridable. Quick starts also check the existing active/overtime food-selection conflict before the Poll write, preventing an orphan exception poll on that rejection. No calendar logic, availability endpoint, client flow, admin history, scheduler integration, dependency, or migration was added.
- Added `tests/server/ordering-policy-starts.test.ts` (158 cases) for both paths, current-period/future-anchor warnings, overrides/validation, signed attribution/forged payloads, stale settings/completion/boundary changes, scheduled non-overrides, atomic snapshot writes/failures, privacy, and zero creation side effects on rejection. Final focused `pnpm exec vitest run --project server tests/server/ordering-policy-starts.test.ts` passed 158/158. Focused evaluator and existing food-selection service/routes also passed during iteration; the final aggregate includes all 158 new cases.
- First aggregate timed out during coverage and exposed four complexity-ratchet increases; kept creation APIs at five arguments and reduced route/error-forwarding complexity without changing the baseline. A subsequent aggregate found three existing multi-lunch history/retention fixtures now correctly blocked by the default weekly policy; set only those scenarios to Unrestricted. Final `pwsh -File ./validate.ps1 all` passed every gate: 86 files / 1,251 tests, 88.04% line and 80.56% branch coverage.
- Refreshed scanner-owned memory with `pnpm faim:deps`, reviewed/rehashed 60 unchanged agent facts, and recorded the shared creation-guard dependency without changing axioms. `faim validate` passed with no errors/warnings and `faim stale` reported no stale facts. Refreshed continuity docs with `pnpm continuity:update` to point at T008.
- T007 is complete and uncommitted. Stopped before T008; no commit authorized or created.

### T008 — 2026-10-01

- Started from clean HEAD `be0cd71` with T001–T007 committed. Added authenticated `GET /api/polls/ordering-policy` before the parameterized poll route, forwarding the existing office-context resolver and shared evaluator's public availability only. `Cache-Control: no-store` applies to success and error responses; evaluation failures remain errors, not fabricated eligibility.
- Added `fetchOrderingPolicy()` with existing office-context routing and browser `cache: 'no-store'`. Exported `OrderingPolicyWarningError` preserves the shared warning code/current availability plus existing Error message/status/body semantics. Normal and quick starts accept optional justification, retain older call signatures, and explicitly serialize only supported request fields using shared request contracts.
- Added 13 server route tests for signed sessions, disabled approval workflow, pending/blocked/stale sessions, assignment/membership/admin office resolution, isolation, all four statuses, static versus poll-id routing, cache headers, private snapshot/evidence omission, and evaluation failure. Added 22 client API tests for typed availability/warnings, office context, start payloads with/without reason, no retries, ordinary errors, non-JSON/network failures, and unchanged import violation wrapping. Existing 158 start-enforcement tests also passed; `pnpm typecheck` passed.
- First `pwsh -File ./validate.ps1 all` passed every gate except one new test-group function-length warning. Split test groups without changing coverage or the complexity baseline. Final aggregate passed all gates: 88 files / 1,286 tests, 88.19% line and 80.62% branch coverage.
- Refreshed scanner-owned dependencies with `pnpm faim:deps`, reviewed/rehashed 19 unchanged agent facts, and recorded the authenticated public endpoint/shared evaluator dependency without axiom changes. `faim validate` passed with no errors/warnings; `faim stale` reported no stale facts. Continuity docs refreshed with `pnpm continuity:update` to point at T009 and current HEAD `be0cd71`.
- No calendar logic, warning dialog, admin history view, scheduler integration, SSE availability/invalidation, availability UI, migration, or dependency was added. T008 is complete and uncommitted; stopped before T009. No commit authorized or created.

### T009 — 2026-10-01

- Started from clean HEAD `1b767e8` with T001–T008 committed; earlier continuity HEAD/uncommitted references were historical. Added `OrderingPolicyNotice.tsx` using the existing Modal focus trap/restoration, Cancel-first focus, Escape/backdrop cancellation, labelled justification, trimmed 1–500-character validation, and native Intl formatting of the exact server-provided next availability in its office timezone. Only public warning text/availability are rendered, including future-anchor warnings.
- Wired normal and quick starts through existing APIs and `OrderingPolicyWarningError`. Form inputs and separate menu-exclusion reasons survive warnings/cancellation/retry. Synchronous request guards prevent duplicate initial and justified requests. No warning automatically retries; each fresh server warning remounts the dialog with an empty reason and Cancel focus, requiring another explicit action. Pending retries disable submission/editing/dismissal; ordinary failures retain toast handling and successful starts retain existing behavior.
- Focused `pnpm exec vitest run --project client tests/client/OrderingPolicyNotice.test.tsx tests/client/PollIdleView.test.tsx` passed 46/46; `pnpm typecheck` passed. First aggregate exposed complexity increases; simplified API forwarding and split new test groups without raising the baseline. One subsequent aggregate timed out at four minutes during coverage; no surviving test process remained. Final `pwsh -File ./validate.ps1 all` passed every gate: 89 files / 1,323 tests, 88.34% line and 80.78% branch coverage.
- Refreshed scanner-owned memory using `node scripts/faim-scip-deps.mjs`, retaining unchanged source-record metadata/order to keep the diff selective; no axioms changed. `faim validate --strict` passed without errors/warnings. Refreshed continuity docs with `pnpm continuity:update` after marking T009 complete.
- No calendar-policy logic, admin exception history, scheduler integration, SSE availability/invalidation, landing availability/countdown, migration, or dependency was added. T009 is complete and uncommitted; stopped before T010. No commit authorized or created.

### T010 — 2026-10-01

- Started from clean HEAD `be21f58` with T001–T009 committed; prior continuity HEAD/uncommitted references are historical. Poll detail and completed food-selection history now project the original persisted snapshot only for signed admins after existing selected-office authorization. Added authenticated `GET /api/food-selections/:id` because no selection detail read existed; it uses the same office-scoped service query and shared response contract. Food selections read the snapshot from their originating Poll, without recomputation or duplicate persistence.
- Public formatters in `pollCreation.ts` and `sse.ts` already explicitly omit snapshots and remain unchanged. Start/active responses, mutation broadcasts, and initial SSE hydration stay public regardless of the initiating actor. Ordinary detail/history responses omit the field entirely; admins see null for lunches without exceptions. Existing global-admin office selection and non-admin office assignment rules are preserved.
- Added eight tests in `tests/server/ordering-policy-history.test.ts`: normal/quick origins, signed admin visibility, ordinary omission, unauthenticated rejection, office isolation, policy/profile edit immutability, unchanged used-period completion evidence, no retroactive exceptions, public formatters/start/active responses, active/completed initial SSE, and live start/completion privacy.
- Focused ordering-policy suites passed 179/179; existing SSE/authenticated-read suites passed alongside the new history suite, and typecheck passed. First aggregate passed tests but exposed one new route registration line-count warning; grouped history/detail routes using the existing registration pattern, without changing the baseline. Final `pwsh -File ./validate.ps1 all` passed all gates: 90 files / 1,331 tests, 88.36% line and 80.96% branch coverage.
- Refreshed scanner-owned dependencies and affected unchanged agent facts, preserving unaffected source metadata/order to avoid timestamp-only churn. Recorded the new authenticated detail endpoint; no axioms changed. `faim validate --strict` passed without errors/warnings and `faim stale` reported no stale facts. Refreshed continuity docs with `pnpm continuity:update` after marking T010 complete.
- T010 is complete and uncommitted. No T011 UI, scheduler changes, SSE availability events, landing availability/countdown, dependencies, or migrations were added. Stopped before T011; no commit authorized or created.

### T011 — 2026-10-01

- Started from clean T010 HEAD `9714a98`; continuity HEAD/uncommitted references were historical. Added admin-only exception display to live/historical poll routes in `src/client/App.tsx` and completed food-selection views. A shared `OrderingPolicyExceptionDetails` panel fetches the existing authorized detail endpoints with explicit office context and no-store, rather than inferring absence from public SSE or trusting unscoped shared history snapshots. No backend/public payload changes were needed.
- Displays only original stored reason, actor display snapshot, decision time, interval/timezone/anchor, violation, evaluated boundaries, next eligibility, and prior completion evidence. Dates use the stored timezone; future-anchor exceptions do not invent missing periods or evidence. Authoritative null renders nothing; loading/errors and omitted private fields are handled without synthetic exception data.
- Private detail state remounts synchronously on office/record/actor/auth-method changes, clears on admin/auth loss, and cancels late results after scope changes/unmount. Existing historical poll lookup is office/auth scoped and retains only public poll data. Profile edits and public SSE replacements do not recompute snapshots. No dependencies or generic cache/state framework added.
- Added `tests/client/OrderingPolicyHistory.test.tsx` with 25 tests covering admin/non-admin behavior, authorized REST hydration, unchanged historical values, ordinary lunches, future-anchor context, errors/omission/wrong IDs, and stale office/record/auth/unmount isolation. Focused client suites passed 83/83; typecheck passed. First aggregate exposed one test-group line-count warning; split groups without changing the ratchet baseline. Final `pwsh -File ./validate.ps1 all` passed all gates: 91 files / 1,356 tests, 88.44% line and 81.30% branch coverage.
- Refreshed affected scanner-owned dependencies with `node scripts/faim-scip-deps.mjs`, preserving unchanged fact order/source metadata to avoid timestamp-only churn. No axioms or unrelated domain facts changed. `faim validate --strict` passed without errors/warnings; `faim stale` reported no stale facts. Refreshed continuity docs with `pnpm continuity:update` after marking T011 complete.
- T011 is complete and uncommitted. Stopped before T012; no scheduler changes, SSE availability events, landing availability/countdown, migration, or dependency changes. No commit authorized or created.

### T012 — 2026-10-02

- Started from clean HEAD `3373283` with T001–T011 committed. Added the shared evaluator precheck to `officePollSchedule.ts`; used periods and future anchors skip before creation/announcement. Existing `createPollRecord` still performs its non-overridable scheduled recheck immediately before writing, protecting against settings/completion changes after precheck.
- Schedule weekdays, finish instants, daily creator markers, and half-open activity windows now use the office timezone through `officeTime.ts`. Added strict HH:mm-to-UTC conversion with native Date/Intl: repeated clocks choose the earlier instant; nonexistent clocks skip that scheduled start. Finish durations use elapsed time between actual instants across DST. Existing 60-minute window, five-minute minimum/duration validation, activity, active-lunch, and daily deduplication guards remain.
- Precheck/time conversion errors are caught per office, logged with office ID, and do not authorize creation or prevent subsequent offices from being checked. Office-list failures are also caught to avoid an unhandled scheduler-tick rejection.
- Expanded scheduler integration coverage for used periods/future anchors without notifications/timers/exceptions, fresh multiweek blocks/no carryover, Unrestricted, differing zones/local date bounds, DST clocks, schedule/duration/deduplication/ongoing guards, stale prechecks, and evaluator-failure isolation. Added pure clock validation/conversion tests in `tests/server/office-time.test.ts`. Tests freeze only Date so creation and scheduler decisions share the controlled clock without freezing network/timer machinery.
- `pnpm typecheck`, scoped ESLint on the four changed source/test files (zero warnings), `pnpm lint`, and `pnpm complexity` passed without raising the baseline. `git diff --check` passed. The isolated office-time suite passed 86/86 with Vitest's programmatic `startVitest` and `config: false`, avoiding DB-only setup; the reproducible command is in `quickstart.md`.
- Initial `pnpm exec vitest run --project server tests/server/office-poll-schedule.test.ts tests/server/office-time.test.ts tests/server/ordering-policy-starts.test.ts` aborted in global setup: PostgreSQL at localhost:55434 is unreachable. `pnpm db:test:up` could not start the dedicated database because the Docker daemon is unavailable. No application database was substituted or reset.
- Initial `pwsh -File ./validate.ps1 all` passed text-format, typecheck, lint, architecture, complexity, function-size, duplication, Semgrep, and production audit. Tests/coverage aborted for the same unavailable PostgreSQL; that attempt produced no valid aggregate coverage result. T012 was left unchecked pending Docker startup, `pnpm db:test:up`, and successful focused/aggregate reruns.
- After the user started Docker, `pnpm db:test:up` succeeded with a healthy dedicated test database. The focused scheduler/calendar/creation command passed 278/278 (34 scheduler, 86 office-time, 158 ordering-policy-start tests). Final `pwsh -File ./validate.ps1 all` passed every gate: 91 files / 1,420 tests, 88.49% line and 81.43% branch coverage. The earlier environment blocker is resolved; T012 is complete and uncommitted.
- Updated status/continuity and scheduled-poll user documentation. Stopped before T013. No dependencies, migrations, commits, or FAIM changes; memory refresh/validation is deferred at the user's request.

## Planning Validation

The planning phase produced 17 uniquely numbered tasks with concrete paths and
US labels on user-story tasks. Each implementation task names its tests.
Current completion and validation status is tracked above.
