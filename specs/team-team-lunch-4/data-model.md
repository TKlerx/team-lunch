# Data Model: Office Duration Defaults

**Spec**: [spec.md](spec.md) | **Contracts**: [contracts/durations.md](contracts/durations.md)

## OfficeLocation (existing)

| Field | Storage / API | Default | Validation |
|---|---|---|---|
| `id` | Existing UUID identity | Existing behavior | Existing office/access resolution |
| `defaultPollDurationMinutes` | New integer `default_poll_duration_minutes`; JSON number | 5 for old/new/direct-created offices | Integer multiples of 5, inclusive 5–720 |
| `defaultFoodSelectionDurationMinutes` | Existing integer `default_food_selection_duration_minutes`; JSON number | Existing saved value; 30 for new offices | Integer 1 or multiples of 5, inclusive 5–60 |

Other fields, relationships and retained history remain unchanged. Office responses always carry both defaults. The new request field is optional for old callers: omission preserves the stored value. Explicit null/string/boolean/container/non-finite/fractional values fail rather than count as omission.

Validate all fields before the single settings update. Changing one duration preserves the other supplied/stored value and other offices. Existing scheduler request requirements/omitted policy behavior remain. Invalid writes leave the entire record unchanged and emit no duration event.

## Migration

Add one non-null integer column with default 5 through a new additive migration. No recreation/reset/delete, applied SQL edit, food-default rewrite or historical mutation. Service creation/default-office upsert/direct DB creation use the DB default; upsert must preserve a previously edited value.

Verify old-row preservation by applying the new migration to representative pre-upgrade fixtures in a disposable test schema, comparing food/schedule/policy values and history records. Check non-null/default metadata and new inserts independently of the formatter. Qualify raw metadata queries with the dedicated schema; PrismaPg's schema option does not make `current_schema()` authoritative. No new cleanup table; generated Prisma output remains uncommitted.

## Pending start (client-only)

| Value | Meaning |
|---|---|
| Office context | Selected office, bounded by current auth/connection scope |
| Explicit duration or null | Deliberate pending choice; null follows current default |
| Effective duration | Explicit choice if present, otherwise office default |
| Existing description/exclusions/warning | Existing retry state, bounded to that office |

Transitions:

1. Fresh form: null choice, office default or valid temporary fallback until hydration.
2. Same-office default arrives/changes: untouched form follows; explicit choice remains.
3. User selection: capture one-start override without settings write.
4. Warning/retry: retain choice and other pending fields.
5. Office/auth change: discard old pending context/warning; initialize new office.
6. Successful start/fresh form: clear choice; running record keeps its timestamps.

Food quick-start retains the same default/explicit precedence. Finished-poll preset/custom start submits its chosen number explicitly.

## Shared defaults state

Add poll default alongside existing food default. Hydration supplies saved values, with valid fallback 5/30 that never alters persistence. `office_settings_changed` updates defaults only, leaving running rounds, availability and ETA intact.

Connection-local latest settings notification protects against delayed initial hydration. Clear it on reconnect and office/auth cleanup. Wrong-office/old-source updates cannot enter current state. This is transient synchronization state, not a new persisted model.

## Poll / FoodSelection (existing)

No new fields or lifecycle states. `startedAt`/`endsAt` retain accepted duration at creation. Poll validity remains integer multiples of 5 in 5–720; food becomes 1 or multiples of 5 in 5–60. Validate before first write, including originating quick-start poll.

Scheduled poll duration still comes from office-local finish time; automatic food starts use saved default subject to existing opt-out/fallback behavior. Default edits never retime rounds, extension choices, ordering periods or delivery ETA.
