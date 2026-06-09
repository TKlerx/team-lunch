# Feature Specification: Multi-Office Support

**Feature Branch**: `n/a — existing capability on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/services/{officeLocation,officeContext,officePollSchedule}.ts`,
office-scoping across `poll.ts`/`foodSelection.ts`/`menu.ts`/`shoppingList.ts`,
`src/server/sse.ts` (office-aware broadcast), `src/client/context/
AdminOfficeContext.tsx`, tests `tests/server/office-location-service.test.ts`,
`office-poll-schedule.test.ts`. Original prose: `specs/old/multi-office.md`.

> Migrated, **cross-cutting** spec. Multi-office is not a screen — it is an
> isolation capability threaded through every office-scoped feature. Most of the
> phased rollout (offices 74.1–74.7) is shipped.

## User Scenarios & Testing

### User Story 1 - Office-isolated data for regular users (Priority: P1)

A regular user only ever sees and affects data for their assigned office; offices
never leak into each other.

**Why this priority**: Isolation is the core guarantee — a leak is a correctness +
privacy failure.

**Independent Test**: Seed two offices with menus/polls/lists; act as an office-A
user and confirm office-B data is never readable, writable, or received via SSE.

**Acceptance Scenarios**:

1. **Given** two offices, **When** an office-A user lists menus/polls/shopping
   list, **Then** only office-A records return.
2. **Given** an active poll in office A, **When** office B starts a poll, **Then**
   it succeeds — single-active-poll is enforced **per office**, not globally.
3. **Given** an SSE subscriber in office A, **When** an office-B event fires,
   **Then** the office-A client does not receive it; `initial_state` hydration is
   office-scoped.

### User Story 2 - Global admin cross-office management (Priority: P1)

A global admin manages users and data across all offices, operating in one
selected office context at a time for office-scoped screens.

**Acceptance Scenarios**:

1. **Given** a global admin, **When** they select an office in the header
   selector, **Then** office-scoped screens (dashboard, menus, shopping list,
   poll/food flow) use that office via `officeLocationId`.
2. **Given** a global admin, **When** they manage users, **Then** they can assign
   /change a user's office across all offices.

### User Story 3 - Per-office lunch defaults & auto-start (Priority: P2)

Each office carries its own auto-start poll schedule and default food-selection
duration.

**Acceptance Scenarios**:

1. **Given** an office with `auto_start_poll_enabled` on selected weekdays and a
   finish time, **When** that window arrives, **Then** a poll auto-opens within the
   preceding hour (server local tz), shortened if the app came up late so it still
   ends at the configured finish time when possible.
2. **Given** an office `default_food_selection_duration_minutes`, **Then** auto-
   started food selection uses it (outside test runtime).

### User Story 4 - Multi-office membership (Priority: P2)

A regular user may belong to multiple offices with one preferred default; the
header selector appears when they have more than one.

**Acceptance Scenarios**:

1. **Given** a user with >1 assigned office, **When** they pick an office, **Then**
   the selection is validated against their assigned set and persisted locally.

### Edge Cases

- **Arbitrary office id from a regular user**: rejected — never trusted; resolved
  from the user's assigned set.
- **Office-less global admin (transitional)**: may temporarily fall back to the
  seeded `default` office until the admin selector is in use.
- **Approved non-admin without an office**: not allowed to reach usable state —
  needs ≥1 office membership.

## Requirements

### Functional Requirements

- **FR-001**: An `OfficeLocation` entity MUST exist with a slug-like `key`, name,
  active flag, and per-office lunch defaults (auto-start schedule + finish time +
  default food-selection duration).
- **FR-002**: Menus, polls, food selections, shopping-list items MUST carry
  `office_location_id`; menu name uniqueness MUST be `(office_location_id, name)`.
- **FR-003**: Single-active-poll MUST be enforced per office.
- **FR-004**: Every office-scoped request MUST resolve office context before
  business logic; regular users from their assigned set, global admins from an
  explicit selection. Arbitrary office ids MUST NOT be trusted.
- **FR-005**: Office-aware services MUST take explicit office input in their
  signatures (e.g. `startPoll(..., officeLocationId)`).
- **FR-006**: SSE MUST track subscriber office context and broadcast only to
  matching-office subscribers; `initial_state` MUST be office-scoped.
- **FR-007**: Office notifications MUST target the relevant office's users; global
  admins remain included on poll-start for cross-office awareness; approval-
  workflow admin notifications stay global.
- **FR-008**: A user MUST belong to ≥1 office (with one preferred); admins MAY be
  office-less for visibility.
- **FR-009**: Admin user-management MUST allow office assignment at/after approval.

### Key Entities

- **OfficeLocation** (`office_locations`): `key`, `name`, `is_active`,
  `auto_start_poll_enabled`, `auto_start_poll_weekdays`,
  `auto_start_poll_finish_time`, `default_food_selection_duration_minutes`.
- **User-office membership** (`auth_access_user_offices`): user ↔ office (many).
- **AuthAccessUser.office_location_id**: nullable preferred/default office.

### Realtime / SSE Events

- No new events; all existing events become **office-scoped** at broadcast +
  hydration time (see `src/server/sse.ts` `officeLocationId` param).

### Data / Migration Impact

- Staged migration: add nullable office columns → backfill to seeded `default`
  office → add indexes/FKs/uniques → tighten non-null where appropriate.
- Suggested indexes: `menus(office_location_id, name)` unique,
  `polls(office_location_id, status)`,
  `shopping_list_items(office_location_id, bought, created_at)`,
  `food_selections(office_location_id, status, created_at)`.
- Both Prisma schemas carry the office columns.

### Scope Flags

- Multi-office aware: **this is the capability**.
- Auth scope: regular users office-bound; global admins cross-office.
- Email notification: office-targeted (poll start, reminders).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Regular users cannot read/write another office's data.
- **SC-002**: SSE events + initial state do not leak across offices.
- **SC-003**: One active poll per office (not global).
- **SC-004**: Dashboard/history analytics include only the active office.
- **SC-005**: Office model + scheduling verified by
  `office-location-service.test.ts`, `office-poll-schedule.test.ts`.

## Assumptions

- Global admin model only (no office-scoped admin role yet — follow-up).
- Menus are separate per-office records (not shared/templated).
- Users cannot self-change office (admin-managed).
- Auto-start finish time interpreted in server local timezone.
- No cross-office aggregate analytics in phase 1.
