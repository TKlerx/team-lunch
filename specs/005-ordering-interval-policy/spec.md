# Feature Specification: Office Ordering Interval Policy

**Feature Branch**: `005-ordering-interval-policy`
**Created**: 2026-10-01
**Status**: Done
**Backlog**: [BACKLOG-009](../BACKLOG.md)
**Input**: Admin-configurable office-local calendar periods with one completed lunch per period, soft manual exceptions, compliant scheduling, and a visible landing-page countdown.

## User Scenarios & Testing

### User Story 1 - Configure an Office Policy (Priority: P1)

An administrator sets Unrestricted, one week, two weeks, three weeks, or four weeks,
a starting Monday, and the office timezone. Each restricted period allows one
successful lunch. Administrators can disable the policy without losing its saved anchor.

**Why this priority**: Each office must reflect its own external policy.
**Independent Test**: Save different policies for two offices, reload, and verify validation and disabled-field behavior independently.

**Acceptance Scenarios**:
1. **Given** an existing or newly created office, **When** settings are opened, **Then** the default interval is one week and a valid editable timezone and starting Monday are available.
2. **Given** a restricted policy, **When** an admin saves a valid timezone and Monday date, **Then** the office uses those values without changing another office.
3. **Given** invalid interval, impossible date, non-Monday anchor, or invalid timezone, **When** settings are submitted, **Then** the save is rejected without partially changing settings.
4. **Given** Unrestricted mode, **When** settings are edited, **Then** the anchor input is disabled, explained as not evaluated, and not required; saved anchor values remain available on re-enabling.
5. **Given** a non-admin user, **When** they attempt to change the policy, **Then** the change is refused.

### User Story 2 - Warn Before Starting and Record Exceptions (Priority: P1)

An authorized user starts a lunch. If the current period already contains a
successful lunch, they see a policy warning before anything starts, with the next
compliant date. Cancel is the default. Proceeding requires a written justification.

**Why this priority**: Encourage compliance without making exceptional lunches impossible.
**Independent Test**: Complete a lunch in the current period, attempt both normal and single-menu starts, cancel once, and proceed once with justification; inspect the recorded exception as an admin.

**Acceptance Scenarios**:
1. **Given** a completed lunch in the current period, **When** a user starts a new lunch, **Then** a warning offers Cancel as default and names the next period boundary in the office timezone.
2. **Given** the warning, **When** it is canceled or dismissed, **Then** no poll, food selection, timer, or start notification is created.
3. **Given** the warning, **When** an authorized starter supplies a nonblank justification of at most 500 characters and proceeds, **Then** the lunch starts and the reason, actor, decision time, and evaluated policy context are durably recorded together.
4. **Given** an early-start request with missing, whitespace-only, non-text, or overlong justification, **When** submitted, **Then** it does not start a lunch.
5. **Given** no completed lunch in the current period or Unrestricted mode, **When** a user starts, **Then** no policy exception is needed; existing authorization and active-lunch rules still apply.
6. **Given** Friday's successful lunch in one weekly period, **When** next Wednesday's lunch starts in the next period, **Then** it is compliant despite less than seven elapsed days.
7. **Given** a lunch placed in one period but delivered in the next, **When** completion is confirmed, **Then** it consumes the opportunity in the period containing `completedAt`.
8. **Given** a recorded exception, **When** an admin views the associated poll or completed lunch history after settings/profile changes, **Then** the original reason, actor display snapshot, and policy context remain visible.

### User Story 3 - Keep Automatic Starts Compliant (Priority: P1)

Scheduled polls start only when the office policy allows a lunch. No justification
is invented and no skipped opportunity is carried forward.

**Why this priority**: Automation must not bypass policy or require a human override.
**Independent Test**: Run a scheduled check inside a used period, then at an eligible scheduled window in a fresh period; only the latter starts.

**Acceptance Scenarios**:
1. **Given** a used period or a future policy start, **When** the scheduler checks an otherwise valid schedule, **Then** it skips creation without recording an exception or sending start notifications.
2. **Given** a fresh period, **When** the existing office schedule is due, **Then** a poll can start without justification.
3. **Given** one or more unused elapsed periods, **When** the next period opens, **Then** it has exactly one compliant opportunity, not accumulated credit.
4. **Given** different server and office timezones, **When** the schedule is evaluated, **Then** weekdays, daily deduplication, and scheduled finish time use the office timezone.
5. **Given** Unrestricted mode, **When** the scheduler runs, **Then** policy checks do not suppress existing scheduling behavior.

### User Story 4 - See Next Availability (Priority: P1)

The selected office's landing page clearly shows when another lunch can start
according to policy, without implying that an actual scheduled poll will start then.

**Why this priority**: Users should not need to attempt a start to discover availability.
**Independent Test**: Switch offices, complete a lunch, change settings, and cross a period boundary; availability updates correctly without a full page reload.

**Acceptance Scenarios**:
1. **Given** a used restricted period, **When** viewing the landing page, **Then** a prominent days/hours/minutes countdown and exact next date/time with office timezone are shown.
2. **Given** an unused active period, **When** viewing the page, **Then** it says Ready to start, subject to existing active-lunch guards.
3. **Given** Unrestricted mode, **When** viewing the page, **Then** there is no restriction countdown and unrestricted status is clear.
4. **Given** a policy change, completion, office switch, reconnect, or boundary rollover, **When** the view refreshes, **Then** it uses current office policy rather than limited history or stale browser calculations.
5. **Given** unavailable policy data, **When** viewing the page, **Then** it shows an unavailable/loading state, never a fabricated Ready to start message.

### Edge Cases

- Periods are half-open: a completion exactly at Monday 00:00 belongs to the new period.
- Daylight-saving changes, year changes, and leap days do not change calendar-week boundaries.
- Completed exceptions consume the same period's opportunity but neither shift the anchor nor create future debt.
- Aborted polls, placed-but-undelivered lunches, and incomplete selections do not consume opportunities.
- All new-lunch entry paths, including the single-menu shortcut, must receive the same policy check; individual dish additions are not new lunches.
- Before a future anchor date, compliant starts wait until the anchor; justified manual exceptions remain possible.
- Updating interval, timezone, or anchor immediately re-evaluates retained completions using the new policy, without altering historical exception snapshots or canceling ongoing lunches.
- A server recheck handles settings/completion changes after a browser displayed availability; the browser is not authoritative.
- Settings with Unrestricted mode ignore anchor edits and preserve the previous valid anchor; switching back validates the effective stored/submitted anchor.
- Office timezone remains an office-level editable setting even when policy-specific fields are disabled.

## Requirements

### Functional Requirements

- **FR-001**: Office admins MUST choose exactly Unrestricted or 1/2/3/4-week periods; existing and new offices MUST default to weekly.
- **FR-002**: Each office MUST have a valid editable IANA timezone and an admin-configurable starting Monday, interpreted as local 00:00.
- **FR-003**: Periods MUST be consecutive fixed calendar blocks of the configured weeks from that anchor, independent of elapsed hours or weekday of previous lunches.
- **FR-004**: A period MUST allow one compliant successful lunch; unused opportunities expire, with no carryover or future debt from exceptions.
- **FR-005**: Only successfully completed lunches in the same office MUST count, using their completion time within the current period; placement time MUST NOT determine eligibility.
- **FR-006**: All manual new-lunch paths MUST check policy before creating a poll or food selection, retaining existing permissions and ongoing-lunch constraints.
- **FR-007**: A noncompliant manual start MUST show a soft warning with exact next availability, Cancel as default, and a written-justification override for anyone authorized to start.
- **FR-008**: Override reasons MUST be text, trimmed, nonblank, and at most 500 characters; invalid overrides MUST NOT cause side effects.
- **FR-009**: An actual exception MUST retain its reason, stable actor identity and display snapshot, decision timestamp, interval, timezone, anchor, evaluated boundaries, and relevant completion evidence. Admins MUST be able to view it with associated lunch history; ordinary users MUST NOT receive admin-only exception details.
- **FR-010**: Automatic starts MUST skip used periods and future anchors without justification; they MUST retain existing schedule checks and use office-local time.
- **FR-011**: The landing page MUST show restricted availability/countdown and exact next date/time in the office timezone; unrestricted offices MUST not show a restriction countdown.
- **FR-012**: Availability MUST refresh after policy changes, completion, office changes, reconnects, and period rollover; policy evaluation failures MUST not silently permit starts.
- **FR-013**: Client and server MUST validate required restricted settings. Unrestricted mode MUST disable, explain, retain, and not evaluate policy-specific anchor fields; office timezone remains independently validated/editable.
- **FR-014**: Policy updates MUST affect future starts, not terminate or re-warn an existing lunch, and MUST preserve original exception snapshots.
- **FR-015**: Server-side evaluation at creation MUST prevent bypass through direct requests, stale clients, automatic creation, or single-menu shortcuts; a policy conflict alone MUST be overridable by a valid authorized manual justification.

### Key Entities

- **Office policy**: interval choice, office timezone, starting Monday.
- **Policy availability**: evaluation time, current period, whether a completed lunch exists, eligibility, and next eligible boundary.
- **Lunch exception**: immutable justification and actor/policy snapshot attached to the originating lunch process.
- **Successful lunch**: office-scoped delivered/completed lunch with a completion timestamp.

### Realtime / SSE Events

- Office policy changes update connected users' availability in that office.
- Existing completion/start notifications continue; completing a lunch refreshes policy availability.
- Connection hydration and reconnect include current availability; countdown rollover also refreshes it without waiting for an event.

### Data / Migration Impact

- Persist office interval, timezone, and starting week; safely initialize existing offices to weekly with valid editable settings.
- Persist immutable exception metadata with the originating lunch; no retroactive exceptions are invented.
- Preserve display-name snapshots alongside stable actor identity.
- Tests MUST cover migrations/defaults, settings, evaluation, manual creation, scheduling, audit visibility, and countdown behavior.

### Scope Flags

- Multi-office aware: yes, configuration, counting, visibility, and events are office-scoped.
- Auth scope: admins configure/view exceptions; existing authorized starters may override.
- Email: no new message type; existing start mail is sent only after successful creation.
- Out of scope: hard quotas, approval workflows, claim leases, accumulated credits, weekday restrictions, and individual-order frequency limits.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All five interval choices survive save/reload independently per office; every invalid restricted-settings scenario is rejected without partial changes.
- **SC-002**: Every tested noncompliant manual entry path either cancels with zero start side effects or proceeds with a valid durably recorded exception.
- **SC-003**: No scheduled poll starts during a used period or before the policy start in boundary tests.
- **SC-004**: Weekly Friday-to-Wednesday, multiweek rollover, unused-period, exact-midnight, timezone, and daylight-saving scenarios all yield the specified eligibility.
- **SC-005**: An open landing page updates its countdown at least once per minute and requests fresh eligibility at expiry; settings/completion updates appear within five seconds of successful event delivery.
- **SC-006**: Admins can recover the original justification and policy context after settings or display names change; non-admin responses do not expose that metadata.

## Assumptions

- New offices default to Europe/Berlin; existing saved timezones are preserved. Admins choose an IANA timezone from a native dropdown, including UTC and any saved alias; no browser/server-zone inference is persisted. New offices default to the Monday of their creation week; existing offices to the migration week's Monday in UTC. These are editable initialization values, not hardcoded recurrence anchors.
- The confirmed future-anchor behavior postpones compliant starts until that Monday; it does not make the preceding dates unrestricted.
- Count completions already retained, including those predating configuration if they fall in the evaluated period.
- Successful creation records an exception only if policy is actually noncompliant at the server's decision time; a stale warning must not create a false exception.
- The feature encourages policy compliance at start; it does not reserve future periods or block food delivery/completion when a process spans boundaries.
