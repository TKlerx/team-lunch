# Duration Interface Contracts

**Spec**: [spec.md](../spec.md) | **Model**: [data-model.md](../data-model.md)

## Numeric rules and presets

| Concept | Accepted submitted JSON number | Predefined choices |
|---|---|---|
| Menu default / manual poll start | Integer multiple of 5, inclusive 5–720 | 5, 10, 15, 30, 45, 60, 120, 240, 480, 720 |
| Food default / normal and quick start | Integer 1 or multiple of 5, inclusive 5–60 | 1, 5, 10, 15, 20, 25, 30, 45, 60 |

Food 35/40/50/55 and poll 20 are valid despite absence from presets. Preserve and visibly represent stored off-preset numbers without silently replacing them; no added predefined choices. Strings, blanks, partial numbers, null, booleans, containers, fractions and non-finite values fail. Custom text entry validates complete input before constructing a numeric request: `45x`/`45.5` cannot become 45.

## Office settings

`GET /api/auth/config` retains existing authorization/filtering and exposes both properties on each returned `OfficeLocation`. No new read route/role.

`POST /api/auth/offices/:officeId/settings` retains signed global-admin authorization and targets the path office. Extend its existing body:

```json
{
  "autoStartPollEnabled": false,
  "autoStartPollWeekdays": [],
  "autoStartPollFinishTime": null,
  "defaultPollDurationMinutes": 15,
  "defaultFoodSelectionDurationMinutes": 45
}
```

Existing optional policy fields retain their contracts. Omitted `defaultPollDurationMinutes` preserves stored value for older callers; explicit invalid value fails. Existing food/scheduler fields retain required semantics. Success: `200 { "office": OfficeLocation }` with both defaults. Invalid duration: `400 { "error": string }`, no write/event. Missing/expired-session and non-admin errors remain unchanged; caller-supplied roles confer no access.

## Starts

- `POST /api/polls`: existing explicit `durationMinutes`; form initializes from saved poll default. Description, exclusions, signed actor and policy justification remain. Success remains 201.
- `POST /api/food-selections`: existing `{ "pollId": string, "durationMinutes": number }`; accepted food range becomes 1 or multiples of 5 in 5–60. Existing office/lifecycle checks remain.
- `POST /api/food-selections/quick-start`: existing duration/optional policy justification. Validate before creating the auto-finished poll. Invalid input returns 400 with zero newly created polls/selections and no start event.

No omitted-duration start API is added. Manual controls submit effective choice; automatic food start gets office default server-side. Successful response/event shapes remain. Do not round, clamp or coerce malformed input. Valid duration alone does not bypass auth, conflicts, menus or interval policy. Extensions, remaining-time adjustments and ETA retain separate contracts.

## SSE

Reuse authenticated office-scoped `/api/events`. `initial_state` adds `defaultPollDurationMinutes` next to food default. Normal hydration has saved values; existing fallback uses 5/30. No private ordering evidence added.

```text
event: office_settings_changed
data: {"officeLocationId":"<office-uuid>","defaultPollDurationMinutes":15,"defaultFoodSelectionDurationMinutes":45}
```

Emit after successful persistence when either default changes; payload has both committed values, broadcast only to that office. Unauthorized/invalid/unchanged durations emit no duration change. Policy edits independently retain `ordering_policy_changed`; duration-only changes do not emit it.

Client rules:

1. Guard office/auth/connection scope and matching payload office ID.
2. Update defaults without changing rounds, availability or ETA.
3. Overlay current-connection settings events on older hydration received afterward.
4. Clear that transient override on reconnect so disconnected saves appear in fresh hydration.
5. Retain explicit pending choices for same-office updates; discard pending form on office switch.

## UI

Administration reuses office-keyed draft/save flow and labeled native selects. Both defaults survive save/reload/switch; refresh preserves unsaved drafts. Fresh poll form follows saved default, including delayed arrival; explicit override survives same-office refresh/policy retry, affects only one start and clears with office context. Default-initialized food quick-start uses food default unless explicitly overridden. All food default/start selectors retain 1 and prior presets, adding 45/60. Scheduling/extension/delivery controls keep their rules.
