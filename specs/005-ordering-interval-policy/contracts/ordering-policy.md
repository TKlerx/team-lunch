# Contracts: Office Ordering Interval Policy

All paths are relative to existing BASE_PATH. Shared shapes belong in
`src/lib/types.ts`. This document describes proposed additions, not existing APIs.

## Office settings

Extend existing `POST /api/auth/offices/:officeId/settings` with:

```json
{
  "orderingIntervalWeeks": 2,
  "timeZone": "Europe/Vienna",
  "orderingAnchorDate": "2026-10-05"
}
```

Existing schedule/duration fields remain in the payload. Admin/session and office
checks remain. Restricted mode requires a valid effective Monday and timezone.
Unrestricted is `0`: omit anchor from disabled UI, ignore incoming anchor edits,
and retain saved anchor. Always validate timezone. Omitted new fields from older
clients preserve existing values, not silently disable policy. Invalid types,
unsupported intervals, unknown zones, impossible/non-Monday dates return 400
`{error}` without a partial update. Return extended `{office}`.

## Public availability

New `GET /api/polls/ordering-policy` uses existing authenticated office resolution
and request office context; no unauthenticated configuration access.

```json
{
  "officeLocationId": "office-uuid",
  "evaluatedAt": "2026-10-08T10:00:00.000Z",
  "intervalWeeks": 2,
  "timeZone": "Europe/Vienna",
  "anchorDate": "2026-10-05",
  "status": "period_used",
  "blockStart": "2026-10-04T22:00:00.000Z",
  "blockEnd": "2026-10-18T22:00:00.000Z",
  "nextEligibleAt": "2026-10-18T22:00:00.000Z"
}
```

Statuses: unrestricted/eligible/period_used/not_started. Eligible and unrestricted
have null nextEligibleAt. Future anchor returns anchor instant as nextEligibleAt
and null block boundaries. Evaluation failure is an error, never synthetic eligibility.
No exception metadata is included. Use no-store responses.

## Manual starts

Extend `POST /api/polls` and `POST /api/food-selections/quick-start` with optional
`orderingPolicyJustification`. Existing menu-exclusion reasons are separate.
Authenticated identity is server-derived; clients cannot select a scheduled
source, send audit snapshots, or grant themselves bypass rights.

On noncompliance with no valid override:

```json
{
  "error": "This office has already completed a lunch in the current policy period.",
  "code": "ORDERING_POLICY_WARNING",
  "orderingPolicy": { "status": "period_used", "nextEligibleAt": "2026-10-18T22:00:00.000Z" }
}
```

HTTP 409, with the full public availability shape in orderingPolicy; no poll,
selection, timer, broadcast, or mail side effect. Malformed supplied reasons
return 400; missing reasons on noncompliance return the warning. Trim reasons,
require 1–500 characters. The frontend offers a default-focused Cancel and a
separate justification submission. Escape/dismiss cancel; do not auto-resubmit.
On eligible creation, do not record a false exception even if a stale UI supplied
a reason. Existing non-policy 409/400 conflicts retain their current semantics.

The scheduler prechecks and creation rechecks the same rule, but cannot override.

## Exception viewing

Extend existing authorized admin poll detail and food-selection history/detail
responses with `orderingPolicyException`, projected from the originating Poll.
Non-admin responses omit private exception fields entirely. Initial/live public
SSE payloads omit them; admin views fetch through authorized REST when necessary.
No separate exception-edit endpoint: snapshots are immutable.

## Realtime

- `initial_state` includes public `orderingPolicy` availability for that office on connect/reconnect. New server payloads explicitly send null on evaluation failure (including whole-hydration fallback), never synthetic eligibility; an isolated policy failure preserves other hydration data. The shared field is optional for legacy payload compatibility.
- New `ordering_policy_changed`: `{officeLocationId}`, scoped to the affected office,
  after successful effective interval/timezone/anchor changes and successful arrival confirmation. Unchanged/unrelated/ignored-anchor saves and failed writes/completions do not emit it. It invalidates client availability; no private audit data.
- Existing poll/food-selection events remain; successful start responses and
  public SSE payloads must not expose private exception JSON accidentally.
- Refresh availability after invalidation, reconnect, office switch, and boundary
  expiry. Ignore old-office requests and clean up subscriptions/timers on unmount.
