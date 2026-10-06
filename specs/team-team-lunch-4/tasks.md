# Tasks: Office Duration Defaults

**Input**: Accepted design documents in `specs/team-team-lunch-4/`.

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/durations.md](contracts/durations.md), [quickstart.md](quickstart.md).

**Tests**: Mandatory under constitution principle V and FR-015. Each implementation task includes focused tests: add the failing case first, implement in the same task, then pass focused tests and `rtk proxy pwsh -NoProfile -File validate.ps1 all` before checking it complete. Do not leave a shipped test-only task red. Full delivery validation is T019.

**Organization**: Story phases are independently testable increments. All tasks start unchecked; no reviewer checklist is modified.

## Format: `[ID] [P?] [Story] Description`

- `[P]` identifies independent work in different files after its stated prerequisites; repository policy still requires executing one checked task at a time. These are planning opportunities, not authorization to delegate or run competing DB suites.
- `[US1]`, `[US2]`, `[US3]` map to accepted spec stories.
- Server business logic belongs in services; shared contracts belong in `src/lib/`; reuse the single Prisma client, existing native controls and existing test fixtures.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare existing tooling without scaffolding or external infrastructure changes.

- [ ] T001 Confirm the existing scripts and dependency installation in `package.json`, `pnpm-lock.yaml`, `tests/server/setup.ts` and `specs/team-team-lunch-4/quickstart.md` support focused tests; resolve the reported pnpm `ERR_SQLITE_ERROR` only through permitted checkout-local tooling repair before validation. Use explicit `SPECIFY_FEATURE_DIRECTORY=specs/team-team-lunch-4`, controller-provided disposable test PostgreSQL and `VITEST_MAX_WORKERS=1`; preserve real-mail suppression and data-safety guards. Escalate missing credentials/access or host changes to the controller rather than starting infrastructure or running host checks.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared numeric contract used by settings and starts.

- [ ] T002 Add focused predicate/preset checks in `tests/server/office-location-service.test.ts`, then introduce minimal shared arrays/predicates in `src/lib/durations.ts` and extend `OfficeLocation`, optional settings request, initial hydration and typed settings-event contracts in `src/lib/types.ts`. Quote and enforce model constraints: poll default “Integer multiples of 5, inclusive 5–720”; food default “Integer 1 or multiples of 5, inclusive 5–60”. Keep exact poll presets 5/10/15/30/45/60/120/240/480/720 and food presets 1/5/10/15/20/25/30/45/60; reject strings, null, booleans, containers, fractions and non-finite numbers without coercion. Update affected typed fixtures without weakening assertions; no new dependency or generic duration framework.

**Checkpoint**: Shared contracts compile and predicate checks pass; foundation blocks all stories.

## Phase 3: User Story 1 - Configure independent office defaults (Priority: P1) - MVP

**Goal**: Administrators persist, display and synchronize two independent office defaults.

**Independent Test**: Upgrade existing offices safely, create a new office, save A=15/45 and B=60/1, reload and switch repeatedly. Both values remain office-isolated; unauthorized/invalid writes change nothing.

### Tests and implementation for User Story 1

- [ ] T003 [US1] Add migration/default tests in `tests/server/office-location-service.test.ts`, then add `OfficeLocation.defaultPollDurationMinutes` mapped to `default_poll_duration_minutes` in `prisma/schema.prisma` and the new additive `prisma/migrations/20261005000000_office_poll_duration_default/migration.sql` (choose an unused later timestamp if that name is occupied). Enforce “New integer `default_poll_duration_minutes`; JSON number”, “5 for old/new/direct-created offices” and “Integer multiples of 5, inclusive 5–720”; storage is non-null with database default 5. Apply the new SQL to representative pre-upgrade rows/history in an isolated disposable schema and compare preserved food/schedule/policy/history values; assert qualified metadata and direct/service/default-office-upsert creation, including upsert preservation of edited defaults. Run `rtk pnpm prisma migrate dev` only against controller-approved disposable development PostgreSQL before server tests, regenerate the client, and leave generated output uncommitted. Never reset data or edit applied SQL; no new model needs a cleanup entry.
- [ ] T004 [US1] Extend settings/config contract, persistence, signed-admin and two-office tests in `tests/server/office-location-service.test.ts`, `tests/server/auth-routes-config.test.ts` and `tests/server/ordering-policy-settings.test.ts`; then extend formatting, creation/upsert and atomic settings validation/write in `src/server/services/officeLocation.ts` and the existing boundary in `src/server/routes/auth.ts` if needed. Enforce food model constraints “Existing saved value; 30 for new offices” and “Integer 1 or multiples of 5, inclusive 5–60”; preserve the poll default on request omission but reject explicit invalid values. Validate every field before one write, preserve existing required scheduler fields/optional policy semantics, return both defaults and prove invalid writes change no related setting or other office. Missing/expired/member sessions and caller-supplied roles cannot authorize writes.
- [ ] T005 [P] [US1] After T004, add Administration preset, save/reload/remount, per-office draft and refresh tests in `tests/client/Administration.test.tsx`; then extend office-keyed draft initialization/change detection/save and labeled native selects in `src/client/pages/Administration.tsx`. Reuse shared presets, expose exactly the ten poll choices and add only 45/60 to all food-default editors while retaining 1; preserve and visibly represent stored valid off-preset values without silently changing them. Confirm A=15/45 and B=60/1 survive reload/switch and unsaved drafts survive config refresh.
- [ ] T006 [P] [US1] After T004, add settings-event and hydration tests in `tests/server/sse.test.ts`, `tests/server/sse-integration.test.ts` and `tests/server/ordering-policy-realtime.test.ts`; then extend `src/server/services/officeLocation.ts` and `src/server/sse.ts` using the existing late-bound notification pattern. Read both defaults together for `initial_state` with valid fallback 5/30; emit `office_settings_changed` with office ID and both committed values only after an effective duration change, scoped to that office. Invalid/unauthorized/unchanged duration writes emit no duration event; duration-only changes do not emit `ordering_policy_changed`. Avoid circular runtime imports and private policy evidence.
- [ ] T007 [US1] After T005–T006, add reducer/listener tests in `tests/client/app-context.test.ts` and `tests/client/useSSE.test.ts`; then extend `src/client/context/AppContext.tsx` and `src/client/hooks/useSSE.ts` to hydrate/update both defaults through the existing connection. Require current office/auth/connection and payload office matching; update defaults only. Overlay the current connection's latest settings event on later stale hydration; clear it on reconnect and office/auth cleanup so disconnected saves appear in fresh hydration. Prove wrong-office/old-source updates are ignored and rounds, policy availability and ETA stay unchanged.

**Checkpoint**: US1 passes independently. This MVP configures/synchronizes defaults; US2 supplies the changed start behavior and US3 completes acceptance hardening.

## Phase 4: User Story 2 - Start lunch using the intended duration (Priority: P1)

**Goal**: Fresh forms use selected-office defaults; explicit one-start choices win; every food start supports the extended range.

**Independent Test**: With saved poll default 15, start an explicit 30-minute poll without changing settings. Verify default-driven food starts at saved 45/60, plus office switching and policy retry preserving the correct pending choice.

### Tests and implementation for User Story 2

- [ ] T008 [US2] Extend duration/timestamp tests in `tests/server/food-selection-service.test.ts` and `tests/server/food-selection-routes.test.ts`, then reuse the shared strict food predicate in a callable service validator in `src/server/services/foodSelection.ts` for every normal start caller. Accept integer 1 or multiples of 5 through 60, including 35/40/50/55; reject malformed/fractional/out-of-range values before writes/events. Replace obsolete 45-minute rejection with positive 45/60 plus 65 rejection while retaining unrelated assertions, auth, office/lifecycle guards, extensions and ETA behavior.
- [ ] T009 [US2] After T008, add invalid quick-start no-partial-write/no-start-event and valid 1/45/60 cases in `tests/server/food-selection-routes.test.ts`; then call the food service validator from `src/server/routes/foodSelections.ts` before `createAutoFinishedPoll`. Retain validation inside the normal service, existing signed authorization, office checks, active/overtime checks and immediate ordering-policy recheck. Invalid durations must create neither originating poll nor selection; do not add a generalized rollback mechanism for unrelated failures.
- [ ] T010 [P] [US2] After T009, extend winning-poll/eligible winner-resolution auto-start tests in `tests/server/poll-service.test.ts`, then adjust `src/server/services/poll.ts` so enabled automatic starts use actual saved office food defaults (A=45, B=60), retaining explicit test-runtime zero opt-out and unavailable-default fallback. Verify exact ordering timestamps and office ownership through applicable callers; restore environment/mocks afterward and keep real-mail suppression. A positive global-env-only test is insufficient evidence of office-default behavior.
- [ ] T011 [P] [US2] After T009 and US1, add initialization/delayed-default/override/office-auth-switch/policy-retry/fresh-form tests in `tests/client/PollIdleView.test.tsx`; then replace the literal manual poll initial duration in `src/client/components/PollIdleView.tsx` with office-keyed pending intent. Model constraints are “Explicit duration or null” and “Explicit choice if present, otherwise office default”. Untouched forms follow delayed/same-office defaults; explicit choices survive refresh and interval-policy retry, submit unchanged without settings writes, and clear after successful start or office/auth change. Preserve description/exclusions/warning and synchronous duplicate-request protection; poll start validation remains 5–720 multiples of 5.
- [ ] T012 [P] [US2] After T011, extend single-menu quick-start tests in `tests/client/PollIdleView.test.tsx`, then reuse food presets in `src/client/components/PollIdleView.tsx` to retain all prior choices and add 45/60. Use office food default for untouched fresh controls (including late arrival), preserve explicit choice across same-office updates/retries and discard it on office/auth switch. Show legal off-preset saved values faithfully and assert submitted default/override without changing office settings.
- [ ] T013 [P] [US2] After T011, extend finished-poll preset/custom-input tests in `tests/client/PollFinishedView.test.tsx` and existing dropdown-caller tests in `tests/client/PollTiedView.test.tsx`, `tests/client/FoodSelectionActiveView.test.tsx` and `tests/client/FoodDeliveryView.test.tsx`; then reuse food presets/validation in `src/client/components/PollFinishedView.tsx` and validate complete custom food text through `src/client/components/MinutesActionDropdown.tsx`. Add 45/60, retain 1 and existing presets, allow valid off-preset food numbers, reject `45x`/`45.5` rather than prefix-parsing them as 45, and update obsolete start error text. Preserve existing valid extension/remaining-time/ETA inputs and their separate limits.

**Checkpoint**: US2 passes independently with persisted defaults; existing running timers and settings remain unchanged by explicit starts.

## Phase 5: User Story 3 - Keep durations valid and synchronized (Priority: P2)

**Goal**: Complete strict boundary, realtime race, access/isolation and timing-regression acceptance using existing suites.

**Independent Test**: Two A sessions receive A's saved defaults while B remains unchanged; reload/reconnect/switch shows saved values. All duration matrices reject malformed requests atomically and preserve independent lunch timing rules.

### Tests and implementation for User Story 3

- [ ] T014 [P] [US3] After US2, complete settings/service/HTTP validation matrices in `tests/server/office-location-service.test.ts`, `tests/server/food-selection-service.test.ts`, `tests/server/food-selection-routes.test.ts`, `tests/server/poll-service.test.ts` and `tests/server/poll-routes.test.ts`, fixing only accepted-scope gaps in `src/lib/durations.ts`, `src/server/services/officeLocation.ts`, `src/server/services/foodSelection.ts` and `src/server/services/pollCreation.ts`. Cover all food multiples 5–60 plus 1 and poll multiples 5–720, representative non-preset values, food 0/-5/2/4/7/65 and poll 0/1/7/725, fractions, numeric/blank/partial strings, null, booleans, arrays/objects and service-level non-finite values. Assert 400 errors and unchanged whole settings/zero start writes/events; keep omitted poll-field compatibility.
- [ ] T015 [P] [US3] After US2, complete two-A/one-B settings-event, initial/reload/reconnect, disconnected-save and event-before-hydration race acceptance in `tests/server/sse-integration.test.ts`, `tests/server/ordering-policy-realtime.test.ts`, `tests/client/useSSE.test.ts` and `tests/client/app-context.test.ts`. Fix accepted-scope gaps in `src/server/sse.ts`, `src/client/hooks/useSSE.ts` and `src/client/context/AppContext.tsx`; assert stale office/auth/source rejection, fresh reconnect hydration, committed defaults winning delayed hydration, no duplicate SSE connection, and no running-round/policy/ETA mutations. Do not claim these tests constitute manual multi-browser verification.
- [ ] T016 [P] [US3] After US2, extend signed settings/start authorization and office-isolation regressions in `tests/server/auth-routes-config.test.ts`, `tests/server/ordering-policy-settings.test.ts`, `tests/server/poll-authz.test.ts`, `tests/server/food-selection-authz.test.ts` and `tests/server/ordering-policy-starts.test.ts`. Prove missing/expired/member sessions retain existing access behavior, caller roles cannot authorize, cross-office requests cannot modify/start the wrong office, and policy warning/justification/completed-lunch guards survive new defaults. Fix gaps at existing service/boundary owners only; no new roles or auth bypass.
- [ ] T017 [P] [US3] After US2, add default-edit timing regressions in `tests/server/office-poll-schedule.test.ts`, `tests/server/poll-timer.test.ts` and `tests/server/food-selection-timer.test.ts`, and exercise existing `tests/client/PollTiedView.test.tsx`, `tests/client/FoodSelectionActiveView.test.tsx` and `tests/client/FoodDeliveryView.test.tsx`. Assert saved manual poll defaults do not replace scheduled office-local finish-time/DST semantics, edits never retime active rounds, and extensions/remaining-time/delivery ETA retain independent rules. Fix only feature-caused regressions in existing owners; do not redesign `src/server/services/officePollSchedule.ts`.

**Checkpoint**: All three stories meet their independent criteria and retain existing authorization/lifecycle/timing behavior.

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Update obsolete current food-start cap statements in `AGENTS.md` and `specs/food-selection/spec.md`; add narrow supersession links in `specs/old/food-selection-lifecycle.md` and `specs/old/app-navigation.md` where archived requirements should remain readable. Verify existing BACKLOG-010 intake in `specs/BACKLOG.md`. Search repository documentation for remaining obsolete start caps, distinguish still-valid extension/ETA limits, and preserve accepted `specs/team-team-lunch-4/spec.md`, `specs/team-team-lunch-4/plan.md`, unrelated artifacts and reviewer checklists; preserve UTF-8 without BOM and LF.
- [ ] T019 Execute all twelve acceptance scenarios in `specs/team-team-lunch-4/quickstart.md` using existing focused suites, then pass `rtk proxy pwsh -NoProfile -File validate.ps1 all` and `rtk proxy pwsh -NoProfile -File validate.ps1 full` with explicitly targeted controller-provided dedicated test PostgreSQL and record command outcomes/scenario evidence in `specs/team-team-lunch-4/tasks.md`. Preserve assertions, coverage/security/audit/data-safety gates and pinned Trivy/Playwright; distinguish general E2E smoke from feature-specific manual verification. No test disabling, timeout/assertion weakening or bypass. Missing access/host/infrastructure requirements go to the controller; report actionable logs for locally repairable failures and do not mark delivery complete until both gates pass.
- [ ] T020 Refresh `specs/CURRENT-WORK.md` and `specs/RECONCILIATION.md` through `rtk pnpm continuity:update` (`scripts/update-continuity.js`) after task progress; review snapshot changes, task completion and UTF-8/LF. Record actual operational discoveries in `AGENTS.md` only when learned. A direct Node generator fallback may refresh snapshots but does not prove pnpm/all/full validation passed. Leave branches, commits, pushes, provider interactions and merge to the controller.

## Dependencies & Execution Order

### Phase and task dependencies

```text
T001 -> T002 -> T003 -> T004 -> {T005, T006} -> T007  (US1)
US1 -> T008 -> T009 -> {T010, T011} -> {T012, T013}   (US2)
US2 -> {T014, T015, T016, T017}                      (US3)
US3 -> T018 -> T019 -> T020                         (delivery)
```

- T010 and T011 are independent after T009; both must finish before US2 completion. T012/T013 require T011 and their existing US1/T008 foundation; they need no new auto-start code from T010.
- US1 is the MVP; US2 depends on persisted/synchronized defaults, and US3 validates the integrated result. Do not falsely describe these stories as independent implementation tracks.
- Before any implementation, inspect the touched source and all callers; reuse what already exists. Add failing focused checks first, implement, run focused checks and the mandatory all gate, then check that task. Execute one task at a time under AGENTS.md; any transient red test work belongs to that same task.
- No full gate is required for task generation itself: no implementation ships and task hooks register no mandatory CI command. Both delivery gates remain explicit T019 requirements.

### Parallel opportunities and per-story examples

These are dependency/file-independence examples for planning only; actual execution remains sequential under repository policy. DB test execution is serial even if test authoring could be independent.

| Story | Ready after | Example independent work | Shared-file restrictions |
|---|---|---|---|
| US1 | T004 | T005 Administration tests/UI; T006 server settings-event tests/SSE | T007 waits for both; do not run DB suites concurrently |
| US2 | T009 | T010 poll-service automatic default flow; T011 PollIdleView manual form | T012 waits for T011 because both edit PollIdleView |
| US2 | T011 | T012 quick-start UI; T013 finished-poll/dropdown UI | T013 includes other dropdown callers; do not overlap their later regression edits |
| US3 | US2 complete | T014 numeric boundary suites; T015 SSE lifecycle suites; T016 auth/isolation suites; T017 timing suites | Changes to shared owners must be serialized/reviewed; keep DB workers at 1 |

## Implementation Strategy

1. Complete Setup and Foundation without new scaffolding/dependencies.
2. Complete US1 and independently verify migrated defaults, admin persistence, office drafts and settings synchronization: this is the MVP configuration increment.
3. Complete US2, verifying actual form/automatic starts rather than only saved config or global-env test overrides.
4. Complete US3 strict/race/access/timing acceptance; fix gaps in shared owners rather than duplicate guards.
5. Update only superseded cap documentation, pass all/full delivery gates, refresh continuity and hand off to the controller. No deployment/provider/Git operation belongs to this worker.

## Requirement and Acceptance Coverage

| Requirements | Tasks | Quickstart scenarios |
|---|---|---|
| FR-001, FR-002, FR-014 | T003–T004 | 1–2 |
| FR-003, FR-004 | T005, T012–T013 | 3, 7 |
| FR-005, FR-011 | T004–T007, T015 | 3–4, 6, 10 |
| FR-006, FR-007 | T011–T012, T016 | 5–6, 11 |
| FR-008 | T008–T010, T012–T013 | 7–8 |
| FR-009, FR-010 | T002, T004, T008–T009, T013–T014 | 4, 9 |
| FR-012, FR-013 | T006–T007, T009–T011, T015–T017 | 4, 6, 8, 11 |
| FR-015 | Focused tests in T002–T017, T019 | 1–12 |
| FR-016, FR-017 | T018–T020 | 12 |

## Notes

### Implementation evidence — 2026-10-05

- T001 remains unchecked. Moved the existing `verify-deps-before-run=false` intent from ignored `.npmrc` to pnpm 11's supported `verifyDepsBeforeRun: false` workspace setting; `rtk pnpm continuity:update` then exited 0. Added the missing `.dockerignore` required by implementation setup verification. No duration application changes yet; accepted spec/plan and checklist markers are preserved.
- Baseline client check: `rtk pnpm run test:client -- tests/client/app-context.test.ts` ran the full client project (the separator did not filter it): 35 files, 502 tests passed. Direct focused `rtk proxy node node_modules/vitest/vitest.mjs run --project client tests/client/app-context.test.ts` passed 4 tests. Bare `rtk pnpm exec vitest` could not resolve the executable in this worker; direct existing runner execution worked.
- Minimal required-server-test reproduction: `rtk proxy node node_modules/vitest/vitest.mjs run --project server tests/server/office-location-service.test.ts`, with `VITEST_MAX_WORKERS=1` and `TEST_DATABASE_SCHEMA=team_lunch_test`, exited 1 during `tests/server/globalSetup.ts:116` before application tests: dedicated PostgreSQL at localhost:55434 was unreachable. No host/infrastructure operation was performed and no schema safety assertion was changed.
- Baseline `rtk proxy pwsh -NoProfile -File validate.ps1 all` passed text format, typecheck, lint, architecture, complexity, function size and duplication before Semgrep exited 2: `Failed to create system store X509 authenticator` / `CertOpenSystemStore returned NULL`. This does not constitute a passing all gate. Controller-configured full validation remains required; no task is shipped or checked based on these partial results.
- Final all result: exit 1, `FAILED: semgrep, dependency-audit, tests`. Audit failed fetching the registry advisories with `EACCES`; coverage aborted in server global setup because the same dedicated PostgreSQL was unreachable (no application tests ran). Worker environment failures require controller host validation using its configured commands, not host changes or additional requested commands. Targeted UTF-8/LF and `git diff --check` passed; continuity refreshed successfully with pnpm. T001–T020 remain unchecked.

- Total: 20 tasks; US1: 5, US2: 6, US3: 4; Setup: 1, Foundation: 1, Polish: 3. Ten tasks expose parallel planning opportunities subject to the sequential execution rule.
- No new table, cleanup list extension, external service, credentials, infrastructure, office-admin role, scheduler redesign, rollback framework or persisted synchronization revision is requested.
- Completion of this tasks phase does not claim implemented behavior or passing implementation delivery gates. All implementation tasks remain unchecked.
