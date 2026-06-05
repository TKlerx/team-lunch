# Feature Specification: Shared Shopping List

**Feature Branch**: `n/a — existing feature on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/services/shoppingList.ts`, `src/server/routes/shoppingList.ts`,
`src/client/pages/ShoppingList.tsx`, tests
`tests/server/shopping-list-service.test.ts`, `shopping-list-routes.test.ts`.
Original prose: `specs/old/shopping-list.md`.

> Migrated spec — describes behavior already shipped.

## User Scenarios & Testing

### User Story 1 - Track shared office supplies (Priority: P1)

Any user adds office-supply/snack items to a shared list and marks them bought;
bought items stay visible for traceability and the list updates live.

**Why this priority**: The whole feature — a lightweight shared list.

**Independent Test**: Add items, mark one bought, confirm it moves to the Bought
section and connected clients update via SSE.

**Acceptance Scenarios**:

1. **Given** the Shopping List screen, **When** a user adds an item (name +
   requester), **Then** it appears in the **To Buy** section and a
   `shopping_list_item_added` SSE event broadcasts.
2. **Given** an open item, **When** a user marks it bought, **Then** `bought=true`
   with `bought_by`/`bought_at` set, it moves to the **Bought** section grouped by
   purchase date, and `shopping_list_item_updated` broadcasts.
3. **Given** multiple open items, **When** a user triggers "Bought all", **Then**
   all pending items are marked bought.

### Edge Cases

- **Mark an already-bought item**: no-op / idempotent.
- **Office scope**: users only see their own office's list (see multi-office).

## Requirements

### Functional Requirements

- **FR-001**: Any user MUST be able to add a shopping-list item (name +
  `requested_by`).
- **FR-002**: Any user MUST be able to mark an open item bought, recording
  `bought_by` + `bought_at`.
- **FR-003**: Bought items MUST remain visible in a Bought section grouped by
  purchase date.
- **FR-004**: A "Bought all" action MUST mark all pending items bought.
- **FR-005**: List changes MUST broadcast SSE so connected clients update live.
- **FR-006**: The list MUST be office-scoped (`office_location_id`).

### Key Entities

- **ShoppingListItem**: `name`, `requested_by`, `bought`, `bought_by`,
  `bought_at`, `created_at`, `updated_at`, `office_location_id`.

### Realtime / SSE Events

- **shopping_list_item_added** — new open item.
- **shopping_list_item_updated** — item marked bought (or changed).

### Data / Migration Impact

- Model `ShoppingListItem` in both Prisma schemas; office column +
  suggested index `(office_location_id, bought, created_at)`.

### Scope Flags

- Multi-office aware: **yes**.
- Auth scope: open to any user in the office; admins can inspect any office.
- Email notification: no (a follow-up candidate per multi-office prose).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Adding/marking-bought behaves per spec
  (`shopping-list-service.test.ts`).
- **SC-002**: Routes `GET /api/shopping-list`, `POST /api/shopping-list`,
  `POST /api/shopping-list/:id/bought` behave correctly
  (`shopping-list-routes.test.ts`).
- **SC-003**: Bought items remain visible, grouped by date.

## Assumptions

- Nickname identity for `requested_by`/`bought_by` (client-supplied string).
- No item deletion in scope — bought items are kept for traceability.
- No quantities/categories — name-only items.
