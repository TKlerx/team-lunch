# Feature Specification: Canonical App Routes

**Feature Branch**: `001-canonical-routes`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Introduce real, shareable URLs for meal polls, food selection/order flows, shopping list, and existing app sections so users can refresh, bookmark, share, and e2e-test direct views without breaking the live phase-driven Team Lunch flow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Core App Sections by URL (Priority: P1)

A team member can open or share stable URLs for the main dashboard, menu management, shopping list, settings, and administration surfaces. Refreshing the browser keeps the user on the same surface instead of returning them to the dashboard.

**Why this priority**: These URLs give immediate value for daily use and automated testing while touching the least risky part of the app.

**Independent Test**: Can be tested by opening each section URL directly and verifying the expected page appears while the global app shell remains available.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they open `/shopping-list`, **Then** the shopping list view is shown.
2. **Given** an authenticated user, **When** they open `/menus`, `/settings`, or `/admin`, **Then** the matching section is shown and the header navigation highlights the active section.
3. **Given** an authenticated user on any section URL, **When** they refresh the page, **Then** they remain on the same section after the app loads.

---

### User Story 2 - Share Current Lunch Flow Links (Priority: P2)

A user can copy a URL for the current poll or current meal-selection flow and send it to another user. Opening that URL shows the matching live phase when that process is still current.

**Why this priority**: Active lunch coordination is the core workflow; URLs make support, debugging, and collaboration easier without changing the live phase model.

**Independent Test**: Can be tested by opening a poll or food-selection URL while the corresponding process is active and verifying the live phase view appears.

**Acceptance Scenarios**:

1. **Given** poll `poll-1` is the active or tied poll, **When** a user opens `/polls/poll-1`, **Then** the current poll phase view is shown.
2. **Given** food selection `fs-1` is the active, ordering, delivering, or due process, **When** a user opens `/food-selections/fs-1`, **Then** the current food-selection phase view is shown.
3. **Given** a user opens a poll or food-selection URL that does not match the current process, **When** the app has loaded, **Then** the user sees a clear not-current or not-found message with a way back to the dashboard.

---

### User Story 3 - Link to Completed Meal History (Priority: P3)

A user can open a completed meal by URL from history. The URL can be refreshed or shared and will show that completed meal summary when it is present in the available history.

**Why this priority**: Completed meals are useful for ratings, audits, and support, but they depend on the history list already available to the app.

**Independent Test**: Can be tested by opening `/food-selections/{completed-id}` for a known completed selection and verifying the historical summary appears.

**Acceptance Scenarios**:

1. **Given** completed food selection `fs-history` is present in history, **When** a user opens `/food-selections/fs-history`, **Then** the historical completed view is shown.
2. **Given** a user selects a completed lunch from the orders rail, **When** the detail opens, **Then** the browser URL changes to `/food-selections/{id}`.
3. **Given** the selected completed meal is not present in history for the user's office, **When** the user opens its URL, **Then** the app shows a clear unavailable state and offers a dashboard link.

### Edge Cases

- The app may not have received its initial realtime state yet; route-specific unavailable messages should wait until initial load completes.
- A poll or food-selection URL may point to a process from another office or one the current user cannot access; the app should not reveal private details and should show an unavailable state.
- Existing links to `/shopping` should continue to work and lead to the canonical shopping-list surface.
- Direct URLs must work under custom deployment prefixes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose stable section URLs for dashboard, menu management, shopping list, settings, and administration.
- **FR-002**: The system MUST treat `/shopping-list` as the canonical shopping list URL while preserving compatibility for existing `/shopping` links.
- **FR-003**: The system MUST expose a poll detail URL shaped as `/polls/{pollId}` for the current active, tied, or just-finished poll flow.
- **FR-004**: The system MUST expose a food-selection detail URL shaped as `/food-selections/{foodSelectionId}` for current and completed meal-selection flows available to the user.
- **FR-005**: The system MUST update the browser URL when a user opens a completed lunch from the orders rail.
- **FR-006**: The system MUST keep the dashboard URL as the default live Team Lunch entry point.
- **FR-007**: The system MUST preserve browser refresh and back/forward behavior for all canonical URLs.
- **FR-008**: The system MUST show a clear unavailable state when a poll or food-selection URL does not match data available to the current user.
- **FR-009**: The system MUST keep realtime updates active while users are on canonical URLs.
- **FR-010**: The system MUST avoid changing access rules; routes must show only information already available to the current signed-in user.

### Key Entities *(include if feature involves data)*

- **Poll URL**: A shareable address for an active, tied, or just-finished poll visible to the user.
- **Food Selection URL**: A shareable address for a current or completed meal-selection process visible to the user.
- **Section URL**: A stable address for a top-level app surface such as menus, shopping list, settings, or administration.

### Realtime / SSE Events *(include if feature changes shared state)*

- No new realtime events are required. Existing realtime state must continue to drive route content.

### Data / Migration Impact *(include if feature touches persisted data)*

- New/changed models or columns: none
- Both Postgres and SQLite schemas updated: no
- Name-snapshot column needed alongside any FK: no
- `tests/server/helpers/db.ts` cleanup extended for new persisted models: no

### Scope Flags *(Team Lunch optional surfaces)*

- Multi-office aware: yes - route data must remain scoped to the selected or assigned office
- Auth scope: local-auth / Entra SSO, matching existing page access
- Email notification involved (Microsoft Graph): no

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can directly open the dashboard, menus, shopping list, settings, and administration surfaces by URL with no extra navigation.
- **SC-002**: Users can refresh a canonical section or detail URL and remain on the same meaningful surface after initial loading completes.
- **SC-003**: At least one automated browser-level test can start from a non-root URL and complete without using the dashboard as a setup step.
- **SC-004**: Existing `/shopping` links continue to reach the shopping list, while new navigation points to `/shopping-list`.
- **SC-005**: Invalid or stale detail URLs show an unavailable state with a dashboard recovery action instead of a blank page.

## Assumptions

- Existing authentication, authorization, and office scoping remain unchanged.
- This first slice uses data already delivered to the client through current app bootstrap and realtime updates.
- Historical food-selection URLs are available for history entries already loaded for the user's office.
- Historical poll permalink pages beyond the current visible poll flow are out of scope for this slice.
