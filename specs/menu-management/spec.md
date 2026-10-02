# Feature Specification: Menu Management

**Feature Branch**: `n/a — existing feature on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/services/menu.ts`, `src/server/services/userMenuDefaults.ts`,
`src/server/routes/menus.ts`, `src/client/pages/ManageMenus.tsx`,
`src/client/components/NoMenusView.tsx`, tests
`tests/server/menu-service.test.ts`, `menu-routes.test.ts`,
`user-menu-defaults-service.test.ts`. Original prose:
`specs/old/menu-management.md`.

> Migrated spec — describes behavior already shipped.

## User Scenarios & Testing

### User Story 1 - Manage menus and items (Priority: P1)

Any user creates, renames, and deletes menus and their items; data persists and
syncs to all clients.

**Why this priority**: Menus are the precondition for every poll.

**Independent Test**: Create a menu + items, rename, delete; confirm uniqueness
errors and that connected clients update via SSE.

**Acceptance Scenarios**:

1. **Given** the Manage Menus screen, **When** a user creates a menu (name 1–60,
   trimmed, case-insensitively unique), **Then** it appears immediately and
   broadcasts an SSE menu update.
2. **Given** an existing menu, **When** a user adds an item (name 1–80 unique
   within menu; optional item-number 0–40, description 0–200, price 0–9999.99
   max 2 decimals), **Then** it is stored and listed in creation order.
3. **Given** a menu used as a past poll winner, **When** it is deleted (with
   confirmation, cascading its items), **Then** the poll record keeps the menu
   **name** as a plain string so history is intact.

### User Story 2 - First-run empty state (Priority: P2)

When no menus (or all empty) exist, the main view shows an empty state inviting
the first menu.

**Acceptance Scenarios**:

1. **Given** no usable menus, **Then** the main view shows "No menus yet. Create
   one to get started." with a create CTA.

### User Story 3 - Per-user default meals (Priority: P2)

A user configures a default meal + comment per menu and may opt into organizer
fallback ordering.

**Acceptance Scenarios**:

1. **Given** a menu with items, **When** the user sets a default meal (and
   optional default comment), **Then** it is stored per-user and does not change
   shared menu data.
2. **Given** a default, **When** the user opts into "allow organizers to order
   this for me", **Then** that menu becomes fallback-eligible (consumed by Food
   Selection); clearing the default removes the preference.

### User Story 4 - JSON menu import (Priority: P2)

A user imports a menu from a JSON file; import is atomic (all-or-nothing).

**Acceptance Scenarios**:

1. **Given** a valid import payload, **When** imported, **Then** a menu is created
   or matched case-insensitively by name and its items are **replaced** wholesale;
   menu metadata (name/location/phone/date-created) and item price/item-number
   persist.
2. **Given** any violation, **When** imported, **Then** nothing is written and the
   response is `400` with `{ error, violations: [{ path, message }] }` where path
   pinpoints the location (e.g. `menu[2].items[4].name`).

### Edge Cases

- **Duplicate menu name** (case-insensitive) on create/rename: rejected with a
  clear error.
- **Duplicate item name** within a menu: rejected.
- **Item referenced by an existing order** on delete: order keeps the item name
  snapshot.
- **Price** out of range / >2 decimals / non-finite: rejected.
- **Import partial failure**: never persists partial data.
- **Large imports**: imports of up to 1,000 items use bounded bulk writes; larger payloads are rejected before writing, and transaction timeouts report that no changes were applied.

## Requirements

### Functional Requirements

- **FR-001**: Menu name MUST be 1–60 chars, trimmed, case-insensitively unique.
- **FR-002**: Item name MUST be 1–80 chars, trimmed, unique within its menu;
  item-number 0–40, description 0–200, price nullable finite 0–9999.99 (≤2 dp).
- **FR-003**: Deleting a menu MUST cascade its items and require confirmation;
  poll winner records MUST retain the menu **name** snapshot.
- **FR-004**: Deleting an item MUST require confirmation; orders MUST retain the
  item **name** snapshot.
- **FR-005**: Menus MUST list alphabetically with item counts; items in creation
  order showing item-number/price when present.
- **FR-006**: Empty state MUST show the create CTA when no usable menus exist.
- **FR-007**: Per-user default meal + optional default comment + fallback opt-in
  MUST be stored per user and not mutate shared menu data; clearing removes it.
- **FR-008**: JSON import MUST be atomic, validate the full payload before any
  write, and report violations with exact JSON paths.
- **FR-009**: Import MUST match menus case-insensitively by name and replace all
  items on match; categories are ignored (no category model).
- **FR-010**: All menu changes MUST broadcast an SSE update to connected clients.

### Key Entities

- **Menu**: `name` (unique CI), optional `location`/`phone`/source-created
  timestamp (from import), `office_location_id`.
- **MenuItem**: `menu_id`, `name` (unique within menu), optional `item_number`,
  `description`, `price`.
- **UserMenuDefault**: `nickname`/user key, `menu_id`, default `item_id` +
  snapshot, optional default comment, fallback opt-in flag.

### Realtime / SSE Events

- Menu create/update/delete broadcast a menu-changed event consumed by clients to
  refresh the menu list (see `specs/realtime-events.md`).

### Data / Migration Impact

- Models `Menu`, `MenuItem`, user-default model in both Prisma schemas.
- Name snapshots: `winner_menu_name` (poll), `item_name` (order) protect history.
- Import persists menu metadata (`location`, `phone`, source created-at) + item
  `price`/`item_number`.

### Scope Flags

- Multi-office aware: **yes** — menus scoped by `office_location_id`.
- Auth scope: open to any user (no admin gate on menu CRUD).
- Email notification: no.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Uniqueness (CI) enforced on menu + item names
  (`menu-service.test.ts`).
- **SC-002**: Import is atomic and reports precise violation paths
  (`menu-routes.test.ts`).
- **SC-003**: Per-user defaults isolate per user
  (`user-menu-defaults-service.test.ts`).
- **SC-004**: Deletions preserve historical name snapshots in polls/orders.

## Assumptions

- Categories in import are intentionally ignored (no category model today).
- Import replaces all items on a name match (not a merge).
- Price stored as a 2-decimal numeric within 0–9999.99.
- Menu images / nutrition / per-user visibility are out of scope.
