# Spec: Multi-Office Support

## Topic of Concern
The app should support multiple office locations while keeping the existing lunch workflow simple for regular users.

This first design targets:
- one or more office locations per regular user, with one preferred office for default context
- global admins who can manage all offices
- office-scoped menus, shopping lists, polls, food selections, and related analytics

Phase 1 now includes multi-office membership for regular users while still keeping a single preferred office for default context.

## Goals

- Allow the same deployment to serve multiple office locations.
- Ensure regular users only see and affect data for their own office.
- Allow admins to remain global and manage users and data across offices.
- Keep the current UX mostly implicit for regular users: they should not need to choose an office on every screen.
- Preserve room for later expansion to multi-office membership or an office switcher.

## Non-Goals

- Per-office admin roles separate from global admins.
- Cross-office lunch flows.
- Sharing one poll or one shopping list across offices.
- Full tenant isolation at deployment/database level.

## Core Model

### Office Location

Introduce a new persisted office entity:
- `office_locations`
  - `id`
  - `key` stable unique identifier, short and slug-like
  - `name` human-readable office name
  - `is_active`
  - `auto_start_poll_enabled`
  - `auto_start_poll_weekdays`
  - `auto_start_poll_finish_time`
  - `default_food_selection_duration_minutes`
  - `created_at`
  - `updated_at`

Examples:
- `berlin`
- `munich`
- `zurich`

### Office-Level Lunch Defaults

Each office can now carry its own lunch-flow defaults:
- automatic poll scheduling on selected weekdays
- a target poll finish time (`HH:MM`) for those scheduled weekdays
- a default food-selection duration in minutes

The current implementation interprets the finish time in the server's local timezone and opens the automatic poll within the preceding hour. If the app comes up late during that window, the scheduler shortens the poll so it still ends at the configured finish time when possible.

### User Office Assignment

Each regular user belongs to one or more office locations.

Global admins:
- are not restricted to one office for visibility purposes
- may still optionally have a default office for UI defaults, but that is not required for phase 1

Initial approach:
- keep nullable `office_location_id` on auth-access users as the preferred/default office
- add a user-office membership table for all assigned offices
- backfill existing users into that membership table from their current preferred office
- make at least one office membership required for approved non-global users after migration is complete

## Visibility Rules

### Regular Users

Regular users can only access data for their assigned office:
- menus
- menu items through their menu
- polls
- poll votes
- food selections
- food orders
- shopping-list items
- user menu default preferences for menus in their office
- dashboard/history/analytics derived from their office data

Regular users must not:
- see other office menus
- see other office shopping lists
- receive other office SSE events
- receive other office email notifications

### Global Admins

Global admins can:
- manage users across all offices
- create and edit office locations
- manage menus for any office
- see shopping lists for any office
- create or manage polls/food selections for any office

For UI simplicity, global admins should operate in one selected office context at a time for office-scoped screens.

## Office Scoping By Domain

### Menus

Menus become office-scoped.

Rules:
- each menu belongs to exactly one office
- menu names only need to be unique within one office, not globally
- the same restaurant/menu may exist independently in multiple offices

Implication:
- existing unique constraint on menu name likely needs to become `(office_location_id, name)`

### Menu Default Preferences

Default meal preferences remain per user per menu.

Because menus become office-scoped:
- preferences become implicitly office-scoped through `menu_id`
- no extra office column is required if `menu_id` remains authoritative

### Polls

Polls become office-scoped.

Rules:
- only one non-finished poll may exist per office
- different offices may have active polls at the same time
- vote counting and tie handling remain unchanged, but within one office only

Implication:
- current single-active-poll guard must become per-office
- this is implemented in phase 74.4

### Food Selections and Orders

Food selections become office-scoped, either:
- directly via `office_location_id`, or
- indirectly via the poll

Recommendation:
- store `office_location_id` directly on `food_selections` even if it is derivable from the poll

Reason:
- simpler filtering
- easier retention/history queries
- safer if future workflows create food selections from other sources

Implementation note:
- this direct office column is implemented in phase 74.4

Food orders remain scoped through their selection.

### Shopping List

Shopping-list items become office-scoped.

Rules:
- one office shopping list per office context
- users only see their office list
- global admins can inspect any office list

### Dashboard / History / Analytics

All dashboard widgets and statistics become office-scoped for regular users:
- most popular menus
- most popular meals
- most ordered item across menus
- team lunch history
- rating prompts
- average rating

Global admins should see these in their currently selected office context, not as one mixed global dataset by default.

Implementation note:
- phase 74.5 makes the existing dashboard/history widgets office-specific by feeding them office-scoped SSE initial state plus office-scoped history and menu endpoints

## Authentication and Authorization

### Approval Workflow

Approved users must have an office assignment before they can fully use the app.

Open question resolved for phase 1:
- pending users may register before assignment
- an admin must assign an office as part of approval or immediately after approval

Recommended approval rule:
- a non-admin user cannot transition to usable approved state without at least one assigned office membership

### Admin Model

Keep the existing global admin model.

That means:
- `is_admin = true` still means global admin
- no office-limited admin role yet

This keeps permissions simple during the first multi-office rollout.

## UI Behavior

### Regular Users

Regular users do not manually switch office.

They should:
- see their office name in the header or account area
- implicitly use that office for all office-scoped views

### Global Admins

Global admins need an office context selector for office-scoped screens:
- dashboard
- menus
- shopping list
- poll/food-selection flow

Recommended first UI:
- add a compact office selector in the header for global admins
- show the same selector for regular users only when they have more than one assigned office
- persist the selected office locally

Implementation note:
- phase 74.6 implements this with a header selector that persists the selected office locally and passes it to office-scoped REST/SSE calls via `officeLocationId`
- phase 74.7 extends the selector to multi-office regular users and validates that the selected office belongs to the user's assigned-office set

### User Management UI

Admin user-management screens need office assignment controls:
- assign office during approval
- change office later for a regular user
- show office for each listed user

## API and Service Design

### Office Resolution

Every office-scoped request must resolve an office context before business logic runs.

Recommended pattern:
- regular user: office comes from the authenticated user's assigned-office set, with optional explicit selection when they belong to multiple offices
- global admin: office comes from explicit request parameter/header/query when needed

Interim phase-1 rollout note:
- until the global-admin office selector is implemented, office-less global admins may temporarily fall back to the seeded `default` office for office-scoped screens
- this is a transitional behavior only and should be removed once 74.6 is complete

Do not trust arbitrary office IDs from regular users.

### Service Layer

All office-aware services should take explicit office input where appropriate, for example:
- `listMenus(officeLocationId)`
- `startPoll(officeLocationId, ...)`
- `listShoppingListItems(officeLocationId)`

This keeps office scoping visible in signatures instead of hidden in route glue.

## Realtime / SSE

Realtime delivery must become office-aware.

Current risk:
- if all clients receive all events, offices leak data to each other

Required change:
- track subscriber office context
- broadcast only to matching office subscribers
- still allow global-admin subscribers to receive events for their selected office context only

Initial-state hydration must also be office-scoped.

Implementation note:
- this is implemented in phase 74.5 by resolving office context when `/api/events` is opened and using that office for both `initial_state` and subsequent broadcasts

## Email / Notifications

Office-related notifications must target users of the relevant office only:
- new poll created
- food-selection reminders
- fallback-order reminders
- shopping-list notifications if added later

Phase 74.4 behavior:
- poll-start notifications target approved, unblocked users for the poll office
- approved global admins are still included in poll-start notifications so they retain cross-office operational awareness

Global admin notifications about approval workflow remain global.

## Migration Strategy

### New Office Table

1. Create `office_locations`
2. Seed at least one default office, for example `default`

### Existing Records

All existing office-scoped records need a default office assignment:
- menus
- polls
- food selections
- shopping-list items
- user menu default preferences through their menus or users
- auth-access users

Recommended first migration:
- assign all legacy records to one default office
- keep the app behavior effectively unchanged until a second office is introduced

### Constraint Tightening

Use a staged migration:
1. add nullable office columns
2. backfill data
3. add indexes/foreign keys/uniques
4. make required columns non-null where appropriate

## Data Model Recommendation

Phase-1 office columns:
- `auth_access_users.office_location_id` nullable initially, used as preferred/default office
- `auth_access_user_offices (auth_access_user_id, office_location_id)` for assigned memberships
- `menus.office_location_id` required
- `polls.office_location_id` required
- `food_selections.office_location_id` required
- `shopping_list_items.office_location_id` required

Likely indexes:
- `menus (office_location_id, name)` unique
- `polls (office_location_id, status)` non-unique support index
- `shopping_list_items (office_location_id, bought, created_at)`
- `food_selections (office_location_id, status, created_at)`

## Testing Requirements

New test coverage should prove:
- regular users cannot read/write another office’s data
- global admins can manage data across offices
- one active poll is enforced per office, not globally
- SSE initial state is office-scoped
- SSE events do not leak across offices
- dashboard analytics only include the active office
- shopping list only shows the active office
- approval/admin flows handle office assignment

## Rollout Plan

### Phase 1

- add office-location model
- assign one or more offices per regular user with one preferred office
- add admin office-assignment UI

### Phase 2

- scope menus and shopping list by office

### Phase 3

- scope polls, food selections, orders, reminders, and dashboard/history by office

### Phase 4

- make SSE office-scoped
- add global-admin office selector

### Phase 5

- harden migration constraints and cleanup edge cases

## Open Questions

These should be resolved before implementation starts:

1. Should bootstrap admin require an office assignment for UI defaults, or stay fully office-less?
   Recommendation: optional default office, not required.

2. Should local-auth generated users require office assignment at creation time?
   Recommendation: yes for non-admin users.

3. Should global admins see cross-office aggregate analytics anywhere?
   Recommendation: no in phase 1; keep analytics office-scoped.

4. Should menus be copied between offices or shared by template?
   Recommendation: separate per-office menu records in phase 1.

5. Should users be able to change their own office?
   Recommendation: no; admin-managed only.

6. Should there be office-scoped admins distinct from global admins?
   Recommendation: yes in a follow-up phase; office admins should be able to fully operate their managed offices without receiving cross-office powers.
