# Spec: Real-time Events (SSE)

## Topic of Concern
Server-Sent Events keep all clients synchronized with live lunch-state updates.

## Architecture

- Endpoint: `GET /api/events`
- Connections are registered against their authenticated selected office. Office-scoped events reach only clients registered for that office; explicitly global events may reach all clients.
- On connect/reconnect, server sends an office-scoped `initial_state` snapshot.

## initial_state payload

```json
{
  "type": "initial_state",
  "payload": {
    "orderingPolicy": "OrderingPolicyAvailability | null",
    "activePoll": "Poll | null",
    "activeFoodSelection": "FoodSelection | null",
    "latestCompletedPoll": "Poll | null",
    "latestCompletedFoodSelection": "FoodSelection | null",
    "completedFoodSelectionsHistory": "FoodSelection[]",
    "defaultFoodSelectionDurationMinutes": "number"
  }
}
```

`orderingPolicy` contains only the server evaluator's public availability for the
selected office, including its status, timezone, calendar boundaries and next
eligible instant. It is `null` if evaluation fails; clients must not interpret
null (or an absent legacy field) as eligibility. Policy failure preserves
otherwise valid lunch-state hydration. Neither initial nor live SSE exposes
private exception snapshots, reasons, actors, or completion lookup evidence.

## Event Catalogue

### Menu Events

- `menu_created` -> `{ menu }`
- `menu_updated` -> `{ menu }`
- `menu_deleted` -> `{ menuId }`
- `item_created` -> `{ item }`
- `item_updated` -> `{ item }`
- `item_deleted` -> `{ itemId, menuId }`

### Ordering Policy Events

- `ordering_policy_changed` -> `{ officeLocationId }`
  - scoped to the affected office; emitted after a successful effective interval, timezone, or anchor settings change and after successful arrival confirmation
  - invalidation only: clients refetch public availability, rather than inferring a new status from this payload
  - no emission for rejected/failed settings writes, unchanged or unrelated settings, ignored Unrestricted anchor edits, or failed/repeated completion
  - existing `food_selection_completed` events are preserved; no private audit data is included

### Poll Events

- `poll_started` -> `{ poll }`
- `vote_cast` -> `{ poll }`
- `vote_withdrawn` -> `{ poll }`
- `poll_ended` -> `{ pollId, status, endedPrematurely?, winner? }`
- `poll_extended` -> `{ pollId, newEndsAt }`

### Food Selection Events

- `food_selection_started` -> `{ foodSelection }`
- `order_placed` -> `{ order }`
- `order_updated` -> `{ order }`
- `order_withdrawn` -> `{ nickname, selectionId, orderId? }`
- `food_selection_overtime` -> `{ foodSelectionId }`
- `food_selection_extended` -> `{ foodSelectionId, newEndsAt }`
- `food_selection_ordering_started` -> `{ foodSelection }`
  - semantics: the selection entered the pre-ordering stage, but meal collection may still continue until ordering is explicitly claimed
- `food_selection_ordering_claimed` -> `{ foodSelection }`
  - semantics: one user explicitly took responsibility for placing the real-world order; meal changes are now locked
- `food_selection_fallback_pinged` -> `{ foodSelectionId, menuName, targetNickname, actorNickname, itemName, itemNumber? }`
- `food_selection_delivery_started` -> `{ foodSelection }`
- `food_selection_delivery_due` -> `{ foodSelectionId }`
- `food_selection_eta_updated` -> `{ foodSelectionId, etaMinutes, etaSetAt, deliveryDueAt }`
- `food_selection_completed` -> `{ foodSelection }`
- `food_selection_aborted` -> `{ foodSelectionId }`

## Event format

```
event: <name>\n
data: <json>\n
\n
```

## Client behavior

- Hydrate state from `initial_state`.
- Update reducers per event type.
- Browser SSE reconnect handles transient disconnects and receives freshly evaluated policy availability.
- `useSSE` owns the single policy subscription. It loads explicit-office availability on office/auth changes, refetches on matching `ordering_policy_changed` and reconnect, and accepts first-connect public hydration (including explicit null).
- `useOrderingPolicy()` exposes office-scoped availability/loading/error plus a stable awaitable `refresh()` without creating another connection. Loading/failure means unavailable, not eligible.
- Request sequencing and office/auth cleanup discard superseded and old-scope results. Reconnect REST reads remain authoritative over delayed hydration snapshots; legacy absent policy fields leave the REST read intact.
- T015 will add landing availability/countdown UI and call the existing refresh API at boundary expiry; this UI is not yet implemented.
