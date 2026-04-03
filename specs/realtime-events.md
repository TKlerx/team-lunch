# Spec: Real-time Events (SSE)

## Topic of Concern
Server-Sent Events keep all clients synchronized with live lunch-state updates.

## Architecture

- Endpoint: `GET /api/events`
- Broadcast model: all clients receive all events.
- On connect, server sends `initial_state` snapshot.

## initial_state payload

```json
{
  "type": "initial_state",
  "payload": {
    "activePoll": "Poll | null",
    "activeFoodSelection": "FoodSelection | null",
    "latestCompletedPoll": "Poll | null",
    "latestCompletedFoodSelection": "FoodSelection | null",
    "completedFoodSelectionsHistory": "FoodSelection[]"
  }
}
```

## Event Catalogue

### Menu Events

- `menu_created` -> `{ menu }`
- `menu_updated` -> `{ menu }`
- `menu_deleted` -> `{ menuId }`
- `item_created` -> `{ item }`
- `item_updated` -> `{ item }`
- `item_deleted` -> `{ itemId, menuId }`

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
- Browser SSE reconnect handles transient disconnects.
