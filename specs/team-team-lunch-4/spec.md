# Feature Specification: Office Duration Defaults

**Feature Branch**: `codex/team-lunch-4`

**Created**: 2026-10-05

**Status**: Draft

**Input**: Accepted requirements for separate office menu-selection poll defaults and food-selection durations through 60 minutes. Intake: [BACKLOG-010](../BACKLOG.md#backlog-010-notes--office-duration-defaults).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure independent office defaults (Priority: P1)

An authenticated administrator sets the usual restaurant/menu voting time and food-ordering time for each office in Administration. The independent defaults remain saved across reloads and office switching.

**Why this priority**: Office-specific defaults avoid repeatedly choosing a team's normal voting duration or using another office's settings.

**Independent Test**: Set different defaults for two offices, save and reload, then switch between them. Each office retains its own two values.

**Acceptance Scenarios**:

1. **Given** offices created before this feature, **When** the data upgrade completes, **Then** every existing office has a 5-minute menu-selection default and its food-selection default and other stored data are preserved.
2. **Given** an administrator creates a new office, **When** its settings are first viewed, **Then** its menu-selection default is 5 minutes and existing food-selection default behavior is preserved.
3. **Given** an administrator edits an office, **When** they open the menu-selection default editor, **Then** it offers exactly 5, 10, 15, 30, 45, 60, 120, 240, 480 and 720 minutes.
4. **Given** any food-selection default editor, **When** it is opened, **Then** 45 and 60 minutes are available alongside all existing choices, including 1 minute.
5. **Given** office A has defaults of 15 and 45 minutes and office B has defaults of 60 and 1 minute, **When** the administrator saves, reloads and switches offices, **Then** each office displays its own saved values without changing the other office.
6. **Given** a signed non-admin session or no valid session, **When** a settings write is attempted, **Then** existing authorization rejects the write and neither default changes.

---

### User Story 2 - Start lunch using the intended duration (Priority: P1)

An authorized starter sees the selected office's saved menu-selection default in the manual restaurant/menu poll form and may choose another duration for that start. Food-selection start controls offer longer ordering rounds and existing default-driven starts use the office's saved food-selection duration.

**Why this priority**: Saved defaults must influence actual starts while preserving a deliberate one-time choice.

**Independent Test**: Open a manual poll form with a saved 15-minute default, select 30 minutes and start it. Verify a 30-minute poll with the saved default still at 15. Separately verify saved 45/60-minute food defaults in existing default-driven start paths.

**Acceptance Scenarios**:

1. **Given** an office's menu-selection default is 15 minutes, **When** a fresh manual restaurant/menu poll form is ready, **Then** 15 minutes is selected without user interaction.
2. **Given** that form, **When** the starter explicitly selects 30 minutes and starts the poll, **Then** the poll lasts 30 minutes and the office default remains 15 minutes.
3. **Given** an explicit duration choice in an unsubmitted form, **When** the same office's settings refresh or a start is retried after an interval-policy warning, **Then** that choice is preserved for the pending start.
4. **Given** an untouched form opened before defaults finish loading, **When** the office's saved defaults arrive, **Then** the form initializes from them rather than retaining a temporary fallback.
5. **Given** a starter changes from office A to office B, **When** office B's start form is ready, **Then** it uses office B's defaults and does not submit office A's pending duration choice.
6. **Given** any food-selection start selector, **When** it is opened, **Then** it includes 45 and 60 minutes and preserves all existing choices including 1 minute.
7. **Given** an office with a saved 45- or 60-minute food default, **When** an existing start path uses the office default, including automatic food selection after a poll resolves or a default-initialized manual/quick start, **Then** the ordering round uses that value unless the manual starter explicitly selects a different valid duration.
8. **Given** a scheduled poll with a configured finish time, **When** its office menu-selection default changes, **Then** it continues to follow existing scheduled finish-time semantics.

---

### User Story 3 - Keep durations valid and synchronized (Priority: P2)

Users in the same office receive consistent saved defaults. Invalid durations cannot create a round or corrupt settings, and other lunch rules and timers continue to behave as before.

**Why this priority**: Longer durations must remain trustworthy across browsers without changing access rules or other timing concepts.

**Independent Test**: Verify both defaults in fresh and reconnected office sessions, test accepted/rejected durations, and run existing scheduling, interval-policy, extension and delivery-time regression coverage.

**Acceptance Scenarios**:

1. **Given** two connected browsers in office A and another in office B, **When** an administrator saves office A's defaults, **Then** office A's shared settings reflect both values and office B's values are unchanged.
2. **Given** saved defaults, **When** a browser reloads, reconnects or switches offices, **Then** its settings and fresh start forms use the selected office's two saved values.
3. **Given** food-selection settings or a start, **When** the duration is integer 1 or any multiple of 5 from 5 through 60 inclusive, **Then** it passes duration validation subject to unchanged authorization and lifecycle rules.
4. **Given** food-selection settings or a start, **When** the duration is malformed, non-integer, zero, negative, 2, 4, 7 or 65, **Then** validation rejects it and no settings change or round is created.
5. **Given** menu-selection settings or a poll start, **When** the duration is a multiple of 5 from 5 through 720 inclusive, **Then** it passes duration validation; malformed, fractional, out-of-range and other values are rejected without changing state.
6. **Given** existing scheduling, interval-policy, extension or delivery-time flows, **When** the feature is enabled, **Then** their authorization, timing rules and outcomes remain unchanged.

### Edge Cases

- Food duration 1 remains valid; 60 is the inclusive upper bound and 65 is invalid. Valid 35, 40, 50 and 55 minute submissions are accepted even though this feature only adds 45 and 60 to predefined choices.
- Poll duration 5 and 720 remain valid; 1 and 725 are invalid. Predefined poll choices are narrower than the accepted range of multiples of 5.
- Numeric strings, blank strings, partial numbers, null, booleans, arrays, objects, non-finite values and fractional numbers must not be silently converted into valid submitted durations.
- Invalid settings leave both defaults and unrelated settings unchanged; invalid starts leave no originating poll or food-selection record behind.
- Delayed responses or realtime updates from a previously selected office must not overwrite the current office's defaults or pending start.
- Same-office refreshes must not overwrite explicit manual menu-poll choices. Switching offices initializes a new office context from that office's defaults.
- Default changes affect future default-driven starts, not a running round, extension choice or entered delivery ETA.
- The data upgrade preserves existing food defaults, scheduling/interval-policy settings and historical lunch records without resetting data or modifying applied migrations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each office MUST persist independent menu-selection poll and food-selection duration defaults; changing either MUST NOT change the other.
- **FR-002**: Existing and newly created offices MUST receive a menu-selection default of 5 minutes. Existing food-selection defaults and the current new-office food-selection default MUST remain unchanged.
- **FR-003**: Administration MUST expose the office menu-selection default with exactly 5, 10, 15, 30, 45, 60, 120, 240, 480 and 720 minute choices.
- **FR-004**: Every food-selection default editor and start selector MUST add 45 and 60 minutes while preserving existing choices, including 1 minute.
- **FR-005**: Settings saves and subsequent reads MUST retain both defaults for the intended office across reloads and office switching without modifying other offices.
- **FR-006**: A fresh manual restaurant/menu poll form MUST initialize from the selected office's saved menu-selection default, including when it arrives after the form first appears.
- **FR-007**: An explicit manual menu-poll duration choice MUST be used for that start without changing the saved default or being overwritten by same-office refreshes or interval-policy retries. Switching offices MUST initialize the new office's form from its own default.
- **FR-008**: Existing food-selection starts that use an office default MUST honor the saved value, including automatic starts after poll resolution and default-initialized manual/quick starts. Explicit start choices MUST continue to take precedence over defaults.
- **FR-009**: Food-selection settings and starts MUST accept only integer 1 or integer multiples of 5 from 5 through 60 inclusive. Malformed, fractional and out-of-range values MUST fail validation without a partial state change.
- **FR-010**: Menu-selection defaults and poll starts MUST accept only integer multiples of 5 from 5 through 720 inclusive; the existing poll-start validation range MUST remain unchanged.
- **FR-011**: Both defaults MUST be included in office settings and shared realtime state, including initial hydration, settings changes, reloads, reconnects and office switching. Late updates from an old office MUST NOT replace the current office's state.
- **FR-012**: Existing signed administrator authorization for settings/lifecycle actions, selected-office access rules and office isolation MUST be preserved; this feature MUST NOT introduce office-scoped administrator roles or trust caller-supplied roles.
- **FR-013**: Scheduled poll finish-time semantics, timezone behavior, ordering interval policy, extension rules and delivery ETA MUST remain unchanged. Defaults MUST NOT retime a running round.
- **FR-014**: A new non-destructive migration MUST introduce the menu-selection default and initialize existing offices to 5 minutes without resetting data, rewriting applied migrations or changing existing food defaults.
- **FR-015**: Focused tests MUST cover migration and new/existing-office defaults, settings persistence, authorization, office isolation, manual initialization/override, all affected selectors, default-driven starts, SSE and server duration validation using existing suites.
- **FR-016**: Intake MUST be registered in `specs/BACKLOG.md`. Current documentation stating the obsolete 30-minute food-selection cap MUST be updated during implementation; unrelated accepted specifications and plans MUST remain intact.
- **FR-017**: Before implementation delivery, `validate.ps1 all` and `validate.ps1 full` MUST pass using dedicated test PostgreSQL with existing assertions and data-safety gates preserved. Host checks, branches, commits, pushes, provider interactions and merge remain controller-owned.

### Key Entities *(include if feature involves data)*

- **Office duration defaults**: Two independent positive whole-minute values owned by an office: usual menu-selection voting time and usual food-selection ordering time.
- **Manual start choice**: A duration chosen for one pending start in the selected office; it does not modify the saved default.
- **Lunch round**: An existing poll or food-selection round whose duration is determined at start; scheduling, extension and delivery-time concepts retain their own rules.

### Realtime / SSE Events *(include if feature changes shared state)*

- Initial office state and existing office-settings change notifications MUST convey both defaults through the existing SSE synchronization surface.
- Clients apply the selected office's defaults to shared state and untouched fresh forms, preserve explicit manual menu-poll choices, and exclude other offices' state.

### Data / Migration Impact *(include if feature touches persisted data)*

- Add one persisted menu-selection default to existing office settings through a new additive migration; existing and future offices receive 5 minutes.
- Preserve the food-selection setting and other office/history data. Extend accepted food durations without replacing stored values.
- No new entity or relationship is required; additional identity/name snapshots or model cleanup entries are unnecessary.

### Scope Flags *(Team Lunch optional surfaces)*

- Multi-office aware: defaults, form state and updates respect the selected office.
- Auth scope: existing signed admin-only settings writes and start/access authorization remain in force.
- Email notification involved: existing behavior is preserved; no new mail flow is introduced.
- Out of scope: new roles, scheduling redesign, interval-policy changes, extension-duration changes, delivery ETA changes, infrastructure changes and unrelated accepted artifact rewrites.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing and new offices tested begin with a 5-minute menu-selection default, with zero loss or alteration of existing food defaults and office/history data.
- **SC-002**: All 10 menu-default choices and both added food choices can be saved and restored after reload; two offices with different defaults retain both independent values through repeated office switching.
- **SC-003**: Every tested fresh manual menu-poll start uses its office default without an extra duration selection, and every explicit override starts with the chosen value while leaving the saved default unchanged.
- **SC-004**: All affected food editors/selectors retain existing choices and offer 45 and 60 minutes; every tested default-driven start honors its saved office value.
- **SC-005**: 100% of duration-boundary and malformed-input acceptance cases produce the specified accept/reject result without unauthorized writes, partial starts or cross-office changes.
- **SC-006**: Connected, reloaded and reconnected office sessions agree on both saved defaults in all tested scenarios, with zero overwrites from previously selected offices.
- **SC-007**: Existing scheduling, interval-policy, extension and delivery-time regression scenarios retain expected outcomes; configured aggregate and full delivery gates pass before the feature is delivered.

## Assumptions

- Menu-selection poll means the existing restaurant/menu voting round; food selection means the subsequent ordering round.
- The current new-office food-selection default remains 30 minutes; the requested 5-minute initialization applies only to the new menu-selection default.
- Food choices remain 1, 5, 10, 15, 20, 25 and 30 minutes with 45 and 60 added. Accepted food durations also include other multiples of 5 through 60; adding them as predefined choices is outside this request.
- Existing settings, signed authorization, office selection and realtime synchronization are reused. No new external service or credential is required.
- Existing fallback behavior for unavailable defaults remains subject to duration validation and office isolation; normal default-driven starts with saved office values must honor them.
- Obsolete-cap documentation updates belong with implementation so operating instructions do not claim unimplemented behavior. This specification supersedes the previous 30-minute start cap only within the accepted scope above.
- This phase specifies behavior and validates artifacts. Implementation, focused tests and required aggregate/full delivery gates follow later; specification completion does not claim those gates have run.
