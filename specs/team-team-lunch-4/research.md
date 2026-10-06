# Research: Office Duration Defaults

**Date**: 2026-10-05 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Research used the accepted spec and local repository. A read-only research agent traced settings authorization/realtime hydration; the planning agent traced persistence, start callers, selectors and validation. No new technology/dependency is selected. All technical unknowns are resolved.

## 1. Office persistence

**Decision**: Add `OfficeLocation.defaultPollDurationMinutes`, mapped to non-null integer `default_poll_duration_minutes`, with database default 5 in a new additive migration.

**Rationale**: `prisma/schema.prisma` already owns food default 30; `officeLocation.ts` owns creation, default-office upsert, formatting and atomic settings validation. Extending this owner supports direct DB creation and office isolation without another table or snapshot.

**Alternatives considered**: Browser-local state fails persistence; global env fails office isolation; another settings table duplicates ownership; rewriting an applied migration violates policy.

## 2. Settings API and validation

**Decision**: Extend existing `POST /api/auth/offices/:officeId/settings` with optional numeric poll default, preserving stored value on omission. Share strict predicates/presets; retain service-specific errors.

**Rationale**: `routes/auth.ts` requires signed current-session global admin before the service. `/api/auth/config` returns offices via `listOfficeLocations()`. Existing optional policy fields establish compatibility precedent. Office food settings and food-start service separately enforce 30; both need 60. `pollCreation.validateDuration` already accepts integer multiples of 5 in 5–720 without string/fraction coercion.

**Alternatives considered**: New route/role broadens scope; coercion/rounding accepts malformed input; preset-only validation rejects specified off-preset numbers; copied predicates drift.

## 3. Form intent

**Decision**: Store a nullable explicit duration choice in an office-keyed pending form; derive untouched duration from arriving/current office defaults.

**Rationale**: `PollIdleView.PollStartForm` initializes to literal 5. Its policy retry retains existing fields. `SingleMenuQuickStart` uses default prop but overwrites duration on every default update. Derived state handles delayed hydration and same-office refresh without clobbering choice. Office reset prevents A's choice/warning reaching B. Administration already preserves office-keyed drafts on config refresh.

**Alternatives considered**: Unconditional effects overwrite choices; initialize-once misses late defaults; saving override as settings affects everyone; a new form framework is unnecessary.

## 4. No partial invalid quick-start

**Decision**: Reuse callable food service validation before `createAutoFinishedPoll`; retain validation within `startFoodSelection` for all callers.

**Rationale**: Quick-start in `routes/foodSelections.ts` currently writes a finished poll before food validation. Invalid duration can leave a poll, contrary to the accepted spec. Normal service start validates first; automatic starts call the same service from `poll.ts`.

**Alternatives considered**: Delete-after-failure complicates events/policy; UI-only guard leaves HTTP exposed; generalized rollback for unrelated failures exceeds scope.

## 5. Automatic start coverage

**Decision**: Keep test runtime's explicit zero opt-out; enabled focused tests exercise the saved office-default lookup.

**Rationale**: Production `autoStartFoodSelectionForPoll` reads office defaults, but `NODE_ENV=test` substitutes `DEFAULT_FOOD_SELECTION_DURATION_MINUTES`. `tests/server/setup.ts` sets 0; two poll-service cases temporarily set 30. A positive env-only 45 test would not prove office-default use. Test saved 45/60 in differing offices and restore opt-out without enabling real mail or host services.

**Alternatives considered**: Claiming env-only coverage is false evidence; globally enabling transitions destabilizes suites; scheduler redesign is unrequested.

## 6. Missing settings event

**Decision**: Add office-scoped `office_settings_changed` with office ID/both committed defaults; use a late-bound service callback and extend existing hydration/reducer.

**Rationale**: Office updates currently notify only effective policy changes. No duration settings event exists. `InitialStatePayload`, SSE and AppContext carry only food default. SSE already imports the office service, so importing SSE back creates a runtime cycle. The existing policy callback and client `isCurrent()` guard supply the pattern.

**Alternatives considered**: Polling/another connection duplicates infrastructure; policy invalidation misuse changes semantics; unscoped broadcast leaks office settings.

## 7. Delayed hydration race

**Decision**: Overlay the latest settings notification from the current connection on subsequent hydration; reset this transient value on reconnect and scope change.

**Rationale**: `sendInitialState` reads defaults then awaits policy evaluation. A newer save event can arrive before stale hydration. Office checks alone do not prevent this same-office race; retaining an override across reconnect could hide disconnected saves.

**Alternatives considered**: Persisted revision/distributed event system adds unnecessary machinery; unconditional hydration loses a committed update; permanent override becomes stale.

## 8. Selectors and distinct timers

**Decision**: Share existing poll presets; add only 45/60 to food presets in Administration, quick-start and finished-poll controls. Validate complete custom duration text.

**Rationale**: Three food arrays currently end at 30; poll presets already match all ten accepted choices. `PollFinishedView` also has a local 30 cap. `MinutesActionDropdown` uses `parseInt`, accepting prefixes/fractions as integers; it serves other timer controls, requiring regression coverage. `officePollSchedule.ts` derives finish-time duration. Extension and ETA validators are independent.

**Alternatives considered**: Every valid food multiple as a preset broadens choices; changing nearby timer limits alters unrelated behavior; new selector duplicates accessible controls.

## 9. Documentation and delivery

**Decision**: Preserve accepted spec/unrelated plans; update only obsolete food-start caps during implementation, using supersession links for retained history. Require dedicated-DB all/full at delivery.

**Rationale**: BACKLOG-010 exists. Relevant old descriptions occur in `specs/food-selection/spec.md` and `specs/old/`; extension 30-minute limits remain valid. Constitution gates are shipment/merge gates, while planning hooks are optional disabled commit operations. Preparation reported pnpm `ERR_SQLITE_ERROR`; underlying Node continuity generator succeeded.

**Alternatives considered**: Broad accepted-artifact rewrite exceeds scope; current-cap docs claiming behavior before implementation mislead; weakened gates/controller Git or host operations violate instructions.
