# Data Model: Office Ordering Interval Policy

## OfficeLocation additions

| Field | Proposed storage | Rules |
|---|---|---|
| `orderingIntervalWeeks` | integer, default 1 | Exact set 0/1/2/3/4; 0 is Unrestricted |
| `timeZone` | bounded string, default UTC | Valid IANA zone, checked with Intl; office-level setting |
| `orderingAnchorDate` | PostgreSQL date | Monday date, serialized YYYY-MM-DD; interpreted in office zone |

Existing rows receive the migration week's UTC Monday, not a literal hardcoded
recurrence date. New offices receive creation week's Monday in their initial UTC
zone. Admins can edit both. Supply anchor initialization explicitly in all office
creation/upsert/seed paths and test fixtures, with a migration default only if
necessary to preserve supported creation callers.

Restricted settings validate the effective anchor on update, including switching
back from unrestricted. Unrestricted mode ignores incoming anchor edits and
retains the stored anchor; omission is allowed. Timezone is always independently
validated. Settings saves are atomic. Add DB checks for the interval value and
Monday invariant where practical, in addition to service validation.

## Poll addition

`orderingPolicyException`: nullable JSON snapshot, immutable after creation.

Contents:
- `reason`: trimmed nonblank text, maximum 500 characters.
- `actorKey`, `actorEmail`, `displayNameSnapshot`: signed actor attribution.
- `decidedAt`: ISO timestamp.
- `intervalWeeks`, `timeZone`, `anchorDate`: evaluated policy settings.
- `blockStart`, `blockEnd`: ISO instants (null for future-anchor case).
- `nextEligibleAt`: ISO instant.
- `violation`: `period_used` or `not_started`.
- `previousCompletedSelectionId`, `previousCompletedAt`: evidence, nullable for future anchor. These are historical snapshot values, not cascading references.

Persist only actual overrides of a noncompliant decision. Do not backfill historical
exceptions, trust client snapshots, or overwrite snapshots after profile/settings
changes. FoodSelection links to Poll already; no duplicate snapshot table is needed.
Admin response projection must filter this field on the server and exclude it from
public broadcast payloads.

## FoodSelection index

Add an index on `(officeLocationId, status, completedAt)` for completion-existence
queries. Existing completion semantics and retained rows remain unchanged.

## Derived availability (not persisted)

Office ID, evaluation time, interval/timezone/anchor, status
`unrestricted | eligible | period_used | not_started`, block start/end,
next eligible time (null when eligible/unrestricted), and relevant completion
reference/time for server decisions. Public payload includes completion time if
useful but not actor, exception reason, or admin-only metadata.

## Migration and cleanup

Additive LF-only migration; no schema reset, row deletion, new persisted model,
or rewrite of applied SQL. Generate/apply via Prisma development migration flow.
Ensure existing office fixture cleanup resets any modified policy settings.
Re-generate the client, cover defaults/index/backfill, and verify production
migration deployment against the dedicated test database.
