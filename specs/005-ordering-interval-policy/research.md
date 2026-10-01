# Research: Office Ordering Interval Policy

## Fixed blocks, not rolling cooldown

**Decision**: Count completed lunches in fixed office-local 1/2/3/4-week blocks anchored to an admin-selected Monday at 00:00. Use half-open boundaries and no carryover.
**Rationale**: Friday-to-next-Wednesday must be allowed weekly; elapsed hours or last-order-plus-weeks cannot represent the agreed quota.
**Alternatives**: Rolling 6/13/20/27-day windows and ISO-week-number modulo rejected; the former changes semantics, the latter misaligns at year boundaries.

## Timezone/defaults

**Decision**: Use explicit IANA office timezone, default UTC, and an editable current-week Monday initialization. Use native Intl date parts plus calendar arithmetic and tested local-boundary conversion helpers.
**Rationale**: Date-only anchors must not shift with browser timezone or DST. Current dependencies do not supply a date library; native tools avoid adding one prematurely.
**Alternatives**: Server-local dates and inferred browser zones rejected. A date library is justified only if tested native conversion cannot meet correctness; do not assume Node exposes Temporal without checking.
**Validation**: Check impossible dates, Monday weekday, leap years, DST transitions, fractional offsets, exact midnight, and office/server timezone mismatch. Define midnight conversion as the first valid instant of the local date when a timezone transition skips midnight; choose the earlier instant if repeated. Convert each boundary independently.

## Creation paths and authorization

**Observed**: `PollIdleView.tsx` has normal polling and a single-menu quick-start shortcut. Normal starts flow through `poll.startPoll`/`pollCreation.createPollRecord`; the scheduler calls `createPollRecord` directly; quick starts use `poll.createAutoFinishedPoll` through `/api/food-selections/quick-start`.
**Decision**: A shared server policy guard protects both creation paths, with authenticated manual actor and server-chosen source. UI preflight never authorizes creation.
**Rationale**: Guarding only normal UI or `startPoll` leaves bypasses. No admin-only override permission is added.
**Alternatives**: Client-only check and checking only food selection rejected; the agreed check is before the lunch starts.

## Success signal

**Observed**: `foodSelection.confirmFoodArrival` sets status completed and `completedAt`. Placement and collection completion are earlier lifecycle states.
**Decision**: Query completed selections by office and current completion period, using an indexed existence query rather than five-entry REST history.
**Rationale**: Undelivered food is not a successful lunch, and limited history cannot establish policy eligibility.

## Exception persistence/privacy

**Decision**: Nullable immutable JSON snapshot on Poll, created atomically with the poll; projected to authorized admin poll/food-selection detail responses.
**Rationale**: All lunch starts originate in a Poll, including auto-finished quick starts. Existing completed detail can display exception data without a separate admin history product.
**Alternatives**: New audit-table/endpoint and recomputing context from current settings rejected. Exception details must not enter mixed-audience SSE payloads; UI hiding alone is not access control.

## Live availability and scheduling

**Observed**: Existing office settings have no scoped settings-change event; scheduler uses server-local weekday/finish/day marker calculations. `useCountdown` exists but total-hours formatting needs a multi-day presentation.
**Decision**: Public availability endpoint plus initial hydration and a scoped invalidation event; reuse countdown timing and add day-aware display. Refetch at boundary, after invalidation/reconnect and office changes.
**Rationale**: No completion/settings event occurs merely because midnight passes. Scheduler must share the office timezone to avoid contradictory behavior.
**Alternatives**: Full client-side policy duplication, repeated full-history downloads and per-second polling rejected.

## Assumptions and boundaries

- Future anchors delay compliant starts until the anchor, as agreed during clarification.
- Unrestricted skips policy evaluation and retains anchor; timezone remains independently editable/validated.
- New policy settings apply immediately to future starts; ongoing lunches are not canceled.
- No new completion-time hard gate, quota reservation, claim lease, email type, or concurrency redesign.
- Existing scheduler daily deduplication and activity guards remain in addition to the policy. Unrelated scheduler duration quirks are not part of this change.
