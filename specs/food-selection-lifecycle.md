# Spec: Food Selection Lifecycle (Phase 2 + Phase 3)

## Topic of Concern
The food selection system allows team members to choose meals from the winning menu, then explicitly place the real-world order with an ETA, and finally confirm delivery arrival.

## Pre-conditions
- A poll has finished with a winner menu (`status = FINISHED`).
- No food selection phase is currently active.

## States

```
IDLE -> ACTIVE -> OVERTIME | ORDERING | ABORTED
          |
        EXTENDED -> OVERTIME | ORDERING | ABORTED
ORDERING -> CLAIMED -> DELIVERING | ABORTED
DELIVERING -> DELIVERY_DUE | COMPLETED
DELIVERY_DUE -> DELIVERING | COMPLETED
```

| State | Description |
|---|---|
| IDLE | Winner known; user can start food selection |
| ACTIVE | Timer running; users place/change/withdraw line items |
| OVERTIME | Timer expired; awaiting extension or confirm |
| ORDERING | Winning menu known and meal selection still open; team is preparing to place the real order |
| CLAIMED | One person has explicitly taken responsibility for placing the real-world order; meal changes are now locked |
| DELIVERING | Real order placed; awaiting delivery |
| DELIVERY_DUE | ETA timer reached zero; arrival still unconfirmed |
| COMPLETED | Lunch arrival confirmed; finalized in history |
| ABORTED | Selection canceled manually |

## Starting Food Selection

- User starts food selection from finished poll.
- In approval-workflow mode, any approved user may start it; the creator key is stored for later timer/extension permissions.
- Duration options: **1, 5, 10, 15, 20, 25, 30** minutes.
- Creates selection with `status = ACTIVE`, `ends_at = now + duration`.
- SSE: `food_selection_started`.

## Placing and Managing Meal Lines

- Any user can add line items during `ACTIVE`.
- Each line can include optional note/comment (`0..200` chars).
- Users can withdraw all own lines or single own line.
- No order changes are accepted outside `ACTIVE`.

## Timer Expiry

When `ends_at` is reached:
- Server sets `status = OVERTIME`.
- SSE: `food_selection_overtime`.
- Two options:

### Option A - Extend
- Extension options: **5, 10, 15** minutes.
- Only admins or the food-selection creator may extend or manually adjust this timer.
- Sets `ends_at = now + extension`, returns `status = ACTIVE`.
- SSE: `food_selection_extended`.

### Option B - Move to ordering preparation
- In approval-workflow mode, any approved user may trigger this transition.
- Sets `status = ORDERING`.
- Clears active selection timer.
- Meal collection is still open in `ORDERING`.
- Teammates who skipped the poll may still place or withdraw meal lines while nobody has claimed the ordering responsibility yet.
- Admins or the food-selection creator may still adjust the remaining meal-selection window while the selection is in `ORDERING` and unclaimed.
- SSE: `food_selection_ordering_started`.

## Ordering Step (explicit real-world order)

- In `ORDERING`, one user first presses **I am placing the order**.
- That claim:
  - records who is currently handling the restaurant call
  - transitions the selection into `CLAIMED`
  - notifies everyone else so nobody else orders in parallel
- Once claimed:
  - no further meal additions, changes, or withdrawals are allowed
  - no further timer extensions/adjustments are allowed
  - organizer fallback actions are no longer allowed
- After the restaurant confirms the order, that same user enters the ETA via **Order placed**.
- Before the ordering responsibility is claimed, organizers can also see winning-poll voters who still have no order but previously configured a default meal for this menu and opted into organizer fallback ordering.
- These fallback rows explicitly show that the listed dish is the user's saved default meal.
- Organizers may explicitly place that saved default meal for the missing user before the ordering responsibility is claimed.
- If the user saved a default comment for that menu, the organizer-placed order reuses that comment and appends the organizer audit note.
- Before the ordering responsibility is claimed, organizers may also ping one fallback-eligible missing user directly from that list:
  - best-effort email is sent when the user's nickname is an email address
  - a targeted browser notification is sent when that user is online with notifications enabled
- Fallback ordering is never automatic:
  - the missing user may have voted for the winning menu or may have skipped the poll entirely
  - the missing user must not already have an order
  - the user must have enabled organizer fallback for that menu
  - the organizer action is recorded as an organizer-placed default meal in the saved order notes
- ETA minutes (`1..240`) are required on this action.
- On success:
  - `status = DELIVERING`
  - `order_placed_at = now`
  - `eta_minutes = input`
  - `eta_set_at = now`
  - `delivery_due_at = now + eta_minutes`
- SSE:
  - `food_selection_ordering_claimed` when someone claims the ordering responsibility
  - `food_selection_delivery_started` when the real order is placed and ETA is known

## Delivery Tracking

- `DELIVERING`: shows countdown to `delivery_due_at`.
- ETA can be updated in `DELIVERING` or `DELIVERY_DUE`; each update restarts timer from now.
- When timer reaches zero: `status = DELIVERY_DUE`, SSE `food_selection_delivery_due`.
- Arrival can be confirmed in `DELIVERING` or `DELIVERY_DUE`.

## Finalization

- Confirming arrival sets:
  - `status = COMPLETED`
  - `completed_at = now` (actual arrival confirmation timestamp)
- After completion, each user can save feedback on their own order:
  - rating stays the primary signal (`1..5`)
  - an optional short free-text remark can capture delivery, food quality, or general notes
  - the remark is stored per completed order and included in history/export
- Keep up to 5 most-recent completed selections.
- While `ORDERING`, `DELIVERING`, or `DELIVERY_DUE`, no new cycle can start.
- While `ORDERING`, meal selection is still open until the ordering responsibility is explicitly claimed.
- The product cutoff for late meal selection is the ordering claim, not the earlier transition from overtime/active into `ORDERING`.

## Notifications

- `food_selection_started`
- `food_selection_overtime`
- `food_selection_extended`
- `food_selection_ordering_started`
- `food_selection_ordering_claimed`
- `food_selection_delivery_started`
- `food_selection_delivery_due`
- `food_selection_eta_updated`
- `food_selection_completed`
- `food_selection_aborted`

## Out of Scope

- External ordering integration.
