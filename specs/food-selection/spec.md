# Feature Specification: Food Selection Lifecycle

**Feature Branch**: `n/a — existing feature on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/services/foodSelection.ts`, `src/server/routes/foodSelections.ts`,
`src/client/components/FoodSelection*.tsx` + `FoodDeliveryView.tsx`, tests in
`tests/server/food-selection-*.test.ts` and `food-order-rating-export.test.ts`.
Original prose: `specs/old/food-selection-lifecycle.md`.

> Migrated spec — describes behavior already shipped, not new work.

## User Scenarios & Testing

### User Story 1 - Collect meal orders for the winning menu (Priority: P1)

After a poll picks a menu, the team places, changes, and withdraws individual
meal line items within a timed window.

**Why this priority**: Phase 2 core — turns a chosen menu into actual orders.

**Independent Test**: From a finished poll, start food selection, add/withdraw
lines from several nicknames, confirm changes are blocked after the timer.

**Acceptance Scenarios**:

1. **Given** a finished poll with a winner and no active selection, **When** a
   user starts food selection (1/5/10/15/20/25/30 min), **Then**
   `status=active`, `ends_at = now + duration`, `food_selection_started` broadcasts.
2. **Given** an active selection, **When** a user adds a line item (optional note
   0–200 chars), **Then** it is stored under their nickname; the user may withdraw
   one or all of their own lines.
3. **Given** an active selection whose timer expires, **Then** `status=overtime`
   and `food_selection_overtime` broadcasts; no order changes are accepted in
   `overtime`.

### User Story 2 - Extend or move to ordering (Priority: P1)

On overtime, the team either extends the window or moves into ordering prep where
collection stays open until someone claims the order.

**Acceptance Scenarios**:

1. **Given** `overtime`, **When** an admin/creator extends (5/10/15 min), **Then**
   `status=active`, `ends_at = now + extension`, `food_selection_extended`.
2. **Given** `overtime`, **When** an approved user moves to ordering, **Then**
   `status=ordering`, the selection timer clears, meal collection stays open, and
   `food_selection_ordering_started` broadcasts.

### User Story 3 - Place the real order and track delivery (Priority: P1)

One person claims the order (locking changes), enters an ETA after the restaurant
confirms, and the team tracks delivery to completion.

**Acceptance Scenarios**:

1. **Given** `ordering` and unclaimed, **When** a user presses "I am placing the
   order", **Then** `status=claimed`, the claimer is recorded, further
   meal/timer/fallback changes are locked, `food_selection_ordering_claimed`.
2. **Given** `claimed`, **When** the claimer submits ETA (1–240 min) via "Order
   placed", **Then** `status=delivering`, `order_placed_at`/`eta_minutes`/
   `eta_set_at`/`delivery_due_at` set, `food_selection_delivery_started`.
3. **Given** `delivering`, **When** the ETA timer reaches zero, **Then**
   `status=delivery_due`, `food_selection_delivery_due`. ETA can be updated in
   `delivering`/`delivery_due` (restarts timer; `food_selection_eta_updated`).
4. **Given** `delivering`/`delivery_due`, **When** arrival is confirmed, **Then**
   `status=completed`, `completed_at=now`, `food_selection_completed`.

### User Story 4 - Organizer fallback ordering (Priority: P2)

Before the order is claimed, an organizer may place a missing voter's saved
default meal, or ping them.

**Acceptance Scenarios**:

1. **Given** `ordering` + unclaimed, **When** an organizer places a fallback for a
   missing user who (a) voted/skipped, (b) has no order, (c) enabled fallback for
   this menu, **Then** the saved default meal (and default comment + audit note)
   is added as their order.
2. **Given** the same preconditions, **When** an organizer pings a missing user,
   **Then** a best-effort email (if nickname is an email) and a targeted browser
   notification (if online + notifications enabled) are sent.

### User Story 5 - Post-delivery feedback (Priority: P3)

After completion each user rates and optionally remarks on their own order.

**Acceptance Scenarios**:

1. **Given** a completed selection, **When** a user saves feedback, **Then** a
   rating (1–5) plus optional short remark are stored per order and included in
   history/export.

### Edge Cases

- **Start with no finished poll**: rejected — a winner menu is required.
- **Order change after `active`**: rejected (`overtime`/`ordering`-claimed/etc.).
- **Second claim**: blocked once `claimed`.
- **New lunch cycle while order ongoing**: blocked while `ordering`/`delivering`/
  `delivery_due` (enforced in poll start).
- **Fallback when user already has an order / fallback not enabled**: not allowed.
- **Late meal cutoff** = the ordering claim, not the overtime→ordering move.

## Requirements

### Functional Requirements

- **FR-001**: System MUST require a finished poll with a winner before starting a
  food selection, and reject a start if one is already in progress.
- **FR-002**: Start duration MUST be one of 1/5/10/15/20/25/30 minutes.
- **FR-003**: Users MUST be able to add/withdraw their own line items (note
  0–200 chars) only while `status=active`.
- **FR-004**: On expiry the System MUST set `status=overtime` and stop accepting
  order changes.
- **FR-005**: Extension MUST be 5/10/15 minutes, restricted to admin/creator.
- **FR-006**: Move-to-ordering MUST set `status=ordering`, clear the timer, and
  keep collection open until claimed.
- **FR-007**: Claiming MUST record the claimer, set `status=claimed`, and lock all
  meal/timer/fallback mutations.
- **FR-008**: Order placement MUST require ETA (1–240 min) and set delivery fields
  + `status=delivering`.
- **FR-009**: ETA updates MUST be allowed in `delivering`/`delivery_due` and
  restart the delivery timer; zero MUST set `status=delivery_due`.
- **FR-010**: Arrival confirmation MUST set `status=completed`, `completed_at`.
- **FR-011**: Organizer fallback MUST only apply to a missing user who has no
  order and enabled fallback for that menu; the action MUST be audit-noted.
- **FR-012**: Completed selections MUST keep up to 5 most recent; per-order
  feedback (rating 1–5 + optional remark) MUST be storable and exportable.
- **FR-013**: Every transition MUST broadcast its SSE event scoped to the office.

### Key Entities

- **FoodSelection**: `poll_id`/winner menu ref + `menu_name` snapshot, status
  (`active`/`overtime`/`ordering`/`claimed`/`delivering`/`delivery_due`/
  `completed`/`aborted`), `ends_at`, `order_placed_at`, `eta_minutes`,
  `eta_set_at`, `delivery_due_at`, `completed_at`, `claimed_by`, `created_by`,
  `office_location_id`.
- **FoodOrder (line item)**: `food_selection_id`, `nickname`, `item_id` +
  `item_name` snapshot, optional note, optional rating + remark, fallback/audit
  flags.

### Realtime / SSE Events

`food_selection_started`, `_overtime`, `_extended`, `_ordering_started`,
`_ordering_claimed`, `_delivery_started`, `_delivery_due`, `_eta_updated`,
`_completed`, `_aborted`.

### Data / Migration Impact

- Models `FoodSelection`, `FoodOrder` present in both Prisma schemas.
- Name snapshots (`menu_name`, `item_name`) stored alongside FKs.
- Order/rating export uses CSV (see `food-order-rating-export.test.ts`).

### Scope Flags

- Multi-office aware: **yes** — office-scoped.
- Auth scope: approved users act; extend/claim/organizer gated at the route.
- Email notification: **yes** — no-order reminders + organizer pings (best-effort).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Order changes are impossible outside `active` (verified by
  `food-selection-service.test.ts`, `food-selection-routes.test.ts`).
- **SC-002**: Exactly one claimer; post-claim mutations rejected
  (`food-selection-authz.test.ts`).
- **SC-003**: Delivery timer transitions `delivering`→`delivery_due` and
  completion sets `completed_at` (`food-selection-timer.test.ts`).
- **SC-004**: Fallback ordering respects all four preconditions.

## Assumptions

- Nickname is not a user entity (passed in requests).
- Late-meal cutoff is the claim, intentionally later than overtime→ordering.
- Reminder window from `FOOD_SELECTION_REMINDER_MINUTES_BEFORE` (default 5), only
  for vote nicknames that are valid emails.
- External ordering integration is out of scope.
