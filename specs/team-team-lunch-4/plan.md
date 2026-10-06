# Implementation Plan: Office Duration Defaults

**Branch**: `codex/team-lunch-4` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Accepted specification `specs/team-team-lunch-4/spec.md`; intake [BACKLOG-010](../BACKLOG.md#backlog-010-notes--office-duration-defaults).

## Summary

Add a separate `defaultPollDurationMinutes` to existing office settings through a new additive PostgreSQL column defaulting to 5. Preserve the food default of 30 for new offices and all existing food defaults, extend valid food durations through 60, and add only 45/60 to existing food presets. Reuse the settings API, shared state and SSE connection. Manual forms use the selected office default while preserving deliberate pending choices. Validate quick-start duration before creating its originating poll.

Accepted scope remains unchanged: signed authorization, office isolation, scheduled finish times, ordering policy, extensions and delivery ETA retain their behavior. This planning phase does not claim implementation or delivery gates complete.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM, Node.js 24 LTS.

**Primary Dependencies**: Installed Fastify 5, React 19, Vite 8, React Router 7, Prisma 7 with PostgreSQL adapter, jose. No new dependency. The constitution's React 18 overview is historical; `package.json` provides the current installed React context without requiring an amendment.

**Storage**: Existing `OfficeLocation` in `prisma/schema.prisma`; one new non-null integer column `default_poll_duration_minutes` with database default 5. No new entity, relationship or cleanup table.

**Testing**: Existing Vitest 4 server/client suites, Supertest/Fastify injection and Testing Library; existing Playwright and pinned Trivy gates at implementation delivery.

**Target Platform**: Browser SPA and Fastify backend; Windows-first development tooling.

**Project Type**: Single-package full-stack web application.

**Performance Goals**: Propagate committed defaults over the existing office-scoped SSE connection without polling or another connection. Constant-time duration validation; no new numerical latency target.

**Constraints**: Strict numeric input; validation before mutation; non-destructive migration; signed existing admin/start authorization; office/auth isolation; explicit-choice preservation; late hydration protection; UTF-8 without BOM and LF. Controller owns Git/provider operations and host checks. All/full delivery gates retain assertions and data-safety checks with dedicated test PostgreSQL.

**Scale/Scope**: One office field, one optional settings request field, one office-scoped SSE event/reducer action, shared preset arrays/predicates and existing Administration/start controls. No new route, role, external service, scheduler model or generic duration framework. All unknowns resolved in [research.md](research.md).

## Constitution Check

*Gate evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle/gate | Design evidence | Before research | After design |
|---|---|---|---|
| I. Thin routes, service-owned logic | Settings validation in office service; food validator called before quick-start poll creation and within normal start. | PASS | PASS |
| II. Single Prisma client | Existing `src/server/db.ts` singleton; no new client. | PASS | PASS |
| III. Shared types and snapshots | Extend `src/lib/types.ts`; shared duration rules; no new actor/FK requiring snapshots. | PASS | PASS |
| IV. SSE synchronization | Both defaults in initial hydration and settings event; late-bound service callback avoids a runtime cycle. | PASS | PASS |
| V. Tests, no stubs | Focused existing suites plus required all/full gates at delivery. | PASS | PASS |
| Database rules | Additive migration only; applied SQL immutable; no reset or destructive operation; dedicated test schema. | PASS | PASS |
| Quality/ownership | All before shipment/full before merge retained; no bypass; controller owns commits/push/merge and host checks. | PASS | PASS |
| Scope/SDD | Accepted spec/checklist unchanged; no implementation/tasks in planning; BACKLOG-010 registered. | PASS | PASS |

No constitution violation or unresolved human decision remains. Gate PASS describes design compliance, not executed implementation tests.

## Project Structure

### Documentation (this feature)

```text
specs/team-team-lunch-4/
├── spec.md                     # accepted; preserved
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/durations.md
└── checklists/requirements.md  # existing spec quality checklist; preserved
```

`tasks.md` belongs to the subsequent `$speckit-tasks` phase.

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<new_timestamp>_office_poll_duration_default/migration.sql
src/lib/types.ts
src/lib/durations.ts                         # minimal shared presets/predicates
src/server/services/officeLocation.ts
src/server/services/foodSelection.ts
src/server/services/pollCreation.ts
src/server/services/poll.ts
src/server/routes/auth.ts                    # existing settings boundary
src/server/routes/foodSelections.ts          # quick-start validation order
src/server/sse.ts
src/client/context/AppContext.tsx
src/client/hooks/useSSE.ts
src/client/pages/Administration.tsx
src/client/components/PollIdleView.tsx
src/client/components/PollFinishedView.tsx
src/client/components/MinutesActionDropdown.tsx
tests/server/                                # existing service/API/SSE suites
tests/client/                                # existing component/state/SSE suites
```

**Structure Decision**: Extend existing layers; listed route files are integration boundaries, not required edits if behavior already holds. Reuse fixture factories and generated Prisma tooling; generated output remains uncommitted. No separate settings store/service or custom selector.

## Design

### Persistence and settings (FR-001–FR-005, FR-009–FR-010, FR-014)

Add the Prisma field and a new additive migration that gives old/future offices 5 without changing food defaults or historical rows. Verify migration behavior against pre-upgrade data in an isolated disposable schema, plus metadata/defaults and direct/service-created offices. Extend the existing formatter for office reads.

The new request field is optional for older clients: omission retains the stored poll default; explicit malformed values fail with 400. Existing required food/scheduler fields keep their semantics. Validate all fields before the single settings update. Administration includes both defaults in per-office drafts, initialization, change detection and saves.

Share fixed preset arrays and strict unknown-input predicates in `src/lib/durations.ts`. Food validity: integer 1 or multiples of 5 in 5–60. Poll validity: multiples of 5 in 5–720. Services retain contextual 400 errors. Presets are narrower than validity; do not add 35/40/50/55 as food presets. Preserve and visibly represent legal stored values outside presets without silently selecting/saving a different value; distinguish displayed current value from the fixed choice list.

### Manual starts and validation order (FR-006–FR-010, FR-012–FR-013)

Use an office-keyed pending form and nullable explicit duration choice. Effective duration is the explicit choice or current office default. Untouched forms follow arriving defaults; deliberate choices survive same-office refresh and policy retry. Office switch discards old pending choice/warning context. Successful start clears the choice for the next fresh form. Default-initialized food quick-start controls also preserve explicit choice precedence.

Expose/reuse the food service validator for quick-start preflight and retain it inside `startFoodSelection` for every caller. Validate before `createAutoFinishedPoll`, asserting no poll, selection or start event for invalid duration. Preserve access/lifecycle checks and the immediate ordering-policy recheck. This does not add rollback guarantees for unrelated infrastructure failures.

Automatic food starts use the saved office food default. Current test runtime substitutes a global environment value and disables automatic starts with explicit zero. Keep that opt-out for unrelated tests; enabled acceptance tests must exercise actual office lookup for saved 45/60 values and differing offices, rather than only a positive env override. Preserve unavailable-default fallback behavior and real-mail test safeguards.

Scheduled menu polls still derive duration from configured office-local finish time in `officePollSchedule.ts`; never substitute the new manual default. Existing timestamps, extension validators and ETA remain independent and are not retimed by settings edits.

### Realtime state (FR-005, FR-007, FR-011)

Extend initial hydration with both defaults, read together, and valid fallback 5/30. Emit `office_settings_changed` carrying office ID and both committed values when either changes. Bind the callback in SSE using the existing late-bound policy notification pattern. Keep `ordering_policy_changed` limited to effective policy changes.

Add a shared event type and reducer action updating only defaults. Listener checks `isCurrent()` and matching payload office ID. Initial hydration retains its captured scope guard. Keep the latest settings event for the current connection and overlay its defaults on later hydration, preventing a save received during hydration from being overwritten. Clear this transient value on reconnect so fresh hydration includes disconnected saves. Office/auth cleanup discards it; no persisted revision or new cache.

### Selectors and documentation (FR-003–FR-004, FR-016)

Add a labeled native poll-default selector in Administration with the ten existing poll presets. Add 45/60 to food choices in Administration, single-menu quick-start and finished-poll controls. Update finished-poll local validation/messages. `MinutesActionDropdown` currently uses prefix parsing: validate complete custom food text before submission so malformed/fractional values cannot become valid numbers. Preserve valid extension/remaining-time inputs for its other callers with regression coverage.

BACKLOG-010 is already present. During implementation, update only current food-start cap descriptions. Search found relevant statements in `specs/food-selection/spec.md` and historical `specs/old/food-selection-lifecycle.md` / `specs/old/app-navigation.md`. Use narrow supersession links where retained historical requirements should remain readable; distinguish archived behavior. Preserve unrelated accepted plans/specs and still-valid extension/ETA descriptions. Do not claim unimplemented behavior in operating docs during planning.

## Validation and Handoff

[quickstart.md](quickstart.md) maps every FR-001–FR-017 to runnable acceptance. Extend existing office, settings/auth, poll/food, SSE and UI suites; include off-preset valid numbers, malformed inputs, two offices, delayed defaults, reconnect and hydration races. Replace obsolete 45-minute rejection assertions with 65-minute rejection plus positive 45/60 assertions; preserve all unrelated assertions.

Before implementation delivery, pass `rtk proxy pwsh -NoProfile -File validate.ps1 all` and `rtk proxy pwsh -NoProfile -File validate.ps1 full` against dedicated test PostgreSQL. Security, Trivy/E2E, coverage and data-safety gates remain blocking. No bypass or controller host operation is authorized.

Planning checks artifact completeness, references, resolved research, constitution gates, accepted artifact preservation and UTF-8/LF. `.specify/extensions.yml` registers only optional commit hooks before/after planning; auto-commit is disabled and controller-owned, so skip them. No mandatory planning CI hook exists. Refresh continuity with the existing generator; carry unresolved preparation pnpm `ERR_SQLITE_ERROR` to implementation without claiming pnpm-based code gates passed.

## Complexity Tracking

No constitution violations. No added dependency, infrastructure, role, entity, persisted revision or generic configuration framework.
