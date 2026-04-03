# Implementation Plan

> Tests are first-class citizens — each feature task includes its corresponding tests.
> **Testing policy:** No task is complete until its unit/integration tests pass. Write tests alongside (or before) implementation, never deferred to a later task.

---

## Priority 1 — Project Scaffolding & Infrastructure

- [x] **1.1 Initialize Node project & test infrastructure** *(done)*
  - package.json, tsconfig.json, vitest.config.ts (two projects: server+client), eslint.config.js, tests/server/setup.ts, tests/client/setup.ts, smoke test passing
  - `npm run validate` passes (typecheck + lint + test)
  - ESLint 9 flat config used with @typescript-eslint

- [x] **1.2 Docker & database setup** *(done)*
  - docker-compose.yml (PostgreSQL 16 + app), Dockerfile (multi-stage), .env.example, prisma/init-citext.sql

- [x] **1.3 Prisma schema & initial migration** *(done)*
  - All 6 tables created with UUID PKs, cascade deletes, unique constraints, snapshot name columns
  - Note: Prisma doesn't support citext natively — case-insensitive uniqueness enforced in service layer
  - DB exposed on host port 5433 (5432 was occupied by another project)

- [x] **1.4 Vite & Tailwind configuration** *(done)*
  - vite.config.ts (React SWC plugin, /api proxy), tailwind.config.ts, postcss.config.js, index.html, src/client/main.tsx with minimal App

---

## Priority 2 — Shared Types & Server Foundation

- [x] **2.1 Shared TypeScript types (`src/lib/`)** *(done)*
  - All domain types, enums, API request/response shapes, and SSE event union type defined

- [x] **2.2 Prisma client singleton (`src/server/db.ts`)** *(done)*
  - Single PrismaClient instance exported; DB integration test deferred to when services are tested

- [x] **2.3 SSE manager (`src/server/sse.ts`)** *(done)*
  - register, broadcast, sendInitialState, formatPoll, formatFoodSelection
  - 4 unit tests: headers, broadcast to all clients, disconnect cleanup, ended client removal

- [x] **2.4 Fastify server entry point (`src/server/index.ts`)** *(done)*
  - buildApp() factory, CORS, /api/events SSE, /api/health
  - Route modules will be registered as they are implemented

---

## Priority 3 — Menu Management (Backend + Tests)

- [x] **3.1 Menu service (`src/server/services/menu.ts`)** *(done)*
  - Full CRUD for menus and items with validation, case-insensitive uniqueness, SSE broadcasts
  - 26 unit tests covering all CRUD operations, validation, cascade delete, duplicate detection

- [x] **3.2 Menu routes (`src/server/routes/menus.ts`)** *(done)*
  - All 7 route endpoints implemented with proper error handling
  - 8 integration tests via supertest: CRUD round-trips, 409 duplicate, 400 validation, 404 not-found
  - **Discovery**: Server tests must run sequentially (fileParallelism: false) due to shared DB
  - **Discovery**: Prisma `mode: 'insensitive'` handles case-insensitive checks without citext extension

---

## Priority 4 — Poll Lifecycle (Backend + Tests)

- [x] **4.1 Poll service (`src/server/services/poll.ts`)** *(done)*
  - All 8 service functions implemented: startPoll, castVote, withdrawVote, endPoll, extendPoll, randomWinner, getActivePoll, getLatestCompletedPoll
  - 38 unit tests covering: duration validation, description validation, single active enforcement, vote counting, winner determination, tie detection, random winner, tie extension, vote expiry, retention rule, query helpers
  - **Discovery**: formatPoll from sse.ts needs to be mocked in tests since it's imported by the service

- [x] **4.2 Poll routes (`src/server/routes/polls.ts`)** *(done)*
  - All 7 route endpoints implemented: POST /api/polls, GET /api/polls/active, POST/DELETE votes, POST end/extend/random-winner
  - 15 integration tests via supertest: create, 409 conflict, 400 validation, active poll query, vote cast/withdraw round-trip, extend tied, random winner, end poll

- [x] **4.3 Server-side timer for poll expiry** *(done)*
  - Timer integrated directly in poll service: scheduleTimer on start/extend, clearTimer on end/random-winner
  - In-memory Map<pollId, timeout> with unref() to not block process exit
  - 4 tests: timer scheduled on start, rescheduled on extend, cleared on end, clearAllTimers utility

---

## Priority 5 — Food Selection Lifecycle (Backend + Tests)

- [x] **5.1 Food selection service (`src/server/services/foodSelection.ts`)** *(done)*
  - All 8 service functions: startFoodSelection, placeOrder, withdrawOrder, expireFoodSelection, extendFoodSelection, completeFoodSelection, getActiveFoodSelection, getLatestCompletedFoodSelection
  - Timer management integrated (same pattern as poll service): scheduleTimer on start/extend, clearTimer on expire/complete
  - 41 unit tests covering: duration validation (10/15/30), poll-must-be-finished, upsert orders, overtime rejection, extension, completion, retention rule (keep 5 most recent completed), query helpers
  - **Discovery**: Menu service exports `createItem` not `createMenuItem` — test helper needed to use the correct name
  - **Discovery**: Fake timers + async DB operations don't mix well for timer-fires-expiry tests; use real timers for timer registration/clearing tests, fake timers only for the simple fire-and-check case

- [x] **5.2 Food selection routes (`src/server/routes/foodSelections.ts`)** *(done)*
  - All 7 route endpoints: POST create, GET active, POST/DELETE orders, POST expire/extend/complete
  - Routes registered in server index.ts
  - 14 integration tests via supertest: create, 400/404 validation, order place/update/withdraw round-trip, overtime rejection, extend, complete

- [x] **5.3 Server-side timer for food selection expiry** *(done)*
  - Same pattern as poll timer: schedule `setTimeout` on start/extend, call `expireFoodSelection` on expiry
  - In-memory Map<selectionId, timeout> with unref() to not block process exit
  - 5 tests: timer scheduled on start, triggers expiry (fake timers), rescheduled on extend, cleared on completion, clearAllTimers utility

---

## Priority 6 — Client Foundation

- [x] **6.1 React app shell & routing (`src/client/`)** *(done)*
  - `main.tsx` updated: React 18 `createRoot`, wrapped in `BrowserRouter` + `AppProvider`
  - `App.tsx` — layout with Header + main content area + NicknameModal overlay
  - `Header.tsx` — app title "Team Lunch", "Manage Menus" nav link, nickname display (clickable for rename)
  - Routes: `/` (phase-driven `MainView`), `/menus` (placeholder `ManageMenus`)
  - `MainView.tsx` — renders placeholder card per AppPhase (full views in Priority 7)
  - Global CSS with Tailwind base/components/utilities (already in place)

- [x] **6.2 SSE hook (`src/client/hooks/useSSE.ts`)** *(done)*
  - Connects to `GET /api/events` via `EventSource`, registers listeners for all 17 event types
  - On `initial_state`: hydrates app state via `AppContext` reducer
  - Also fetches `GET /api/menus` on mount (menus not included in initial_state)
  - Full `AppContext` with `useReducer` handling all SSE event types + menu list
  - 16 tests via mock EventSource: connection, hydration, all event types, cleanup on unmount
  - **Discovery**: Used `dispatchRef` pattern to avoid stale closures in EventSource listeners
  - **Discovery**: Menus are not in SSE `initial_state` — we fetch via REST + keep in sync via SSE menu events

- [x] **6.3 App phase hook (`src/client/hooks/useAppPhase.ts`)** *(done)*
  - Pure `deriveAppPhase(state, nickname)` function + `useAppPhase` hook wrapper
  - Correctly derives all 9 phases from SSE state + nickname + menus
  - 14 tests covering all phase transitions, edge cases, and priority ordering
  - **Discovery**: POLL_FINISHED vs FOOD_SELECTION_COMPLETED disambiguation: check if `latestCompletedFoodSelection.pollId === latestCompletedPoll.id`

- [x] **6.4 Nickname hook & modal (`src/client/hooks/useNickname.ts`)** *(done)*
  - `useNickname` hook: read/write `team_lunch_nickname` from localStorage with validation
  - `NicknameModal.tsx`: full-screen overlay, reusable for first-visit + rename
  - Header nickname button opens rename dialog; first-visit modal blocks interaction
  - 9 tests: read from localStorage, save, trim, reject empty/too-long, clear, rename

---

## Priority 7 — Client Views

- [x] **7.1 Manage Menus page (`src/client/pages/ManageMenus.tsx`)** *(done)*
  - List menus alphabetically with item counts
  - Inline CRUD: create menu, rename, delete (with confirmation)
  - Per-menu: list items in creation order, add/edit/delete items
  - Empty state: "No menus yet. Create one to get started."
  - All mutations via REST API calls; SSE updates keep list in sync across clients
  - Created `src/client/api.ts` — centralized API helper module for all REST calls

- [x] **7.2 No Menus view** *(done)*
  - Centered empty-state card with message + "Create Menu" CTA
  - CTA navigates to `/menus` using React Router `<Link>`

- [x] **7.3 Poll Idle view** *(done)*
  - "Start a Poll" card: description input (1–120 chars) + duration picker (1h–12h in 15-min steps)
  - Collapsible recent completed poll result and recent food order display
  - Created `src/client/hooks/useCountdown.ts` — reusable countdown hook + `formatTime` helper

- [x] **7.4 Poll Active view** *(done)*
  - Poll description + SVG circular countdown ring with remaining time (HH:MM:SS or MM:SS)
  - Live vote histogram (bar chart per menu, real-time via SSE)
  - Voting panel: list of menus with toggle buttons to cast/withdraw votes
  - "I'll sit this one out" option to collapse voting panel

- [x] **7.5 Poll Tied view** *(done)*
  - Show tied menus and vote counts
  - "Extend voting" button with duration picker (5/10/15/30 min)
  - "Pick randomly" button

- [x] **7.6 Poll Finished view** *(done)*
  - Winning menu name (+ "chosen randomly from a tie" label if applicable)
  - Final vote counts
  - "Start Food Selection" CTA with duration picker (10/15/30 min)

- [x] **7.7 Food Selection Active view** *(done)*
  - Subtle countdown bar at top with remaining time
  - Order form (primary): radio-button item list from winning menu, notes field (0–200 chars), submit/update/withdraw buttons
  - Order board (secondary): live list of nickname · item · notes for all orders (real-time via SSE)
  - Two-column responsive grid layout (md:grid-cols-2)

- [x] **7.8 Food Selection Overtime view** *(done)*
  - Order form disabled (not shown — replaced by prompt)
  - Prompt: "Time's up! Extend or confirm the order?"
  - Duration picker (5/10/15 min) + "Confirm — we're done" button
  - Read-only order board on the right

- [x] **7.9 Food Selection Completed view** *(done)*
  - Final order summary list (nickname · item · notes)
  - "Start a new poll when you're ready" message (returns to Poll Idle on next cycle)
  - **Discovery**: All phase views are separate components in `src/client/components/`, imported by `MainView.tsx` which acts as the phase router

---

## Priority 8 — Client Component Tests

> Note: Many component tests are already written alongside their feature task (6.2–6.4).
> This priority covers the remaining **view-level** component tests not yet covered.

- [x] **8.1 Component tests with @testing-library/react** *(done)*
  - 112 new view-level component tests across 11 test files + shared test helpers (data factories, RouterWrapper)
  - NicknameModal (12), MainView (9), NoMenusView (3), Header (7), PollIdleView (11), PollActiveView (8), PollTiedView (8), PollFinishedView (11), FoodSelectionActiveView (12), FoodSelectionOvertimeView (10), FoodSelectionCompletedView (6), ManageMenus (15)
  - Total client tests: 151 (39 existing hook tests + 112 new component tests)
  - Total project tests: 307 (151 client + 156 server) across 25 test files
  - **Discovery**: @testing-library/react v16 does NOT auto-cleanup when vitest `globals=false` — must add explicit `afterEach(cleanup)` in setup.ts
  - **Discovery**: JSX text node splitting (e.g., `{count} votes each`) renders as separate DOM text nodes in JSDOM; use partial regex matchers like `/tied with/i` instead of exact string matching

---

## Priority 9 — Integration & Polish

- [x] **9.1 End-to-end SSE integration test** *(done)*
  - Real HTTP SSE connection via `http.get` to `/api/events`, no mocks on SSE module
  - 7 tests: initial_state (empty + with active poll), menu_created broadcast, full poll lifecycle event order, full food selection lifecycle events, multi-client delivery, disconnected client cleanup
  - **Discovery**: Fastify rejects `POST` with `Content-Type: application/json` and empty body — `httpRequest` helper must omit the header when no body is sent

- [x] **9.2 Retention rule integration tests** *(done)*
  - 5 integration tests via supertest: create 6 polls → only 5 retained, create 7 → only 5, create 6 food selections → only 5, create 7 → only 5, cascade-delete food selections when poll is deleted by retention
  - Tests verify actual DB state via Prisma queries after route calls

- [x] **9.3 Production build & Docker** *(done)*
  - Verified `npm run build` produces working output
  - Verified `docker compose up --build` starts full stack and exposes app on port 3000
  - Fixed production static serving in `src/server/index.ts` by registering `@fastify/static` for `dist/client` and SPA fallback to `index.html` for non-API routes
  - Verified `GET /api/health` returns `{"status":"ok"}` and `GET /` returns HTML in Dockerized production mode

- [x] **9.4 CI validation script** *(done)*
  - `npm run validate` runs `typecheck && lint && test` successfully with zero failures
  - Total project tests: 319 (151 client + 168 server) across 27 test files

---

## Priority 10 — New Features (Feb 2026)

- [x] **10.1 Smaller poll durations (5-min steps)** *(done)*
  - Change poll duration validation from "multiples of 15, 60–720 min" to "multiples of 5, 5–720 min"
  - Update `validateDuration()` in `src/server/services/poll.ts`
  - Update `PollIdleView.tsx` duration picker to generate 5..720 in steps of 5
  - Update all affected tests (poll-service, poll-routes, PollIdleView)
  - Update specs: `poll-lifecycle.md`, `AGENTS.md`

- [x] **10.2 Abort poll** *(done)*
  - Add `'aborted'` to `PollStatus` type in `src/lib/types.ts`
  - New `abortPoll(pollId)` function in poll service: sets `status='aborted'`, clears timer, runs retention, broadcasts `poll_ended` with `status:'aborted'`
  - New route `POST /api/polls/:id/abort`
  - Client: add abort handler to `AppContext` reducer (treat `poll_ended` with `status:'aborted'` → clear active poll, return to POLL_IDLE)
  - Client: add "Abort Poll" button (with confirmation dialog) to `PollActiveView` and `PollTiedView`
  - Aborted polls count toward 5-retention limit
  - After abort → app returns to `POLL_IDLE`
  - Full test coverage: service, route, SSE integration, client component tests

- [x] **10.3 Skip poll when single menu** *(done)*
  - When only one menu with items exists, skip the poll phase entirely
  - Server: new `createAutoFinishedPoll(menuId, menuName)` in poll service — creates a finished poll instantly with the single menu as winner, zero votes, no SSE broadcast; enforces active/tied check and retention
  - Server: new route `POST /api/food-selections/quick-start` — validates exactly one menu with items, auto-creates finished poll, starts food selection; accepts `{ durationMinutes }` (1, 5, 10, 15, 20, 25, 30)
  - Client: new `quickStartFoodSelection(durationMinutes)` API function
  - Client: `PollIdleView` detects single-menu-with-items condition → renders "Start Food Selection" card (green theme, duration picker, no description input) instead of poll start form
  - No changes needed to `useAppPhase` — `food_selection_started` SSE event naturally transitions all clients
  - Types: new `QuickStartFoodSelectionRequest` interface
  - Tests: 5 poll service tests (auto-poll creation, conflict checks, retention, allow new poll after), 6 route integration tests (success, no menus, multiple menus, empty menus ignored, invalid duration, active poll conflict), 8 client component tests (heading, menu name, duration picker, default duration, no description, submit, error, empty-menu filtering)
  - Total: 354 tests passing across 27 test files

- [x] **10.4 Poll/food UX for rapid testing** *(done)*
  - Poll active view: menu checkmarks remain toggleable, plus explicit "Withdraw my votes" action to withdraw from poll overall
  - Poll active view: public live board of voter nicknames and selected menu choices
  - Poll active view: confirmed "Finish poll now" action that persists `ended_prematurely=true`
  - Poll vote SSE payload changed to full `{ poll }` object so all clients stay in sync on both counts and voter choices
  - Food selection duration validation expanded to 1 minute plus 5-minute steps up to 30 minutes
  - Food selection active/overtime views: confirmed abort action; active view gets confirmed finish-now action via `POST /api/food-selections/:id/complete-now`
  - New backend route `POST /api/food-selections/:id/abort`; SSE event `food_selection_aborted`; client reducer clears active food selection on abort
  - **Discovery**: keeping `POST /api/food-selections/:id/complete` overtime-only avoids breaking existing overtime semantics and keeps premature active completion explicit
  - Validation: `./validate.ps1` passes (`typecheck`, `lint`, full `vitest`)

---

## Priority 11 — Orders History + Completion Metadata (Feb 2026)

- [x] **11.1 Spec updates for completion metadata + history UX** *(done)*
  - Update `specs/food-selection-lifecycle.md`: completed view shows completion date+time and ETA field (`HH:mm`)
  - ETA is editable after completion, but each update requires explicit user confirmation before submit
  - Update `specs/app-navigation.md`: add permanent left-side `Orders` rail spanning page content height (does not overlap header/footer)
  - Update `specs/realtime-events.md`: include ETA update event and history hydration expectations
  - Update `specs/data-model.md`: add persistence fields for completion timestamp + ETA
  - **Discovery**: history list displays menu name + completion date/time (no separate menu type field required)

- [x] **11.2 Data model + migration for completed timestamp and ETA** *(done)*
  - Add `completed_at TIMESTAMPTZ NULL` to `food_selections`
  - Add `eta_hhmm VARCHAR(5) NULL` to `food_selections`
  - Keep existing retention rule (5 latest completed) unchanged
  - Run Prisma migration + client generation
  - Applied migration: `prisma/migrations/20260227102438_add/migration.sql`

- [x] **11.3 Food selection service enhancements** *(done)*
  - Set `completed_at = now()` when completion occurs (both overtime confirm and finish-now paths)
  - Add ETA validator (`HH:mm`, 24h clock)
  - Add service method to update ETA for completed selections only
  - Add service method to fetch completed selection history ordered most-recent-first

- [x] **11.4 Routes + SSE for ETA and history** *(done)*
  - Add `GET /api/food-selections/history` (ordered descending by completion time)
  - Add `POST /api/food-selections/:id/eta` to set/update ETA on completed records
  - Add SSE event `food_selection_eta_updated` so all connected clients receive ETA changes in real time
  - Keep error contract `{ error: string }` and status mapping consistent

- [x] **11.5 Shared types + client state updates** *(done)*
  - Extend `FoodSelection` type with `completedAt` and `etaHhmm`
  - Add request type for ETA update payload
  - Extend app state with completed order history collection (not only latest)
  - Wire reducer handling for history hydration and ETA SSE updates

- [x] **11.6 App shell layout: left Orders rail** *(done)*
  - Refactor app body into two columns under header: fixed-width left rail + flexible main content
  - Left rail title: `Orders`
  - First item: visually distinct `Start new Team Lunch` action that triggers Phase 1
  - Remaining items: completed order history cards, most recent first

- [x] **11.7 History item details in main content** *(done)*
  - Clicking a history item renders the same order confirmation view used at end of Phase 2
  - Confirmation heading must support historical context (not always literal "Team Lunch order completed!")
  - Display in history cards: menu name + completion date/time

- [x] **11.8 Completion view metadata + ETA editor** *(done)*
  - Show completion date/time on completion page
  - Add ETA input in `HH:mm` format
  - Editing ETA requires explicit confirmation dialog prior to submit
  - Once saved, ETA is shown to all users and kept in sync via SSE

- [x] **11.9 Test coverage for new behavior** *(done)*
  - Server: service + route tests for completion timestamp, ETA validation/updates, history ordering
  - SSE integration: ETA update broadcast + late client hydration
  - Client: Orders rail rendering/order, Start new Team Lunch action, history detail navigation, completion ETA editor+confirmation
  - Update existing component tests impacted by title/text/layout changes

- [x] **11.10 Validation + plan update** *(done)*
  - Run `./validate.ps1` and fix all failures
  - Mark completed items and note discoveries/edge-cases in this plan
  - Validation passed: typecheck + lint + full tests (`385` tests across `29` files)
  - **Discovery**: timer tests that rely on fake timers require a short real-time flush for async DB expiry side effects

---

## Priority 12 — Phase 3 Delivery Tracking + Manual Arrival (Feb 2026)

- [x] **12.1 Introduce explicit Phase 3 delivery states** *(done)*
  - Added `delivering` and `delivery_due` food selection statuses
  - Added new app phases: `FOOD_DELIVERY_ACTIVE`, `FOOD_DELIVERY_DUE`
  - Completion of Phase 2 (`/complete`, `/complete-now`) now transitions to delivery phase, not finalized completion

- [x] **12.2 Replace HH:mm ETA with minute-based ETA countdown reset** *(done)*
  - Replaced ETA payload with `etaMinutes` (`1..240`)
  - Added persistence fields: `eta_minutes`, `eta_set_at`, `delivery_due_at`
  - ETA updates always use current server time as new start and restart countdown, even after due state

- [x] **12.3 Add delivery due + manual arrival confirmation flow** *(done)*
  - Added delivery timer management in food selection service
  - Added `food_selection_delivery_due` SSE event when delivery timer reaches zero
  - Added `POST /api/food-selections/:id/confirm-arrival` to finalize order (`status=completed`, immutable history)

- [x] **12.4 Enforce ongoing order lock for new cycles** *(done)*
  - `startPoll` and quick-start poll creation now reject with 409 while any selection is `delivering` or `delivery_due`
  - Orders rail highlights current ongoing order and disables start-new action during delivery phase

- [x] **12.5 Client delivery UX + tests** *(done)*
  - New `FoodDeliveryView` with countdown and messaging:
    - running: “Awaiting lunch delivery”
    - due: “Lunch should have arrived”
  - ETA editable in minutes with restart semantics; manual arrival confirmation required
  - Completed view is immutable and no longer editable
  - Added/updated client and server tests for phase derivation, routes, services, and delivery component

---

## Priority 13 — Completed View Copy Action + Permanent Background Styling (Feb 2026)

- [x] **13.1 Add order copy action at end of phase 3** *(done)*
  - Added `Copy order list` button to `FoodSelectionCompletedView`
  - Clipboard payload includes menu name, completion time, final ETA (if present), and per-user order lines
  - Added user feedback states for copy success and clipboard-unavailable/error

- [x] **13.2 Add permanent layered app background and translucent shell** *(done)*
  - Added full-page permanent background using `assets/cuisine-around-the-world.png`
  - Centered `assets/example-company-logo.svg` over the background image
  - Applied translucent app shell surfaces so the background subtly shines through (`Header`, `OrdersRail`, main content shell, completed view card)

- [x] **13.3 Client tests + validation** *(done)*
  - Extended `FoodSelectionCompletedView` tests to verify clipboard copy and error feedback
  - Validation passed via `./validate.ps1` (typecheck + lint + full tests)
  - **Discovery**: TypeScript needs `.d.ts` module declarations for imported static image assets; added `src/client/vite-env.d.ts` and included `.d.ts` files in `tsconfig.json`

- [x] **13.4 Background placement refinement (content-area only)** *(done)*
  - Moved cuisine/logo decorative background from full-viewport layer to main content area only
  - Reduced background footprint and centered it inside the right content pane
  - Ensures header and left Orders rail are not overdrawn by decorative background imagery

- [x] **13.5 Reduce background shine-through intensity** *(done)*
  - Increased shell opacity for main content, header, and Orders rail
  - Lowered cuisine background and logo opacity in main content background layer
  - Kept decorative imagery subtle to preserve readability and reduce visual distraction

- [x] **13.6 Explicit logo stacking over cuisine image** *(done)*
  - Split decorative stack into separate absolute layers
  - Cuisine image rendered at `z-0`; example company logo rendered exactly one layer above at `z-10`
  - App content remains above both via separate `z-10` content container

- [x] **13.7 Replace disabled start action with in-progress shortcut** *(done)*
  - During active Phase 1–3 flow, top rail action now shows `In Progress...` instead of disabled `Start new Team Lunch`
  - Clicking `In Progress...` navigates to `/` and returns user to the currently ongoing phase view
  - Updated Orders rail and app tests to cover label swap and navigation behavior

- [x] **13.8 Disable start action when no menu exists** *(done)*
  - `Start new Team Lunch` in the left rail is disabled when there are no menus with items
  - `In Progress...` remains clickable during active flows regardless of menu availability
  - Added test coverage in `OrdersRail` and `App` client tests for no-menu disabling

---

## Priority 14 — Menu JSON Import on Manage Menus (Planned)

- [x] **14.1 Spec + contract alignment for import payload and error shape** *(done)*
  - Menu import payload and all-or-nothing behavior documented in specs
  - Validation error contract finalized: `{ error: string, violations: { path, message }[] }`
  - Category blocks accepted for grouping; category field ignored by domain model

- [x] **14.2 Data model extension for menu metadata from import** *(done)*
  - Added menu fields: `location`, `phone`, `source_date_created`
  - Added menu item field: `price` (`NUMERIC(8,2)`)
  - Applied migration `20260227142430_add_menu_import_metadata_and_item_price`
  - Regenerated Prisma client

- [x] **14.3 Server import service with strict schema validation** *(done)*
  - Added full import parser/validator with multi-violation reporting
  - Mapped `ingredients` -> `description` and `price` -> `price`
  - Enforced price constraints: finite number, range `0..9999.99`, max 2 decimals
  - Validation runs before write path; invalid payloads are rejected atomically

- [x] **14.4 Atomic upsert-by-name import semantics** *(done)*
  - Added case-insensitive menu match by name
  - Existing menu path updates metadata and replaces all items
  - New menu path creates menu + items from import
  - Writes run inside Prisma transaction for all-or-nothing guarantees

- [x] **14.5 API route + shared types for import endpoint** *(done)*
  - Added `POST /api/menus/import` endpoint
  - Added shared request/response/violation types for import contract
  - Route returns validation violations on `400`

- [x] **14.6 Manage Menus UI import flow** *(done)*
  - Added `Import JSON` action with local file picker on Manage Menus
  - Added client import API and server-error violation rendering in UI
  - Added item price display in menu item rows (`€xx.xx`) for imported prices

- [x] **14.7 Test coverage (server + client) for import feature** *(done)*
  - Server service tests added: success path, replace-all update path, validation + atomic rejection
  - Route integration tests added: successful import + `400` violations response
  - Client tests added: upload trigger, import success state, violation list rendering

- [x] **14.8 Validation + plan update** *(done)*
  - `./validate.ps1` passed: typecheck + lint + full tests
  - Total suite now passing: `411` tests across `30` files
  - **Discovery**: In JSDOM test environment, `File.text()` may be unavailable; import UI now supports `FileReader` fallback for robust file parsing in tests and browsers

- [x] **14.9 Import UX confirmation + menu collapse + item column order** *(done)*
  - Added import preview endpoint (`POST /api/menus/import/preview`) returning created/updated/deleted item counts before apply
  - Manage Menus import flow is now two-step: file preview + explicit `Confirm Import` / `Cancel`
  - Added collapsible menu cards (default collapsed): collapsed state shows only menu name + item count
  - Expanded item table now follows requested order: `Item name -> Description -> Price -> Rename -> Delete`
  - Validation passed: `./validate.ps1` (`417` tests across `30` files)

---

## Priority 15 — Database Connectivity Loss UX + Safe Recovery (Mar 2026)

- [x] **15.1 Backend DB connectivity monitor + health reporting** *(done)*
  - Added `src/server/services/dbConnectivity.ts` with periodic probe (`SELECT 1`), connected/degraded state, and reconnect attempt counter
  - Extended `GET /api/health` to return DB status payload:
    - `{ status: 'ok' | 'degraded', db: { connected: boolean, attemptCount: number } }`
  - Added test-runtime guard in `buildApp`: DB monitor is disabled when `NODE_ENV==='test'` (or when `DISABLE_DB_CONNECTIVITY_MONITOR=true`)

- [x] **15.2 SSE initial-state resilience on DB outages** *(done)*
  - Hardened `sendInitialState` to catch DB read failures and emit a defined empty `initial_state` payload instead of failing the SSE flow
  - Keeps client initialization deterministic during transient DB outages

- [x] **15.3 Client DB outage modal + background retry visibility** *(done)*
  - Added `DatabaseConnectionModal` shown when DB is unavailable
  - Modal displays live reconnect attempt count from health polling
  - Added periodic `/api/health` polling in `useSSE` to update DB connectivity state while retrying in the background
  - Modal auto-hides when DB connectivity is restored

- [x] **15.4 Defined fallback on unexpected/undefined client state** *(done)*
  - Added `RESET_TO_INITIAL_STATE` action in `AppContext`
  - Reducer default branch now returns `initialAppState` to force a defined state on unknown actions
  - `useSSE` now resets to initial state on malformed `initial_state` payloads

- [x] **15.5 Unit tests for specified behavior** *(done)*
  - Added server tests: `tests/server/db-connectivity.test.ts`
  - Added client reducer safety tests: `tests/client/app-context.test.ts`
  - Extended client SSE tests for health-driven DB status updates: `tests/client/useSSE.test.ts`
  - Extended app tests to assert DB error modal visibility + attempt count: `tests/client/App.test.tsx`
  - Targeted suite for changed files passed (`36` tests)
  - **Discovery**: background DB monitor polling can degrade/slow long server test runs if enabled in tests; monitor is now disabled in test runtime to ensure reasonable termination time

---

## Priority 16 — Food Selection Multi-Item Ordering (Mar 2026)

- [x] **16.1 Multi-item selection in food selection phase** *(done)*
  - Backend order model updated to line-item semantics (no uniqueness on nickname/item), allowing repeated identical items per user in one selection
  - placeOrder now always creates a new line item so users can add duplicates (example: Pizza Salame, Pizza Salame, Pizza Salame hot)
  - withdrawOrder now supports optional orderId for single-line removal while preserving withdraw-all behavior
  - Client food selection active view restored explicit Add item action (radio select + per-line notes), plus per-line Remove controls
  - Public order board continues to show every line item entry in real time
  - Shared types/SSE reducer updated for optional orderId payload on order_withdrawn
  - Updated unit/integration tests: service, routes, and FoodSelectionActiveView behavior
  - Validation passed: ./validate.ps1 (438 tests across 32 files)
  - **Discovery**: replacing a legacy unique constraint may require dropping both the constraint and its underlying unique index in migration SQL (DROP CONSTRAINT + DROP INDEX IF EXISTS)

- [x] **16.2 Food selection wide layout + item search filter** *(done)*
  - Expanded food selection active/overtime containers from `max-w-3xl` to `max-w-[1400px]` to better use available horizontal space
  - Switched active/overtime two-column layout to `xl:grid-cols-3` with primary content spanning two columns (`xl:col-span-2`) and orders board in one column
  - Increased active/overtime scroll areas from `max-h-[55vh]` to `max-h-[65vh]` to reduce vertical scrolling pressure
  - Added item search input in active order form: `Search items (min. 3 chars)`
  - Search behavior applies only when trimmed input length is at least 3 characters; below threshold the full menu list remains visible
  - Search matches item name and description (case-insensitive) and shows an empty-state message when no matches are found
  - Added client tests for search field presence, <3-char no-filter behavior, and >=3-char filtering behavior
  - Validation passed: ./validate.ps1 (440 tests across 32 files)
  - **Discovery**: using a 3-column xl layout with a 2:1 span preserves readability while still utilizing wide displays and avoids over-condensed order-board content

- [x] **16.3 Delivery phase shows order list + copy action** *(done)*
  - Added read-only `Current orders` section to `FoodDeliveryView` so teams can place the real-world order during `Awaiting lunch delivery`
  - Added `Copy order list` action in delivery view (same clipboard UX pattern: success/error feedback)
  - Clipboard payload includes menu name, optional current ETA, and each order line (`nickname · item · notes`)
  - Delivery view now presents ETA controls/arrival confirmation alongside current order list in a responsive two-column content area
  - Added client tests for order-list visibility during delivery and clipboard copy behavior
  - Validation passed: ./validate.ps1 (442 tests across 32 files)
  - **Discovery**: test mocks for `FoodOrder` must include full shape via shared `makeFoodOrder` helper to satisfy strict typecheck (`orderedAt` required)

- [x] **16.4 Delivery timer dropdown menu for arrival + ETA actions** *(done)*
  - Replaced inline delivery controls with a single action menu opened by clicking the running timer in the `Awaiting lunch delivery` bar
  - Menu structure now includes: `Confirm lunch arrived`, ETA presets (`5..120` in 5-minute steps), and a single-line manual minutes input
  - `Confirm lunch arrived` triggers the same arrival confirmation flow as before
  - ETA preset buttons and manual entry both trigger the same ETA update flow (`updateFoodSelectionEta`) and keep existing validation (`1..240`)
  - Updated delivery view copy/order section to remain focused on read-only order list and clipboard action
  - Added/updated client tests for timer-menu preset update, manual-entry update, and confirm-arrival from menu
  - Validation passed: ./validate.ps1 (443 tests across 32 files)
  - **Discovery**: Enter-key submission in the manual input keeps the single-line control minimal while still allowing keyboard-only ETA updates

- [x] **16.5 Phase 1/2 timer-click completion action menu** *(done)*
  - Applied timer-action pattern to `PollActiveView` (Phase 1): clicking countdown opens action menu with `Confirm completion`
  - Applied timer-action pattern to `FoodSelectionActiveView` (Phase 2): clicking timer opens action menu with `Confirm completion`
  - Removed legacy inline "Finish now" controls from both active views to keep completion action co-located with the running timer
  - Completion behavior remains unchanged (same APIs): poll uses `endPoll`, food selection uses `completeFoodSelectionNow`
  - Wording generalized as requested: `Confirm completion`
  - Added/updated component tests for both views to verify timer menu interaction and completion API calls
  - Validation passed: ./validate.ps1 (445 tests across 32 files)
  - **Discovery**: using `window.confirm` keeps completion confirmation flow consistent across phases while simplifying inline UI state

- [x] **16.6 Phase 1/2 timer menu parity + outside-click dismissal fixes** *(done)*
  - Added missing timer-update entries to Phase 1 (`PollActiveView`) and Phase 2 (`FoodSelectionActiveView`) timer menus
  - Timer menu options now include quick picks (`5..120` in 5-minute steps) plus single-line manual minutes input (Enter submits)
  - Added backend endpoints for active-phase timer updates:
    - `POST /api/polls/:id/timer` → `updateActivePollTimer`
    - `POST /api/food-selections/:id/timer` → `updateActiveFoodSelectionTimer`
  - Reused existing SSE events (`poll_extended`, `food_selection_extended`) so client synchronization remains consistent
  - Added outside-click dismissal for timer menus in all active phases (Poll, Food Selection, Delivery)
  - Added/updated client tests for timer presets, manual entry, and outside-click close behavior
  - Added/updated server service + route tests for new timer update endpoints and validation/error cases
  - Validation passed: ./validate.ps1 (461 tests across 32 files)
  - **Discovery**: introducing dedicated `/timer` endpoints preserves existing tied/overtime extension semantics while enabling active-phase rapid timer adjustment

- [x] **16.7 Prevent new-cycle start at Phase 1 completion boundary** *(done)*
  - Fixed left-rail top action guard so `Start new Team Lunch` is disabled during `POLL_FINISHED` transition state
  - Updated app-shell action handler to hard-guard `START_NEW_TEAM_LUNCH` dispatch when phase is `POLL_FINISHED`
  - Added client regression test to ensure the button is disabled and non-dispatching in `POLL_FINISHED`
  - Validation passed: ./validate.ps1 (462 tests across 32 files)
  - **Discovery**: phase-based transition guards are required in addition to entity-presence guards (`activePoll`/`activeFoodSelection`) because Phase 1 completion is an intermediate state with no active entities

- [x] **16.8 Reusable timer+menu header component across phases** *(done)*
  - Added shared `TimerActionHeader` component (`src/client/components/TimerActionHeader.tsx`) encapsulating:
    - timer trigger button
    - dropdown container rendering
    - outside-click dismissal
    - optional due-state styling and ringing-clock indicator
  - Refactored `PollActiveView`, `FoodSelectionActiveView`, and `FoodDeliveryView` to use the shared header component for timer + action menu UI
  - Unified Phase 1 top section with the same header/timer pattern used in later phases while keeping existing poll visualization content below
  - Preserved existing per-phase menu actions and behavior (confirm completion/arrival, timer presets, manual minute entry)
  - Updated client tests to align with unified header structure and interaction targets
  - Validation passed: ./validate.ps1 (462 tests across 32 files)
  - **Discovery**: using a render-prop for menu content (`children({ closeMenu })`) keeps per-phase action logic flexible while centralizing dropdown/open-close behavior

---

## Priority 17 — Timer Header Ring + Unified Abort Action (Mar 2026)

- [x] **17.1 Make circular ring part of timer component (always visible)** *(done)*
  - Moved Phase 1 circular ring responsibility into shared `TimerActionHeader`
  - `TimerActionHeader` now always renders a reduced-size circular progress ring as part of the timer trigger UI
  - Removed center text from the ring; timer value remains as the button label
  - Updated `PollActiveView` to remove local `CountdownRing` rendering and pass timing inputs to shared header

- [x] **17.2 Ringing-clock indicator in all timer phases when time runs out** *(done)*
  - `TimerActionHeader` now derives time-up state from shared timing inputs (`remainingSeconds <= 0`) and supports due-state override
  - Poll active, food selection active, and delivery phases now all surface the ringing-clock indicator on timeout

- [x] **17.3 Add timer dropdown abort action and remove duplicate bottom links** *(done)*
  - Added `Abort process` action to timer dropdown menus in `PollActiveView`, `FoodSelectionActiveView`, and `FoodDeliveryView`
  - Dropdown order standardized as requested: green completion action, red abort action, then timer options/manual input
  - Removed legacy bottom-page abort controls from poll active and food selection active views where timer menu now owns the action

- [x] **17.4 Tests + validation** *(done)*
  - Updated client tests for poll active, food selection active, and delivery timer menus to cover `Abort process` action
  - Validation passed: `./validate.ps1` (`461` tests across `32` files)
  - **Discovery**: centralizing timeout/ring visuals in the shared timer header eliminates phase-level countdown duplication while preserving per-phase action menus via render-prop content

---

## Priority 18 — Menu URL Contact Metadata + Phase 3 Contact Display (Mar 2026)

- [x] **18.1 Add menu URL to data model and contracts** *(done)*
  - Added nullable `url` column to `menus` via Prisma schema and migration
  - Extended shared `Menu` type with `url: string | null`
  - Applied migration: `prisma/migrations/20260302105248_add_menu_url_contact_field/migration.sql`

- [x] **18.2 Extend menu JSON import metadata validation and persistence** *(done)*
  - Import parser now validates `menu[0].url` (`1..255` chars, valid absolute URL)
  - Import upsert path now persists `url` on both create and update
  - `formatMenu` now includes `url` in API responses

- [x] **18.3 Show menu contact info in Phase 3 delivery view** *(done)*
  - `FoodDeliveryView` now resolves the selected menu from app state and renders a `Restaurant contact` block
  - Displayed fields: location, phone, and URL (URL rendered as clickable external link)
  - Contact block is conditional and only shown when at least one contact field exists

- [x] **18.4 Tests, sample data, and validation** *(done)*
  - Updated server tests (`menu-service`, `menu-routes`) for required import `url` metadata and persisted response assertions
  - Updated client helpers/factories (`helpers.tsx`, `useAppPhase.test.ts`, `useSSE.test.ts`) for new `Menu.url` field
  - Added delivery view test coverage for phase-3 contact rendering (location/phone/url)
  - Updated sample import file `import/menu/pizza-pronto.json` with `url`
  - Validation passed: `./validate.ps1` (`462` tests across `32` files)
  - **Discovery**: local migration drift required a one-time `prisma migrate reset` before creating the new migration; after reset, migration generation and full validation were stable

---

## Priority 19 — Optional Menu Contact Metadata in Import (Mar 2026)

- [x] **19.1 Relax import metadata requirements** *(done)*
  - Updated import validation so only `menu[0].name` and `menu[0].date-created` are mandatory
  - `location`, `phone`, and `url` are now optional and stored as `null` when omitted/blank
  - Optional metadata is still validated when provided (`location <= 160`, `phone <= 40`, `url <= 255` and absolute URL)

- [x] **19.2 Tests + validation** *(done)*
  - Added service and route coverage for successful imports with minimal metadata (required fields only)
  - Validation passed (`typecheck`, `lint`, targeted server tests)

---

## Priority 20 — Phase 2/3 Price Breakdown + Total Sum (Mar 2026)

- [x] **20.1 Show line-item prices in Phase 2 active** *(done)*
  - Food selection item list now displays each menu item's price
  - Active order board now shows per-line item price and computed total sum

- [x] **20.2 Show line-item prices in Phase 2 overtime** *(done)*
  - Overtime read-only order board now shows per-line item price and computed total sum

- [x] **20.3 Show line-item prices in Phase 3 delivery** *(done)*
  - Delivery `Current orders` list now shows per-line item price and computed total sum
  - Sum is derived from current winning menu item prices by `itemId`

- [x] **20.4 Tests + full validation** *(done)*
  - Updated client tests for active/overtime/delivery views to verify price and total rendering
  - Validation passed: `./validate.ps1` (`463` tests across `32` files)

---

## Priority 21 — Code Quality Backpressure: Duplication & Complexity (Jun 2025)

- [x] **21.1 Add jscpd + eslint-plugin-sonarjs tooling** *(done)*
  - Installed `jscpd@4.0.8` and `eslint-plugin-sonarjs@4.0.0` as devDependencies
  - Added `.jscpd.json` config: 5% threshold, minTokens 50, minLines 5
  - Added `npm run duplication` script (`jscpd src/ --config .jscpd.json`)
  - Updated `validate.ps1` with duplication step and new `quality` phase
  - Added ESLint complexity rules: `complexity` (10), `max-depth` (4), `max-lines-per-function` (60), `max-params` (5), `sonarjs/cognitive-complexity` (10) — all warn-only
  - **Discovery**: jscpd config `path` field doesn't work on Windows; CLI positional arg works

- [x] **21.2 Fix route error-handling duplication** *(done)*
  - Created `src/server/routes/routeUtils.ts` with `sendServiceError` and `serviceError` helpers
  - Refactored all 33 route catch blocks across `polls.ts`, `menus.ts`, `foodSelections.ts` to use `sendServiceError`

- [x] **21.3 Fix service-layer duplication** *(done)*
  - `poll.ts`: Extracted `validateNickname`, `fetchPollOrThrow`, `requireActive`, `ensureNoPollInProgress`, `countVotesPerMenu`, `getTopMenus` helpers
  - `foodSelection.ts`: Extracted `validateNickname`, `fetchSelectionOrThrow`, `transitionToDelivery` helpers

- [x] **21.4 Fix client API duplication** *(done)*
  - `api.ts`: Extracted `wrapImportViolations` to deduplicate import/preview catch blocks

- [x] **21.5 Validation** *(done)*
  - Duplication: 70 clones (8.36%) → 25 clones (3.87%), below 5% threshold
  - Typecheck: passes, 0 errors
  - Lint: 0 errors, 78 warnings (all warnings are warn-level complexity metrics)
  - Tests: 464 tests across 32 files, all passing

---

## Priority 22 — Full Process Abort Reset from Timer Menu (Mar 2026)

- [x] **22.1 Make "Abort process" always reset the full lunch cycle** *(done)*
  - Backend `abortFoodSelection` now accepts all in-progress states (`active`, `overtime`, `delivering`, `delivery_due`)
  - Abort now deletes the active `food_selection` record (cascade-removing all `food_orders`) so aborted orders are not persisted
  - Related poll is transitioned to `status='aborted'` and winner snapshot fields are cleared to avoid resuming a stale completed poll
  - SSE now also emits `poll_ended { status: 'aborted' }` together with `food_selection_aborted` so all clients reset consistently
  - Client reducer now resets the whole lunch-process slice on `FOOD_SELECTION_ABORTED`, matching "start new Team Lunch" semantics
  - Added/updated tests:
    - service: abort from delivery phase deletes persisted selection/orders and aborts poll
    - route: abort works for active and delivering states and verifies persistence reset
    - client reducer: `FOOD_SELECTION_ABORTED` resets process state while preserving app shell context
  - Validation passed: `./validate.ps1` (`467` tests across `32` files)

---

## Priority 23 — Phase 1 No-Vote Guard + No Premature Completion (Mar 2026)

- [x] **23.1 Prevent premature manual completion of active polls** *(done)*
  - Route `POST /api/polls/:id/end` now enforces timer expiry (`allowPremature: false`), returning `400` when called before `endsAt`
  - Poll service keeps an explicit `endPoll(..., { allowPremature })` option for internal flexibility while route behavior is strict
  - Phase 1 UI (`PollActiveView`) no longer shows `Confirm completion` in the timer action menu

- [x] **23.2 Block Phase 2 start when no Phase 1 votes exist** *(done)*
  - `PollFinishedView` now derives `hasVotes` from final vote totals
  - Added explicit no-votes message when timer expires without votes
  - Hidden Phase 2 start controls (`duration + Start`) when `hasVotes === false`

- [x] **23.3 Update tests for strict end semantics + UI behavior** *(done)*
  - Updated client tests for Poll Active/Finished views (removed completion action expectation, added no-votes gating assertions)
  - Updated server service/route tests for premature-end rejection behavior
  - Updated integration suites that previously ended polls immediately to expire polls first before calling `/end`

- [x] **23.4 Validation + discovery** *(done)*
  - Validation passed: `./validate.ps1` (`468` tests across `32` files)
  - **Discovery**: integration helpers must explicitly set `poll.endsAt` to the past before invoking `/api/polls/:id/end` now that manual premature completion is forbidden

---

## Priority 24 - Phase Completion Restore + Base Path + Entra SSO (Mar 2026)

- [x] **24.1 Restore Phase 1 early completion** *(done)*
  - Reintroduced `Confirm completion` action in `PollActiveView` timer dropdown
  - Restored premature poll completion via `POST /api/polls/:id/end` (`allowPremature: true`)
  - Updated client/server tests for restored behavior

- [x] **24.2 Add custom base path support** *(done)*
  - Added client base-path helpers and switched API/SSE/health calls to base-aware URLs
  - Added `BrowserRouter` basename wiring and Vite `base`/proxy support via `VITE_BASE_PATH`
  - Added server URL rewrite support via `BASE_PATH` so API/SSE/static routes work under prefixed URLs without route duplication
  - Added server test coverage for prefixed API access (`/team-lunch/api/health`)

- [x] **24.3 Add optional MS Entra ID SSO** *(done)*
  - Integrated MSAL (`@azure/msal-browser`, `@azure/msal-react`) with env-driven setup (`VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`)
  - Added client `AuthGate` with login redirect flow when SSO is configured
  - Kept existing nickname-driven domain attribution unchanged

- [x] **24.4 Docs + validation** *(done)*
  - Updated `.env.example`, `README.md`, and `AGENTS.md` with base-path/SSO configuration notes
  - Validation: `./validate.ps1` runs; `typecheck`, `lint`, and `duplication` pass, client tests pass, full server suite is blocked locally without `DATABASE_URL`/Postgres
  - **Discovery**: `VITE_BASE_PATH` and `BASE_PATH` must match for prefixed deployments, otherwise client API/SSE requests and backend routing diverge

---

## Priority 25 - Custom Port Support (Mar 2026)

- [x] **25.1 Make app port configurable across dev + Docker** *(done)*
  - Docker app port mapping now uses env-driven `${APP_PORT}:${PORT}` (defaults remain `3000`)
  - Vite dev proxy target now follows `PORT` instead of hardcoded `3000`
  - Port blocker helper now defaults to env-driven ports (`PORT`, optional `VITE_PORT`) instead of fixed `3000/5173`

- [x] **25.2 Docs + env updates** *(done)*
  - Added `PORT` and `APP_PORT` to `.env.example`
  - Updated `README.md` and `AGENTS.md` for `PORT=3830` usage
  - **Discovery**: using separate `APP_PORT` (host) and `PORT` (container) in Docker Compose allows easy host remapping without changing in-container runtime port

---

## Priority 26 - Optional SQLite Local Testing (Mar 2026)

- [x] **26.1 Add SQLite Prisma schema and runtime client switching** *(done)*
  - Added `prisma/schema.sqlite.prisma` with SQLite-compatible model mappings
  - Updated `src/server/db.ts` to load Prisma client by `DB_PROVIDER` (`postgresql` default, `sqlite` optional)

- [x] **26.2 Add SQLite helper commands** *(done)*
  - Added scripts for SQLite local workflow:
    - `npm run dev:server:sqlite`
    - `npm run test:server:sqlite`
    - `npm run prisma:generate:sqlite`
    - `npm run prisma:push:sqlite`
  - Added cross-platform Node helper scripts under `scripts/`

- [x] **26.3 Docs + env updates** *(done)*
  - Added `DB_PROVIDER` to `.env.example`
  - Updated `README.md` and `AGENTS.md` with SQLite usage notes
  - **Discovery**: SQLite mode requires generating the dedicated client first; helper scripts now do this automatically before start/test
  - **Validation note**: `npm run typecheck` passes; SQLite runtime verification is blocked in this runner due Prisma SQLite schema-engine failure (`prisma db push` returns generic "Schema engine error")

---

## Priority 27 - Docker Migration Job Before App Start (Mar 2026)

- [x] **27.1 Add dedicated migration service in Docker Compose** *(done)*
  - Added `migrate` service running `npx prisma migrate deploy`
  - Wired `app` to depend on successful migration completion (`service_completed_successfully`)

- [x] **27.2 Simplify app container startup command** *(done)*
  - Removed migration execution from app container `CMD`
  - App container now starts server process only (`node dist/server/index.js`)

- [x] **27.3 Docs update** *(done)*
  - Updated `README.md` and `AGENTS.md` to describe migration-job startup order
  - **Discovery**: separating migration from app startup improves restart behavior (`app` restarts no longer rerun schema deployment)

---

## Priority 28 - Entra Username + Tenant Restriction (Mar 2026)

- [x] **28.1 Enforce tenant-only login in AuthGate** *(done)*
  - Added tenant verification against `idTokenClaims.tid` and configured `VITE_ENTRA_TENANT_ID`
  - Non-matching tenant accounts are logged out and shown access-denied state

- [x] **28.2 Use Entra username as app identity** *(done)*
  - Syncs Entra account username into `team_lunch_nickname` localStorage when SSO is enabled
  - Disabled manual nickname rename while SSO is enabled so action attribution stays tied to Entra user identity

- [x] **28.3 Validation + docs** *(done)*
  - Validation passed: `npm run typecheck`, `npm run test:client`
  - Updated `README.md` and `AGENTS.md`

---

## Priority 29 - Dual Login Methods (Entra + Local Username/Password) (Mar 2026)

- [x] **29.1 Add backend local login endpoint** *(done)*
  - Added `POST /api/auth/local/login` route (`src/server/routes/auth.ts`)
  - Supports single-user env config (`LOCAL_AUTH_USERNAME`/`LOCAL_AUTH_PASSWORD`) and optional multi-user JSON (`LOCAL_AUTH_USERS_JSON`)

- [x] **29.2 Add dual-method auth gates on client** *(done)*
  - Extended Entra `AuthGate` to present method selection when local auth is enabled
  - Added `LocalAuthGate` for local-only deployments (no Entra config)
  - Authenticated identity is synced into `team_lunch_nickname`; rename remains disabled under external auth

- [x] **29.3 App wiring + docs** *(done)*
  - Registered auth routes in server bootstrap
  - Updated auth config helpers (`isLocalAuthEnabled`, `isExternalAuthEnabled`)
  - Updated `.env.example`, `README.md`, and `AGENTS.md`
  - Validation passed: `npm run typecheck`, `npm run test:client`

---

## Priority 30 - Entra Redirect URI via Environment Variables (Mar 2026)

- [x] **30.1 Replace runtime-origin redirect construction** *(done)*
  - Updated MSAL config to require env-driven `VITE_ENTRA_REDIRECT_URI`
  - Added optional `VITE_ENTRA_POST_LOGOUT_REDIRECT_URI` (falls back to redirect URI)
  - Removed `window.location.origin` dependency for Entra redirect config

- [x] **30.2 Align logout flow with configured redirect URI** *(done)*
  - Tenant-mismatch logout now uses configured post-logout redirect URI helper

- [x] **30.3 Docs + env updates** *(done)*
  - Updated `.env.example`, `README.md`, and `AGENTS.md`
  - Validation passed: `npm run typecheck`, `npm run test:client`

---

## Priority 31 - Backend Confidential Entra Auth + Dual Flow Selector (Mar 2026)

- [x] **31.1 Move Entra login to backend confidential flow** *(done)*
  - Added backend auth routes for config/login/callback/logout under `/api/auth/*`
  - Added secure signed session-cookie utilities (`AUTH_SESSION_SECRET`) and Entra state cookie handling
  - Entra token exchange now occurs on backend using `ENTRA_CLIENT_SECRET`

- [x] **31.2 Keep dual login methods (Entra + local) via backend gate** *(done)*
  - Replaced client-side MSAL gate with backend-driven `AuthGate`
  - Gate supports method selection based on `/api/auth/config` (`entraEnabled` + `localEnabled`)
  - Local username/password login posts to backend and sets signed session cookie

- [x] **31.3 Base path compatibility and docs** *(done)*
  - Entra callback/login endpoints are served under API routes and work with existing `BASE_PATH` rewrite
  - Updated `.env.example`, `README.md`, and `AGENTS.md` to backend Entra env vars
  - Removed unused MSAL dependencies from `package.json`
  - Validation passed: `npm run typecheck`, `npm run test:client`
  - **Discovery**: for Docker prefixed deployments, `VITE_BASE_PATH` must be supplied at image build-time (build arg) and `BASE_PATH` at runtime, both with the same value.
  - Added `tests/server/auth-session.test.ts` for signed-session parsing and BASE_PATH cookie scoping regression coverage
  - **Discovery**: Entra callback can now be derived from `APP_PUBLIC_URL + BASE_PATH`; `ENTRA_REDIRECT_URI` remains as an explicit override for reverse-proxy edge cases.
  - Added `tests/server/auth-routes-config.test.ts` to cover derived callback URI and override behavior

---

## Priority 32 - Nginx Reverse Proxy Deployment Guide (Mar 2026)

- [x] **32.1 Add Nginx base-path + SSE proxy example** *(done)*
  - Added `deploy/nginx/team-lunch.conf` with prefixed routing (`/team-lunch/`) and SSE-safe settings (`proxy_buffering off`, `X-Accel-Buffering no`, long `proxy_read_timeout`)

- [x] **32.2 Document reverse-proxy env alignment** *(done)*
  - Updated `README.md` with dedicated reverse-proxy section covering required env alignment: `BASE_PATH`, `VITE_BASE_PATH`, `APP_PUBLIC_URL`
  - Updated `AGENTS.md` discovery notes for no-prefix-stripping and SSE buffering requirements

---

## Priority 33 - Admin-Generated Local Auth Users (Mar 2026)

- [x] **33.1 Add DB-backed local auth users** *(done)*
  - Added `LocalAuthUser` Prisma model and migration (`local_auth_users`)
  - Added secure password hashing/verification utilities (scrypt) in `src/server/services/localAuth.ts`

- [x] **33.2 Add admin credential generation endpoint** *(done)*
  - Added `POST /api/auth/local/users/generate` guarded by authenticated admin session role
  - Endpoint upserts by email and returns plaintext password once (generated unless explicitly provided)

- [x] **33.3 Keep dual-auth identity mapping by email** *(done)*
  - Local login now authenticates against DB-managed local users
  - Local usernames are normalized as emails; using the same email as Entra maps both flows to the same app identity

- [x] **33.4 Tests + docs** *(done)*
  - Added `tests/server/local-auth.test.ts` for hash/verify/password-generation helper coverage
  - Updated `.env.example`, `docker-compose.yml`, `README.md`, and `AGENTS.md`

---

## Priority 34 - Admin Approval Gate for Authenticated Users (Mar 2026)

- [x] **34.1 Add approval registry model** *(done)*
  - Added `AuthAccessUser` Prisma model and migration (`auth_access_users`) to persist pending/approved access state

- [x] **34.2 Add backend approval resolution and admin approval route** *(done)*
  - Added `src/server/services/authAccess.ts` with admin detection (`AUTH_ADMIN_EMAIL`), pending request creation, approval checks, and pending list queries
  - Extended auth config/login flows to resolve approval state per authenticated user
  - Added `POST /api/auth/users/approve` route (session-admin guarded) for user approvals
  - Added explicit auth role output (`admin`/`user`) in auth config payload for frontend role-aware behavior

- [x] **34.3 Block unapproved users in auth gate and expose admin approvals UI** *(done)*
  - `AuthGate` now blocks non-approved users in a waiting screen
  - Admin users get a pending-approvals panel to approve queued users directly

- [x] **34.4 Tests + docs** *(done)*
  - Added `tests/server/auth-approval-gate.test.ts`
  - Updated `.env.example`, `docker-compose.yml`, `README.md`, and `AGENTS.md` with `AUTH_ADMIN_EMAIL` behavior

---

## Priority 35 - Env Surface Simplification (Mar 2026)

- [x] **35.1 Remove unused/legacy local-auth env bootstrap variables** *(done)*
  - Removed `LOCAL_AUTH_USERNAME`, `LOCAL_AUTH_PASSWORD`, and `LOCAL_AUTH_USERS_JSON` support from backend auth
  - Local users are now exclusively admin-managed in DB via `/api/auth/local/users/generate`

- [x] **35.2 Remove optional post-login redirect env** *(done)*
  - Removed `ENTRA_POST_LOGIN_REDIRECT_URI`; post-login redirect now consistently uses `BASE_PATH` (or `/`)

- [x] **35.3 Collapse docker port env to one variable** *(done)*
  - Removed `APP_PORT`; Docker now maps `${PORT}:${PORT}`
  - Updated `.env.example`, `docker-compose.yml`, and `README.md` accordingly

---

## Priority 36 - Base Path Mismatch Guard (Mar 2026)

- [x] **36.1 Add fail-fast startup guard for base-path mismatch** *(done)*
  - Server startup now throws when both `BASE_PATH` and `VITE_BASE_PATH` are set and normalized values differ
  - Added regression test in `tests/server/base-path.test.ts`

- [x] **36.2 Ensure Docker runtime exposes comparison input** *(done)*
  - Added `VITE_BASE_PATH` to app runtime env in `docker-compose.yml` so mismatch checks work in container startup too

---

## Priority 37 - Admin Panel for User Approval + Local User Creation (Mar 2026)

- [x] **37.1 Add client admin panel entrypoint and local-user creation flow** *(done)*
  - Extended `AuthGate` with an explicit admin panel that can be opened at any time by authenticated admins
  - Added local-user creation form (`email` + optional password) wired to `POST /api/auth/local/users/generate`
  - Displays generated credentials once after creation for secure handoff
  - Keeps pending approvals list/action in the same panel (`POST /api/auth/users/approve`)
  - Pending approvals auto-open the admin panel on login for faster triage

- [x] **37.2 Add client tests for admin panel behavior** *(done)*
  - Added `tests/client/AuthGate.test.tsx` coverage for:
    - opening admin panel from authenticated app state
    - auto-opening when pending approvals exist
    - creating a local user and displaying generated password

- [x] **37.3 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 38 - Admin-only Food Selection Controls (Mar 2026)

- [x] **38.1 Enforce admin authorization on food-selection lifecycle entry/reset routes** *(done)*
  - Added backend authorization gate for:
    - `POST /api/food-selections` (start)
    - `POST /api/food-selections/quick-start` (start)
    - `POST /api/food-selections/:id/abort` (abort)
  - Behavior when approval workflow is enabled (`AUTH_ADMIN_EMAIL` configured):
    - unauthenticated requests -> `401 Authentication required`
    - non-admin authenticated requests -> `403 Admin role required`
  - Added dedicated server authz coverage in `tests/server/food-selection-authz.test.ts`

- [x] **38.2 Align UI controls with admin role** *(done)*
  - Persisted auth role in client storage during auth bootstrap (`team_lunch_auth_role`)
  - Added role helper (`isAdminAuthenticatedUser`) and applied it to:
    - Phase 1 finished view start action (non-admin sees info text, no start button)
    - Phase 2/3 abort actions (abort control hidden for non-admin users)
  - Added client coverage in `tests/client/PollFinishedView.test.tsx`

- [x] **38.3 Test-runtime stability** *(done)*
  - Added test-only bypass switch for admin-enforcement (`AUTHZ_ENFORCE_ADMIN`) so existing route integration suites remain deterministic when local `.env` includes auth settings
  - Server test setup keeps approval workflow disabled by default; authz tests enable it explicitly

- [x] **38.4 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 39 - Admin Decline Action for Pending Users (Mar 2026)

- [x] **39.1 Add backend decline endpoint for pending access requests** *(done)*
  - Added `declineUserByAdmin(email)` service in `src/server/services/authAccess.ts`
  - Added admin-only route `POST /api/auth/users/decline` in `src/server/routes/auth.ts`
  - Route behavior mirrors approval endpoint authz (`401` unauthenticated, `403` non-admin, `400` missing/invalid email)

- [x] **39.2 Add admin UI decline control** *(done)*
  - Extended `AuthGate` pending approvals list with `Decline` button next to `Approve`
  - Added decline request flow with config refresh so declined users disappear from pending list immediately

- [x] **39.3 Tests + validation** *(done)*
  - Extended server authz coverage in `tests/server/local-user-management-authz.test.ts`
  - Extended client coverage in `tests/client/AuthGate.test.tsx` for decline action and refreshed panel state
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 40 - Admin-Facing Menu Import Schema + LLM Prompt Helper (Mar 2026)

- [x] **40.1 Add import helper panel in Manage Menus** *(done)*
  - Added a built-in "Import helper (schema + LLM prompt)" section on the menu management page
  - Exposes the required JSON schema and a reusable prompt template for admins extracting menu JSON from copied text
  - Added copy-to-clipboard actions for both schema and prompt (with fallback messaging when clipboard APIs are unavailable)

- [x] **40.2 Add client coverage for helper UI and copy actions** *(done)*
  - Extended `tests/client/ManageMenus.test.tsx` to verify:
    - helper visibility and content
    - copy-schema and copy-prompt actions

- [x] **40.3 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 41 - Order Comment Field for Extras/Spiciness (Mar 2026)

- [x] **41.1 Add explicit free-text comment input to food order form** *(done)*
  - Updated the Phase 2 active order form to provide a single order-level text area:
    - label: `Comment / extras / spiciness`
    - max length: 200 chars
  - The comment is sent with every `Add` action and remains editable across item selections
  - Withdraw clears the local comment draft in the UI

- [x] **41.2 Update client tests** *(done)*
  - Updated `tests/client/FoodSelectionActiveView.test.tsx` to verify:
    - order-level comment field rendering
    - comment value is submitted with `placeOrder`

- [x] **41.3 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 42 - Menu Import via Pasted JSON Text (Mar 2026)

- [x] **42.1 Add pasted-JSON import entry path in Manage Menus** *(done)*
  - Extended `ImportMenuForm` with a `Paste JSON` textarea in addition to file upload
  - Added `Preview pasted JSON` action that runs the same preview validation flow used by file import
  - Kept confirm/cancel import semantics unchanged (single preview/import pipeline)
  - Added explicit validation message for invalid pasted JSON

- [x] **42.2 Add client tests for pasted JSON flow** *(done)*
  - Extended `tests/client/ManageMenus.test.tsx` to verify:
    - preview + confirm import from pasted JSON
    - invalid pasted JSON error handling

- [x] **42.3 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 44 - Food Selection Notes UX + Item Number Visibility (Mar 2026)

- [x] **44.1 Clear comment input after adding a meal line** *(done)*
  - Phase 2 `OrderForm` now resets `Comment / extras / spiciness` after successful `Add`

- [x] **44.2 Show persisted note in personal order overview** *(done)*
  - Added `Your added meals` summary in active food selection view
  - Summary lists each own line item with stored notes so users can verify comment was applied

- [x] **44.3 Show optional item number before meal names** *(done)*
  - Active item list now renders item number prefix when available
  - Public order board now also prefixes meal names with item numbers when available

- [x] **44.4 Tests + validation** *(done)*
  - Extended `tests/client/FoodSelectionActiveView.test.tsx` for:
    - comment reset after add
    - own-order summary note visibility
    - item-number rendering
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 43 - Optional Menu Item Number in Import + Schema + Prompt (Mar 2026)

- [x] **43.1 Add optional item-number to DB + shared domain model** *(done)*
  - Added nullable `item_number` to `MenuItem` in PostgreSQL and SQLite Prisma schemas
  - Added migration `20260303150000_add_menu_item_number`
  - Extended shared `MenuItem` contract with optional `itemNumber`

- [x] **43.2 Extend JSON import validation/persistence and admin helper docs** *(done)*
  - Import parser now accepts optional per-item `item-number` and persists it
  - Validation enforces string max length 40 for `item-number` when provided
  - Import helper JSON schema and LLM prompt in Manage Menus now include optional `item-number`
  - Updated `specs/menu-management.md` import contract and validation rules

- [x] **43.3 Tests + validation** *(done)*
  - Updated server import service/route tests and client Manage Menus helper tests for `item-number`
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)
  - **Discovery**: `npm run prisma:generate:sqlite` emits a generated client under `src/server/generated/sqlite-client`; if left in-tree, lint checks may include it and fail on generated code.

---

## Priority 45 - Explicit Ordering Step + ETA/Arrival Tracking (Mar 2026)

- [x] **45.1 Add explicit ordering phase between selection and delivery** *(done)*
  - Food selection completion now transitions to `ordering` (instead of immediately starting delivery timer)
  - Added `POST /api/food-selections/:id/place-order` to explicitly place the real order
  - Added new app phase `FOOD_ORDERING` and SSE event `food_selection_ordering_started`

- [x] **45.2 Persist order placement timestamp and announced ETA source** *(done)*
  - Added `order_placed_at` to food selections (PostgreSQL + SQLite schema) and migration `20260303173000_add_food_selection_order_placed_at`
  - `place-order` now records `orderPlacedAt`, `deliveryEtaMinutes`, `deliveryEtaAt`, and starts delivery countdown

- [x] **45.3 Show announced-vs-actual delivery delta** *(done)*
  - Completed view now displays whether delivery was earlier/later/on-time based on announced ETA vs actual arrival
  - Delivery/completed views now show order placed and announced arrival timestamps for auditability

- [x] **45.4 Tests + validation** *(done)*
  - Added/updated server and client tests for ordering transition, place-order route/service, SSE flow, and arrival delta messaging
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)
  - **Discovery**: introducing a new phase view with similar markup can push jscpd over the 5% limit; extract shared phase UI components (for example order board/abort controls) early to keep duplication under threshold.

---

## Priority 46 - Poll Exclusion Justifications (Mar 2026)

- [x] **46.1 Add excluded-menu justification payload to poll creation** *(done)*
  - Extended poll start request to accept optional `excludedMenuJustifications[]` (`menuId`, `reason`)
  - Added backend validation: valid menu IDs only, no duplicates, required 1–240 char reason for each excluded menu, and at least one menu must remain selectable when menus exist

- [x] **46.2 Persist and expose poll exclusion reasons** *(done)*
  - Added `poll_excluded_menus` table + Prisma model relation to `Poll`
  - `Poll` API shape now includes `excludedMenuJustifications`
  - SSE initial-state and poll formatting include the exclusion list

- [x] **46.3 Enforce exclusions during voting and UI rendering** *(done)*
  - Backend vote casting now rejects votes for excluded menus with the stored reason in the error message
  - Poll active UI filters excluded options out of votable menu list
  - Poll start UI now lets users exclude menus and requires a per-menu reason before submit

- [x] **46.4 Tests + validation** *(done)*
  - Updated server route/service tests and client poll-start tests for exclusion justification behavior
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 47 - Isolate Server Tests to Dedicated DB Schema (Mar 2026)

- [x] **47.1 Use dedicated Postgres test schema in server test setup** *(done)*
  - `tests/server/setup.ts` now rewrites `DATABASE_URL` to `TEST_DATABASE_SCHEMA` (default `team_lunch_test`) for PostgreSQL test runs
  - Server test bootstrap now runs `prisma migrate deploy` against that schema before suites execute

- [x] **47.2 Expand test DB cleanup coverage** *(done)*
  - `tests/server/helpers/db.ts` cleanup now also clears `pollExcludedMenu`, `authAccessUser`, and `localAuthUser`

- [x] **47.3 Env/docs updates + validation** *(done)*
  - Added `TEST_DATABASE_SCHEMA` to `.env.example`
  - Updated `AGENTS.md` discovery notes
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 48 - Admin-Only Food-Selection Close + Premature Poll Close Audit (Mar 2026)

- [x] **48.1 Enforce admin role for food-selection close actions** *(done)*
  - Added admin authorization guard to:
    - `POST /api/food-selections/:id/complete`
    - `POST /api/food-selections/:id/complete-now`
  - Added server authz tests ensuring non-admin users receive `403 Admin role required`

- [x] **48.2 Persist audit log when a poll is closed early** *(done)*
  - Added `audit_logs` table via Prisma model + migration (`20260303223000_add_poll_premature_close_audit_log`)
  - `pollService.endPoll()` now accepts optional `actorEmail` and writes audit entry (`event = poll_closed_early`) when `endedPrematurely=true`
  - Poll end route passes session username to service when available
  - Added service tests for:
    - audit row written on premature close
    - no audit row on natural (non-premature) close

- [x] **48.3 UI alignment + cleanup + validation** *(done)*
  - Hid non-admin "Confirm completion" actions in active/overtime food selection views to avoid user-facing 403s
  - Extended test DB cleanup to include `auditLog`
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 49 - Poll No-Vote Recovery Guard (Mar 2026)

- [x] **49.1 Prevent unusable UI after finished poll with zero votes** *(done)*
  - Updated `deriveAppPhase()` to return `POLL_IDLE` when the latest completed poll has no winner and zero votes (covers both timeout and early-close outcomes)
  - Preserved normal completed-flow behavior: if a matching completed food selection exists, phase remains `FOOD_SELECTION_COMPLETED`

- [x] **49.2 Tests + validation** *(done)*
  - Extended `tests/client/useAppPhase.test.ts` with explicit timeout/no-votes coverage and adjusted finished-poll fixtures to include realistic winner/vote data
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 50 - Admin Poll Kill Switch + Audit Trail (Mar 2026)

- [x] **50.1 Enforce admin-only poll kill endpoint** *(done)*
  - `POST /api/polls/:id/abort` now requires admin authorization when approval workflow is enabled (`AUTH_ADMIN_EMAIL` configured), matching existing food-selection authz behavior
  - Added dedicated poll authz integration tests in `tests/server/poll-authz.test.ts`

- [x] **50.2 Record audit event on admin kill action** *(done)*
  - Poll abort now attempts to write audit event `poll_killed_by_admin` with `actorEmail`, `targetType='poll'`, and `targetId`
  - Added poll service coverage for audit-write path and audit-write-failure fallback behavior

- [x] **50.3 UI kill switch visibility for admins only** *(done)*
  - Poll active timer menu now shows `Kill poll (admin)` only for admin users
  - Poll tied view now shows admin-only kill confirmation controls
  - Updated client tests (`PollActiveView`, `PollTiedView`) for both admin-visible and non-admin-hidden behavior

- [x] **50.4 Validation** *(done)*
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 51 - Custom ETA Entry in Ordering Phase (Mar 2026)

- [x] **51.1 Add separate custom ETA input in ordering UI** *(done)*
  - Extended `FoodSelectionOrderingView` with a dedicated `Manual ETA in minutes` input row and `Place custom ETA` action
  - Custom entry supports Enter-to-submit and validates integer range `1..240` before calling API
  - Existing preset ETA dropdown + `Place order` flow remains unchanged

- [x] **51.2 Client tests + validation** *(done)*
  - Extended `tests/client/FoodSelectionOrderingView.test.tsx` to cover:
    - successful custom ETA submission
    - invalid custom ETA validation error without API call
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 52 - Unify Minutes Dropdown for Start/ETA Actions (Mar 2026)

- [x] **52.1 Add shared preset+custom minutes dropdown component** *(done)*
  - Added `src/client/components/MinutesActionDropdown.tsx`
  - Matches timer-action behavior: presets in dropdown + custom minutes input + apply action

- [x] **52.2 Reuse unified dropdown for poll-finished start and ordering ETA** *(done)*
  - `PollFinishedView`: replaced separate duration select/start button with shared dropdown flow (includes custom duration validation: `1` or `5..30` step `5`)
  - `FoodSelectionOrderingView`: replaced separate preset/custom ETA controls with shared dropdown flow (custom ETA validation: `1..240`)

- [x] **52.3 Tests + validation** *(done)*
  - Updated `tests/client/PollFinishedView.test.tsx`
  - Updated `tests/client/FoodSelectionOrderingView.test.tsx`
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 53 - Admin Role Promotion/Demotion Management (Mar 2026)

- [x] **53.1 Add persisted admin role flag for approved users** *(done)*
  - Added `is_admin` column to `auth_access_users` (PostgreSQL + SQLite Prisma schemas)
  - Added migration `20260304082000_add_auth_access_user_admin_role`

- [x] **53.2 Add backend admin role management endpoints** *(done)*
  - Added `promoteUserByAdmin(email)` and `demoteUserByAdmin(email)` in `src/server/services/authAccess.ts`
  - Added admin-only routes:
    - `POST /api/auth/users/promote`
    - `POST /api/auth/users/demote`
  - Extended `GET /api/auth/config` to include admin-visible `users[]` with role/approval metadata
  - Guarded configured bootstrap admin (`AUTH_ADMIN_EMAIL`) from demotion

- [x] **53.3 Add admin users section in AuthGate** *(done)*
  - Added "Users" list in admin panel with role/status badges
  - Added promote/demote actions per user with config refresh after changes
  - Kept pending approvals + local user generation flows intact

- [x] **53.4 Tests + validation** *(done)*
  - Updated `tests/client/AuthGate.test.tsx` for promote/demote UI behavior
  - Updated `tests/server/local-user-management-authz.test.ts` and `tests/server/auth-approval-gate.test.ts`
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 54 - Guard Test DB Cleanup Against Non-Test Runtime (Mar 2026)

- [x] **54.1 Restrict server test cleanup helper to server-test runtime only** *(done)*
  - `tests/server/setup.ts` now sets `SERVER_TEST_RUNTIME=true`
  - `tests/server/helpers/db.ts` now aborts `cleanDatabase()` unless that runtime flag is present
  - Keeps existing dedicated test-schema safety check in setup as the authoritative DB target guard

- [x] **54.2 Validation** *(done)*
  - Ran `npm run test:server` successfully (all server suites passing)

---

## Priority 55 - Inline Password Validation in Admin Local-User Form (Mar 2026)

- [x] **55.1 Validate local-user password on entry in admin panel** *(done)*
  - Added live password validation in `AuthGate` local-user creation form:
    - empty password allowed (auto-generate)
    - provided password must be `8..200` chars (matches backend rule)
  - Added inline error message and submit-button disable while invalid
  - Kept backend validation as final enforcement

- [x] **55.2 Tests + validation** *(done)*
  - Extended `tests/client/AuthGate.test.tsx` with short-password inline validation coverage
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 56 - Show Admin-Created Local Users in Admin Users List (Mar 2026)

- [x] **56.1 Sync access registry on local-user generation** *(done)*
  - Updated `POST /api/auth/local/users/generate` to also call `approveUserByAdmin(email)` so the generated account is immediately present in admin `users` list and can sign in without first triggering pending approval

- [x] **56.2 Validation** *(done)*
  - Verified with `npm run test:server` and `npm test` in local environment

---

## Priority 57 - Reminder Emails for Approval + Missing Meal Selection (Mar 2026)

- [x] **57.1 Add SMTP-backed reminder email service (best-effort)** *(done)*
  - Added `src/server/services/notificationEmail.ts` with optional SMTP transport and safe no-op behavior when SMTP env is not configured
  - Added `.env.example` and README variables for SMTP + reminder configuration

- [x] **57.2 Approval reminder on first pending SSO/local access request** *(done)*
  - Extended `resolveUserApproval()` to surface `pendingRequestCreated` and trigger reminder emails only when pending access entry is first created
  - Sends a pending-approval notification to admin recipients (`AUTH_ADMIN_EMAIL` + optional `AUTH_ADMIN_REMINDER_EMAILS`) and to the requesting user email when valid

- [x] **57.3 Meal-selection reminder for voters without orders** *(done)*
  - Added reminder timer scheduling in `foodSelection` service that triggers before selection end
  - Reminder targets poll voters who have not placed any order yet and whose vote nickname is a valid email address
  - Reminder scheduling is automatically resynced on timer updates/extensions and cleared on phase transitions/abort

- [x] **57.4 Tests + validation** *(done)*
  - Added `tests/server/auth-approval-reminder.test.ts` (one-time reminder behavior)
  - Added `tests/server/food-selection-reminder.test.ts` (voted-but-no-order reminder targeting)

---

## Priority 58 - Meal Rating + User Excel Export (Mar 2026)

- [x] **58.1 Persist meal ratings on orders** *(done)*
  - Added nullable `rating` and `rated_at` to `FoodOrder` (PostgreSQL + SQLite Prisma schemas)
  - Added migration `20260304113000_add_food_order_rating`
  - Extended shared `FoodOrder` type with rating fields

- [x] **58.2 Add backend rating + export APIs** *(done)*
  - Added `POST /api/food-selections/:id/orders/:orderId/rating` for self-rating completed meals (`1..5`)
  - Added `GET /api/food-selections/export/mine` returning `.xlsx` with date/menu/item/comment/rating columns
  - Added SSE `order_updated` payload mapping for rating updates

- [x] **58.3 Add completed-view UI actions** *(done)*
  - Added per-own-order rating controls in completed view
  - Added "Export my orders & ratings (Excel)" action for user-level export
  - Updated client state reducer so `order_updated` propagates into active/latest/history food-selection snapshots

- [x] **58.4 Tests + validation** *(done)*
  - Added server integration tests in `tests/server/food-order-rating-export.test.ts`
  - Updated client tests and shared test helpers for new `FoodOrder` fields
  - Fixed server test setup to load `.env` before test-schema rewrite (`tests/server/setup.ts`)
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

- [x] **58.5 Add optional free-text feedback on completed meals** *(done)*
  - Extended completed-meal feedback beyond numeric ratings with an optional short remark about the food, delivery, or overall experience
  - Added nullable `food_orders.feedback_comment` (`VARCHAR(300)`) in PostgreSQL + SQLite Prisma schemas plus migration `20260313121000_add_food_order_feedback_comment`
  - Extended shared types, SSE order mapping, and `POST /api/food-selections/:id/orders/:orderId/rating` so rating saves can persist an optional feedback remark too
  - Updated the completed-order UI so users can save rating + optional feedback together, and surfaced the saved remark in completed history
  - Extended the Excel export with a dedicated `Feedback` column
  - Added focused route/export and completed-view coverage, plus hardened the long-running completed-selection persistence service test with an explicit timeout so full validation stays stable on slower runs
  - Validation:
    - `./validate.ps1`

---

## Priority 59 - User Allergies/Dislikes Alerts on Meal Selection (Mar 2026)

- [x] **59.1 Persist user food preferences (allergies/dislikes)** *(done)*
  - Added `UserPreference` model in PostgreSQL + SQLite Prisma schemas
  - Added migration `20260304130000_add_user_preferences`
  - Added shared types for user preference payloads

- [x] **59.2 Add backend API for reading/updating preferences** *(done)*
  - Added `GET /api/user/preferences` and `PUT /api/user/preferences`
  - Added validation/normalization service in `src/server/services/userPreferences.ts`
  - Supports authenticated session user key and nickname fallback for local flow

- [x] **59.3 Add food-selection warnings based on preferences** *(done)*
  - Added allergies/dislikes editor panel in active food selection view
  - Added inline item warnings when dish name/description matches saved terms
  - Added add-order confirmation prompt when allergy/dislike warning is present

- [x] **59.4 Tests + validation** *(done)*
  - Added server integration tests in `tests/server/user-preferences-routes.test.ts`
  - Extended `tests/client/FoodSelectionActiveView.test.tsx` for warning rendering and confirmation behavior
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 60 - Show Voters Who Have Not Ordered Yet (Mar 2026)

- [x] **60.1 Add pending-voter visibility in active food selection UI** *(done)*
  - `FoodSelectionActiveView` now computes and shows users who voted for the selected (winning) menu but have not placed an order yet
  - Data source is existing client state (`latestCompletedPoll.votes` + `activeFoodSelection.orders`), so no new backend API is required
  - Added dedicated panel with count and fallback text when everyone has ordered

- [x] **60.2 Tests + validation** *(done)*
  - Extended `tests/client/FoodSelectionActiveView.test.tsx`:
    - lists pending voters correctly
    - excludes voters who already ordered
    - shows fallback when none are pending
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 61 - Group Orders by User and Show Order/User Totals (Mar 2026)

- [x] **61.1 Group visible order boards by user** *(done)*
  - Active food-selection order board now groups line items by user
  - Shared read-only order board (`FoodSelectionOrderBoard`) now groups by user (used in overtime + ordering views)
  - Delivery view order list now groups by user

- [x] **61.2 Show both totals in headings** *(done)*
  - Order board headings now show both counts:
    - total number of orders
    - total number of users with at least one order

- [x] **61.3 Tests + validation** *(done)*
  - Updated affected client tests:
    - `tests/client/FoodSelectionActiveView.test.tsx`
    - `tests/client/FoodSelectionOvertimeView.test.tsx`
    - `tests/client/FoodSelectionOrderingView.test.tsx`
    - `tests/client/FoodDeliveryView.test.tsx`
  - Ran `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)

---

## Priority 62 - Ordering Consolidation + Clipboard Item Numbers + Late-Delivery Overtime Visualization (Mar 2026)

- [x] **62.1 Group ordering list by same item in ordering phase** *(done)*
  - In the ordering view, add a grouped order projection to make call-in ordering easier:
    - group by same menu item name
    - optionally split by same comment or show per-comment sub-lines under each grouped item
  - Keep the current per-user grouping available where needed (do not lose traceability of who ordered what)
  - Define clear display format for quantity, item name, and comment variants

- [x] **62.2 Include item number in clipboard order copy** *(done)*
  - Ensure clipboard export for order lists includes the menu item number (when present), not only item name
  - Apply consistently in all places that offer order-list copy (ordering and delivery views)
  - Keep graceful fallback when item number is missing

- [x] **62.3 Visualize overtime when delivery is late** *(done)*
  - Improve delivery phase UI when current time is past announced ETA:
    - explicit overtime/late indicator with elapsed late time
    - clear distinction between on-time waiting vs overdue delivery state
  - Reuse existing due-state mechanics where possible and extend tests for the new visual behavior

---

## Priority 63 - Keep Full Poll History for Recommender Analytics (Mar 2026)

- [x] **63.1 Remove automatic poll retention deletion** *(done)*
  - Poll service no longer purges old polls on finish, random tie resolution, abort, or auto-finished single-menu creation
  - Finished/aborted poll history is now preserved for future preference/recommender analytics

- [x] **63.2 Update tests to assert poll persistence** *(done)*
  - Updated poll service and retention integration tests to verify that poll counts are preserved beyond 5
  - Updated cascade-retention integration scenario to assert linked food selections remain when old polls are not deleted

- [x] **63.3 Update docs/specs** *(done)*
  - Updated `specs/poll-lifecycle.md`, `specs/data-model.md`, and README retention description to reflect no automatic poll purge

---

## Priority 64 - Outstanding Discussion Backlog (Mar 2026)

- [x] **64.1 Add user blocking/suspension management (admin)** *(done)*
  - Add explicit `blocked` user state applicable to both SSO and local users
  - Enforce blocked-state denial at auth/session gate and protected APIs
  - Add admin UI actions to block/unblock users with audit-log entries

- [x] **64.2 Switch reminder delivery from SMTP to Microsoft Graph mail** *(done)*
  - Replaced the SMTP-based notification sender with Microsoft Graph `sendMail`, reusing the existing Entra app registration credentials plus a configured sender mailbox (`GRAPH_MAIL_SENDER`)
  - Existing approval-reminder and missing-order reminder call sites continue to use the shared notification abstraction, so reminder targeting semantics stay unchanged
  - Added approved-user recipient lookup so the same Graph-backed notification path can announce newly started polls to approved, unblocked registered users who are not currently signed in
  - Pending-approval admin notifications now also fan out to approved, unblocked registered admins from `auth_access_users`, while still honoring `AUTH_ADMIN_EMAIL` and optional `AUTH_ADMIN_REMINDER_EMAILS`
  - Updated config/docs to remove SMTP variables and describe Graph-mail setup instead
  - Added an opt-in real-delivery smoke test guarded by `GRAPH_MAIL_TEST_RECIPIENT` so Graph mail can be verified in CI/local runs without sending mail by default
  - Added focused server coverage for Graph token/mail requests and poll-start notification behavior, then reran server notification suites plus full validation

- [ ] **64.3 Meal recommender foundation + feedback loop**
  - Define persisted recommendation signals from historical orders/ratings/preferences
  - Add recommendation endpoint for current menu items per user
  - Add user feedback capture on recommendations (helpful / not helpful + optional reason like disliked ingredient)

---

## Priority 65 - Keep Full Food-Selection History for Recommender Analytics (Mar 2026)

- [x] **65.1 Remove automatic completed food-selection retention deletion** *(done)*
  - Food selection service no longer purges older completed selections after arrival confirmation
  - Completed food-selection history is now preserved for long-term model/recommender training

- [x] **65.2 Update tests to assert food-selection persistence** *(done)*
  - Updated food-selection service and retention integration tests to verify completed selections are preserved beyond 5

- [x] **65.3 Update docs/specs/discoveries** *(done)*
  - Updated `README.md`, `specs/data-model.md`, and `AGENTS.md` to reflect no automatic food-selection purge

---

## Priority 66 - Idle Dashboard Landing Experience (Mar 2026)

- [x] **66.1 Replace completed-order idle landing with dashboard home** *(done)*
  - When no poll/food-selection flow is active, land on a dashboard instead of defaulting to the last completed food order
  - Keep the primary poll-start / quick-start action available directly from the dashboard
  - Add quick actions for:
    - start new poll / quick-start food selection (single-menu fallback)
    - import/manage menus
  - `PollIdleView` now renders the dashboard as the default idle landing with poll start, single-menu quick start, and menu-management quick actions
  - `useAppPhase` now returns `POLL_IDLE` after completed poll + food-selection cycles so users are not dropped into the latest completed order by default

- [x] **66.2 Add dashboard insight cards from existing history** *(done)*
  - Add cards/sections for:
    - meals waiting for your rating
    - most popular menus
    - recently used menus
    - team lunch history
    - quick stats (last winner, average rating, most ordered item across menus)
  - Reuse already hydrated client history/state where possible before adding new APIs
  - Added derived dashboard helpers for pending ratings, menu popularity/recency, average rating, last winner, and most ordered item across menus
  - Expanded completed food-selection history retention in the client reducer and SSE initial state so dashboard history cards can use the full retained dataset

- [x] **66.3 Update navigation/docs/tests/validation** *(done)*
  - Update `specs/app-navigation.md` to describe the dashboard-first idle experience
  - Extend client tests for the new idle landing behavior and dashboard interactions
  - Run `./validate.ps1` successfully (`typecheck`, `lint`, `duplication`, `test`)
  - Updated `specs/app-navigation.md` to document the dashboard home and history-first completed-order navigation
  - Added/updated client tests for phase derivation, dashboard utilities, app-state history retention, and idle dashboard rendering/actions
  - `./validate.ps1` passed on March 9, 2026

---

## Priority 67 - Dashboard Popularity Follow-up (Mar 2026)

- [x] **67.1 Show both menu and meal popularity on the idle dashboard** *(done)*
  - Keep popularity by menu usage count
  - Add a separate popularity card for meals/items by order count across menus
  - Preserve the quick stat for the single most ordered item across menus
  - Added `getMostPopularMeals` so the dashboard can rank meals by cross-menu order count while retaining the existing menu-usage leaderboard
  - The idle dashboard now shows separate `Most Popular Menus` and `Most Popular Meals` cards

- [x] **67.2 Remove duplicate menu-management quick action wording** *(done)*
  - Replace the duplicate `Import a menu` / `Manage menus` actions with a clearer single navigation path to `/menus`
  - Make it explicit that import happens from the manage-menus screen
  - Replaced the duplicated actions with a single `Manage menus` entry that explains import lives in the same screen

- [x] **67.3 Update docs/tests/validation** *(done)*
  - Update `specs/app-navigation.md` for the refined dashboard cards/actions
  - Extend dashboard tests for meal popularity and quick action wording
  - Run focused validation and full `./validate.ps1`
  - Updated `specs/app-navigation.md` to describe separate menu and meal popularity plus the consolidated menu-management action
  - Extended dashboard utility/component tests for meal popularity output and quick-action wording
  - Focused `npm run typecheck` and `npm run test:client -- PollIdleView dashboard-utils` passed on March 9, 2026

---

## Priority 68 - Menu Item Number + Price Editing Polish (Mar 2026)

- [x] **68.1 Allow manual editing of menu item number and price** *(done)*
  - Extend menu-item create/update requests so `/menus` can set and correct `itemNumber` and `price`, not only `name` and `description`
  - Reuse the existing import validation constraints for `item-number` and `price` in manual CRUD paths
  - Extended shared menu-item create/update request payloads and backend CRUD routes/services to accept manual `itemNumber` and `price` updates
  - Manual create/edit now reuses the same number/price constraints already enforced for imported items

- [x] **68.2 Show meal/item numbers in remaining menu item views** *(done)*
  - Ensure menu item numbers are visible anywhere individual meals/items are shown to users, not just in copy/export helpers
  - Focus on Manage Menus plus completed/delivery order summaries that still render plain item names
  - Manage Menus item rows now show meal number and price, and manual item forms expose editable meal-number and price fields
  - Completed and delivery order summaries now prefix item names with resolved meal numbers when available

- [x] **68.3 Update docs/tests/validation** *(done)*
  - Document manual menu-item number/price editing in specs and plan notes
  - Extend client/server tests for the new request payloads and rendering
  - Run `./validate.ps1`
  - Updated `specs/menu-management.md` to document manual item-number/price editing and listing expectations
  - Extended client/server tests for manual item-number/price CRUD and order-summary rendering
  - `./validate.ps1` passed on March 9, 2026

---

## Priority 69 - Missing-Order Fallbacks + Pings (Mar 2026)

- [x] **69.1 Add manual ping/reminder action for voted users who still have no order** *(done)*
  - Allow organizers to trigger a reminder notification for voters in the winning poll who still have not placed an order
  - Reuse existing email reminder infrastructure where possible and keep the flow best-effort / non-blocking
  - Surface the action in the active food-selection UI near the "still missing orders" panel
  - Added `POST /api/food-selections/:id/remind-missing` guarded by the existing admin-only approval-workflow check
  - Reused the existing reminder sender in `foodSelection` service and now return `remindedCount` so the UI can report a real result
  - `FoodSelectionActiveView` now exposes a `Ping missing users` action with success/error feedback next to the pending-voters card
  - Extended server route/authz tests and client view tests for the manual reminder flow

- [x] **69.2 Add per-menu default meal preferences with fallback-order opt-in** *(done)*
  - Persist per-user default meal selection per menu plus an explicit "allow organizer to order this default when I am late" flag
  - Expose preference editing in the user preferences flow / relevant ordering UI
  - Implementation scope for this slice: store dedicated per-menu default-meal records and expose editing on `Manage Menus` so users can configure defaults across all menus
  - Added `user_menu_default_preferences` to PostgreSQL + SQLite Prisma schemas with one record per `user_key + menu_id`
  - Added user endpoints to list and upsert menu-default preferences, with validation that the selected item belongs to the target menu
  - `Manage Menus` now loads the current user's default-meal settings, lets the user choose a default dish per menu, and supports organizer-fallback opt-in
  - Added focused server route/service tests and client page tests for the new default-meal flow

- [x] **69.3 Allow organizer fallback ordering from configured defaults** *(done)*
  - During food-selection ordering, organizers now see winning-poll voters who still have no order but opted into default-meal fallback
  - Added `GET /api/food-selections/:id/fallback-candidates` to list eligible users and their saved default items for the winning menu
  - Added `POST /api/food-selections/:id/fallback-orders` so an organizer can explicitly place the saved default meal for that user
  - Fallback orders are limited to `ORDERING`, require that the target user voted for the winning menu, and refuse users who already ordered or did not opt in
  - Saved fallback orders are clearly labeled in the order notes as organizer-placed default meals for auditability
  - Extended server service/route/authz tests and ordering-view client tests for listing and placing fallback orders

- [x] **69.4 Update docs/tests/validation** *(done)*
  - Document notification and fallback-order semantics
  - Extend server/client tests for the new flows
  - Run `./validate.ps1`
  - Ordering fallback rows now explicitly show that the listed meal is the user's saved default meal
  - Organizers can now ping one fallback-eligible missing voter directly from the ordering view
  - The targeted ping sends a best-effort Graph mail when the nickname is an email address and broadcasts a targeted SSE event so the matching online user gets a browser notification
  - Extended focused client/server tests for the new reminder route, service behavior, ordering UI, and targeted browser notification handling

---

## Priority 70 - Expired Poll CTA Polish (Mar 2026)

- [x] **70.1 Replace stale "poll in progress" expired state with a completion call to action** *(done)*
  - When the poll countdown reaches `0`, the active poll view now switches from a misleading in-progress presentation to an explicit completion state
  - Admins get a prominent `Confirm completion` CTA directly in the main content, while non-admins see a waiting message instead of a dead-end timer
  - Voting controls are disabled once the countdown is exhausted so the screen matches backend voting rules
  - Extended `tests/client/PollActiveView.test.tsx` for both admin CTA and non-admin waiting behavior

---

## Priority 71 - Ordering Responsibility Confirmation (Mar 2026)

- [x] **71.1 Require explicit confirmation before claiming the order-placement role** *(done)*
  - The ordering-phase `Place order` action now asks for confirmation before it transitions the flow into delivery tracking
  - This prevents accidental clicks from falsely marking a user as the person responsible for calling in the restaurant order
  - Extended `tests/client/FoodSelectionOrderingView.test.tsx` to cover confirmed and canceled submission paths

---

## Priority 72 - Delivery Start Notifications (Mar 2026)

- [x] **72.1 Notify other users when someone starts placing the restaurant order** *(done)*
  - Reused the existing browser notification preference/hook instead of adding a second notification channel
  - Split ordering into two user-visible moments:
    - claiming the ordering responsibility while still in `ORDERING`
    - confirming the real order placement with ETA when entering `DELIVERING`
  - Added a dedicated `claim-ordering` flow and SSE event so everyone else is notified as soon as one person starts calling the restaurant
  - Delivery-start notifications now explicitly announce that the order was placed and include the ETA
  - The user who actually claimed / placed the order does not get redundant self-notifications
  - Added focused service/route/SSE/client coverage for claiming and for the two notification variants

---

## Priority 73 - Shared Shopping List (Mar 2026)

- [x] **73.1 Add a simple shared shopping list with bought tracking** *(done)*
  - Added persisted `shopping_list_items` records in PostgreSQL + SQLite Prisma schemas
  - Added migration `20260311163230_add_shopping_list_items`
  - Added shopping-list service and routes:
    - `GET /api/shopping-list`
    - `POST /api/shopping-list`
    - `POST /api/shopping-list/:id/bought`
  - Added SSE events so item additions and bought updates sync live across connected clients
  - Added a simple `/shopping` page with:
    - add-item form
    - pending items
    - bought items
    - `Mark bought` action
  - Added header navigation entry for the shopping list
  - Added focused client/server tests for page behavior, SSE wiring, service logic, and route integration
  - Extended `tests/server/helpers/db.ts` cleanup for `shoppingListItem` (and `userMenuDefaultPreference`) so server integration tests stay isolated
  - Hardened `food-selection-timer` test to poll for the persisted overtime transition instead of assuming the async timer write finishes within a fixed 50ms delay
  - Validation: `npm run typecheck`, `npm run duplication`, and `npm test` passed (`54` files, `622` tests); `./validate.ps1` still reports a generic test failure locally even when the direct `vitest` run is green

- [x] **73.2 Add batch bought action and date-grouped purchase history** *(done)*
  - Added a `Bought all` action for pending shopping items so one shopper can clear the list quickly
  - Grouped the bought list by purchase date to keep larger shopping runs readable
  - Covered the new UI behavior with focused client tests
  - Validation: `npm run typecheck` and `npm run test:client -- tests/client/ShoppingList.test.tsx` passed; lint remains at repo baseline warnings only

---

## Priority 74 - Multi-Office Support (Mar 2026)

- [x] **74.1 Write multi-office product/technical spec** *(done)*
  - Added [specs/multi-office.md](specs/multi-office.md) covering:
    - office-location entity
    - one office per regular user for phase 1
    - global-admin behavior
    - office scoping for menus, shopping lists, polls, food selections, reminders, SSE, and dashboard analytics
    - migration/backfill strategy for existing single-office data
    - rollout phases and open questions
  - Key design choice: treat this as one deployment with office-scoped data, not full multi-tenant isolation
  - Key implementation recommendation: make service signatures office-aware instead of hiding office filtering only in routes

- [x] **74.2 Add office-location data model and user assignment** *(done)*
  - Added `office_locations` and `auth_access_users.office_location_id` to PostgreSQL + SQLite Prisma schemas
  - Added migration `20260311211213_add_office_locations_and_user_assignment`
  - Seeded/backfilled a legacy `default` office for existing non-admin auth-access users in the migration
  - Added office-location service helpers and exposed office data through `/api/auth/config`
  - Approval and local-user generation now require an office assignment for regular users
  - Added `POST /api/auth/users/assign-office` so admins can change a user’s office later
  - Extended the admin panel UI to:
    - choose an office during pending-user approval
    - create, rename, and deactivate office locations from the admin panel
    - keep deactivation safe by rejecting the default office and any office that still has assigned users
    - choose an office during local-user creation
    - assign/change office for listed regular users
  - Surfaced assigned office information in auth state and the data-model spec
  - Follow-up hardening: admins can now still be assigned/reassigned to an office from the admin UI, and demoting an unassigned admin can atomically apply the selected office in the same request so the UI does not dead-end on legacy data
  - Focused validation passed:
    - `npm run typecheck`
    - `npm run test:server -- tests/server/auth-approval-gate.test.ts tests/server/auth-approval-reminder.test.ts tests/server/local-user-management-authz.test.ts tests/server/poll-service.test.ts`
    - `npm run test:client -- tests/client/AuthGate.test.tsx`

- [x] **74.3 Scope menus and shopping list by office** *(done)*
  - Added `menus.office_location_id` and `shopping_list_items.office_location_id` to both Prisma schemas
  - Added migration `20260311234500_scope_menus_and_shopping_by_office`
  - Menu uniqueness is now scoped to `(office_location_id, name)` instead of one global menu name
  - Menu CRUD, import, and item CRUD now resolve office context before querying or mutating data
  - Shopping-list reads/writes are now scoped by office
  - Added `officeContext` service helper so regular users resolve office from their authenticated assignment
  - Temporary phase-1 behavior: global admins without an assigned office fall back to the legacy `default` office until the explicit office selector lands in 74.6
  - Added server service and route coverage proving different offices can reuse menu names and only see their own menu/shopping data
  - Validation:
    - `./validate.ps1`

- [x] **74.4 Scope polls, food selections, and reminders by office** *(done)*
  - Added `polls.office_location_id` and `food_selections.office_location_id` to both Prisma schemas
  - Added migration `20260312001000_scope_polls_and_food_selections_by_office`
  - Active-poll uniqueness and in-progress food-selection guards are now enforced per office instead of globally
  - Poll start, voting, tie handling, random winner, abort, and food-selection lifecycle routes now resolve office context before mutating data
  - Food selection ordering, fallback ordering, manual reminders, and delivery updates are now restricted to the caller's office context
  - Poll-start emails now target approved, unblocked users for the relevant office while still including approved global admins
  - Quick-start food selection now only inspects menus in the current office
  - Added service and route coverage for per-office poll/food-selection visibility and concurrency
  - Validation:
    - `./validate.ps1`

- [x] **74.5 Scope SSE and dashboard/history by office** *(done)*
  - SSE subscribers now register with an office context derived from the authenticated user
  - `initial_state` hydration is now office-scoped for active poll, active food selection, latest completed poll, latest completed food selection, and completed history
  - Office-scoped menu, shopping-list, poll, and food-selection broadcasts now only fan out to matching office subscribers
  - Existing dashboard/history widgets now become office-specific automatically because both SSE hydration and REST history/menu fetches are office-scoped
  - Added SSE unit and integration coverage proving cross-office initial state and realtime events no longer leak
  - Validation:
    - `./validate.ps1`

- [x] **74.6 Add global-admin office context selector** *(done)*
  - Global admins can now switch the currently managed office for office-scoped screens via a compact header selector
  - The selected office persists in local storage and is threaded through office-scoped REST calls plus the SSE subscription
  - Switching office now resets the client app state and rehydrates menus, history, shopping list, and realtime state for the selected office
  - Regular users still stay implicit and cannot override their assigned office via query parameters
  - Added focused client/server/SSE coverage for admin office switching and regular-user override protection
  - Validation:
    - `npm run typecheck`
    - `npm run test:client -- tests/client/Header.test.tsx tests/client/useSSE.test.ts`
    - `npm run test:server -- tests/server/menu-routes.test.ts tests/server/sse-integration.test.ts`

- [x] **74.7 Allow multi-office assignments for regular users** *(done)*
  - Added `auth_access_user_offices` plus migration backfill so approved regular users can belong to multiple offices while keeping one preferred/default office
  - Extended admin user management so office memberships can be assigned/removed without promoting the user to global admin
  - Regular users with more than one assigned office can now switch office context from the header, while office-scoped routes and SSE stay restricted to their assigned-office set
  - Follow-up hardening: the bootstrap admin from `AUTH_ADMIN_EMAIL` is now synthesized into `/api/auth/config` user management even before a persisted `auth_access_users` row exists, and assigning offices to that admin now creates/upgrades the backing row automatically so self-management does not dead-end
  - Validation:
    - `npm run typecheck`
    - `npm run test:client -- tests/client/Header.test.tsx tests/client/AuthGate.test.tsx`
    - `npm run test:server -- tests/server/auth-approval-gate.test.ts tests/server/local-user-management-authz.test.ts`
    - `./validate.ps1`

---

## Priority 75 - Default Meal Comment Preferences (Mar 2026)

- [x] **75.1 Allow users to save a comment with each default meal** *(done)*
  - Added `user_menu_default_preferences.default_comment` to PostgreSQL + SQLite Prisma schemas plus migration `20260312011500_add_default_comment_to_user_menu_defaults`
  - Extended the shared request/response contract and user-preference route/service validation to persist an optional default-meal comment (trimmed, max 200 chars)
  - `Manage Menus` now lets users edit a default comment alongside their saved default meal and organizer-fallback opt-in
  - Organizer fallback orders now reuse the saved default comment and still append the organizer-placement audit note
  - Extended focused client/server tests for saving, listing, validating, and applying the new default comment
  - Validation:
    - `npm run test:server -- tests/server/user-menu-defaults-service.test.ts tests/server/user-preferences-routes.test.ts tests/server/food-selection-service.test.ts tests/server/food-selection-routes.test.ts tests/server/food-selection-reminder.test.ts`
    - `npm run test:client -- tests/client/ManageMenus.test.tsx`
    - `./validate.ps1`

---

## Priority 76 - Poll/Selection Creator Permissions + Auto-Start (Mar 2026)

- [x] **76.1 Restrict poll extensions to admins or the poll creator** *(done)*
  - Polls now persist `created_by` so creator permissions survive reloads/SSE hydration
  - `POST /api/polls/:id/extend` and `POST /api/polls/:id/timer` now allow only admins or the original poll creator
  - The tied/active poll UI now reflects those creator-aware permissions instead of showing dead-end controls to everyone

- [x] **76.2 Let any approved user start food selection while keeping creator-only timer changes** *(done)*
  - In approval-workflow mode, `POST /api/food-selections` and quick-start now allow any approved user instead of admins only
  - Food selections now persist `created_by`
  - `POST /api/food-selections/:id/extend` and `POST /api/food-selections/:id/timer` now allow only admins or the food-selection creator
  - The finished-poll view now exposes `Start food selection` to all authenticated users, while active/overtime food-selection timer controls remain creator/admin only

- [x] **76.3 Auto-start food selection after a poll winner is resolved** *(done)*
  - Added `DEFAULT_FOOD_SELECTION_DURATION_MINUTES` support in poll completion with default fallback `30`
  - Automatic food-selection start now runs both for normal winner resolution and random tie resolution
  - Server tests default this env var to `0` to keep unrelated suites deterministic

- [x] **76.4 Update docs/tests/validation** *(done)*
  - Updated poll/food-selection lifecycle specs for creator permissions and automatic start semantics
  - Added focused service/route tests for creator ownership, approved-user start paths, quick-start, and random-winner auto-start
  - Validation:
    - `npm run test:server -- tests/server/poll-service.test.ts tests/server/food-selection-service.test.ts tests/server/poll-authz.test.ts tests/server/food-selection-authz.test.ts tests/server/poll-routes.test.ts tests/server/food-selection-routes.test.ts`
    - `npm run test:client -- tests/client/PollFinishedView.test.tsx tests/client/PollTiedView.test.tsx tests/client/PollActiveView.test.tsx tests/client/FoodSelectionOvertimeView.test.tsx tests/client/FoodSelectionActiveView.test.tsx`
    - `./validate.ps1`

- [x] **76.5 Let approved non-admin users advance food selection into ordering** *(done)*
  - `POST /api/food-selections/:id/complete` and `POST /api/food-selections/:id/complete-now` now require an approved user instead of an admin when approval workflow is enabled
  - This removes the last remaining admin-only blocker in the normal user flow from poll creation through placing the real-world order
  - Active/overtime food-selection views now expose the meal-collection completion action to normal users while keeping abort/reminder/fallback actions admin-only
  - Validation:
    - `npm run test:server -- tests/server/food-selection-authz.test.ts tests/server/food-selection-routes.test.ts`
    - `npm run test:client -- tests/client/FoodSelectionActiveView.test.tsx tests/client/FoodSelectionOvertimeView.test.tsx`
    - `./validate.ps1`

---

## Priority 77 - Responsive / Mobile-Friendly UI (Backlog)

- [ ] **77.1 Audit critical flows for small-screen usability**
  - Review the main lunch flow, menu management, admin/auth screens, dashboard, orders rail, and shopping list on phone-sized viewports
  - Identify overflow, clipped controls, hard-to-tap actions, and layouts that assume desktop width

- [ ] **77.2 Make primary user flows mobile-friendly**
  - Ensure poll, food-selection, delivery, dashboard, shopping list, and menu-management screens work cleanly on narrow screens
  - Collapse multi-column layouts appropriately, improve spacing/tap targets, and prevent horizontal scrolling in normal usage

- [ ] **77.3 Add regression coverage / validation for responsive behavior**
  - Add focused client tests where layout/state behavior depends on mobile-specific rendering decisions
  - Validate manually in browser responsive mode for common phone widths in addition to `./validate.ps1`

---

## Priority 78 - Office Scheduling Defaults (Mar 2026)

- [x] **78.1 Add per-office auto poll schedule and default food-selection duration** *(done)*
  - Added office-level persisted settings on `office_locations`:
    - `auto_start_poll_enabled`
    - `auto_start_poll_weekdays`
    - `auto_start_poll_finish_time`
    - `default_food_selection_duration_minutes`
  - Added migration `20260312231023_add_office_schedule_defaults`
  - Admins can now edit those settings per office directly from the office-management section in `AuthGate`
  - Added `POST /api/auth/offices/:officeId/settings` with admin-only authorization and validation for:
    - weekday selection
    - `HH:MM` finish time
    - food-selection duration values compatible with the existing flow (`1`, `5`, `10`, `15`, `20`, `25`, `30`)
  - Added office-scoped automatic poll scheduling on the server:
    - runs in the active app process outside test runtime
    - creates a `Scheduled lunch poll` during the configured weekday/time window
    - dedupes by office and date
    - skips offices that already have lunch activity for that day
  - Manual and automatic food-selection starts now use the office default duration instead of mixed hardcoded/global defaults:
    - SSE `initial_state` now hydrates `defaultFoodSelectionDurationMinutes`
    - `PollFinishedView` and single-menu quick-start default to the current office setting
    - poll winner auto-start resolves the office default on the server, while test runtime still honors the existing env override so suites stay deterministic
  - Added focused coverage for:
    - office settings service validation
    - admin route authorization
    - admin UI editing/saving
    - scheduler timing/deduplication
    - office-scoped default-duration hydration
  - Validation:
    - `./validate.ps1`

- [ ] **78.2 Add ordering-claim timeout and recovery**
  - Prevent `ORDERING` from getting stuck when someone claims responsibility but never places the order
  - Add a default `10`-minute claim lease when a user starts the final ordering step
  - Allow the current claimer to extend the lease by another `10` minutes while the claim is still active
  - When the lease expires, automatically release the claim but keep the food selection in `ordering` so another user can take over
  - Broadcast claim, extension, and expiration/release events so all clients stay in sync
  - Update the ordering UI to show remaining claim time and a clear takeover path after expiry
  - Add service, route, SSE, and client coverage for orphan-prevention behavior

- [ ] **78.3 Allow late meal selection until ordering is explicitly claimed**
  - Revisit the current behavior where meal selection effectively closes for non-voters as soon as the poll finishes
  - Product intent: once a winning menu exists, teammates who did not vote in the poll should still be able to choose their meal until someone explicitly claims the real-world ordering step
  - Separate "ordering started" from "ordering locked" in the backend state model so meal selection remains open during unclaimed `ORDERING`
  - Update overtime/ordering transitions, authorization, and reminders so they follow the new cutoff moment instead of poll-finish time
  - Revisit UI copy and controls around finished poll, active food selection, ordering, and ordering claim so the availability window is clear to users
  - Allow admins or the food-selection creator to keep adjusting the remaining collection window while `ORDERING` is still unclaimed
  - Add service, route, SSE, and client coverage for late selectors who skipped the poll but choose a meal before ordering starts

---

## Priority 79 - Office-Scoped Admin Roles (Backlog)

- [ ] **79.1 Add office-location admin role distinct from global admin**
  - Introduce office-scoped admins who can manage one or more assigned offices without receiving global admin powers
  - Office admins should be able to do everything operational inside their managed offices, including:
    - menu and shopping-list management
    - poll and food-selection lifecycle actions
    - office-local user approvals and office assignments within their managed office scope
    - office scheduling/settings management for their managed offices
  - Office admins must not:
    - see or manage offices they do not administer
    - manage global admins
    - change data in unrelated offices unless they are explicitly assigned there
  - Keep support for a user being:
    - global admin
    - office admin for selected offices
    - normal user in other offices
  - Implementation should revisit route authorization, office selector visibility, admin UI affordances, and notification fanout rules

---

## Priority 80 - Poll Concurrency (Backlog)

- [ ] **80.1 Allow multiple concurrent polls within one office**
  - Revisit the current single-active-poll-per-office rule so one office can intentionally run more than one poll at the same time
  - Define the product model first: how users distinguish polls, how voting/start-food-selection targets a specific poll, and how ties, timers, notifications, and dashboard summaries behave with multiple active polls
  - Revisit SSE `initial_state`, browser notifications, and client phase derivation, which currently assume at most one active poll per office
  - Revisit the food-selection guard so a food selection can be started from the intended finished poll without ambiguity
  - Add explicit office + poll identity handling to routes, selectors, and client state before implementing

---

## Priority 81 - Dev Auth Fallback (Mar 2026)

- [x] **81.1 Keep local login available when Entra is omitted in dev** *(done)*
  - `/api/auth/config` now reports `localEnabled: true` whenever Entra auth is not configured, so the sign-in screen still offers username/password login in dev-only setups
  - `/api/auth/local/login` no longer short-circuits with `503 Local authentication is not configured`; missing/unknown users now fail with the normal `401 Invalid username or password`
  - Added backend coverage for the no-Entra config path and client coverage for the local-only sign-in screen
  - Discovery: with the current Prisma 6.19.x client + TypeScript setup, some callback parameters from Prisma result arrays stop inferring cleanly; lightweight explicit callback/transaction annotations restore `npm run typecheck` without behavioral changes
  - Discovery: local Postgres host port conflicts can block server tests even when Docker is installed; the repo now supports configurable `DB_PORT`, and this workspace uses `55433` instead of the historical `5433`
  - Discovery: after dependency churn, `@prisma/client` may need regeneration before Vitest imports `src/server/db.ts`; `pretest` and `pretest:server` now run `prisma generate` automatically
  - Discovery: repo validation now has commit-time continuity snapshots plus Semgrep/Playwright phases; `.githooks/pre-commit` runs `./validate.ps1 all` and `.githooks/pre-push` runs `./validate.ps1 full`
  - Validation:
    - `npm run test:client -- tests/client/AuthGate.test.tsx`
    - `./validate.ps1`

---

## Priority 82 - Auth Hardening (Mar 2026)

- [x] **82.1 Write auth hardening spec** *(done)*
  - Added [specs/auth-hardening.md](specs/auth-hardening.md)
  - Scope is intentionally narrow:
    - keep the custom Fastify auth stack
    - harden Entra token validation
    - add local-login abuse protection
    - document session expectations and non-goals

- [x] **82.2 Harden Entra token validation** *(done)*
  - Added `jose`-backed OIDC verification for Entra `id_token` handling instead of trusting decoded JWT payloads alone
  - Callback now validates signature, issuer, audience/client ID, and time-based claims before any app session cookie is issued
  - Tenant restriction and callback-state validation remain in place; failed callbacks now clear the transient Entra state cookie and return without setting `team_lunch_auth_session`
  - Added focused backend coverage for invalid audience, invalid signature, and wrong-tenant callback flows
  - Discovery: `ENTRA_OPENID_CONFIGURATION_URL` can now override the default Microsoft discovery endpoint, which keeps tests deterministic and leaves room for custom cloud/edge deployments without changing auth flow code

- [x] **82.3 Add local-login abuse protection** *(done)*
  - Added in-process lockout tracking around `POST /api/auth/local/login` with per-IP and per-IP+username failure windows
  - Repeated failed attempts now return `429` with `Retry-After`, while a successful login clears the accumulated penalty for that source/identity
  - Added focused backend coverage for lockout after repeated failures and reset behavior after a successful login

---

## Priority 83 - Dev Infra Maintenance (Mar 2026)

- [x] **83.1 Upgrade Docker Compose Postgres image to 18** *(done)*
  - Updated `docker-compose.yml` from `postgres:16-alpine` to `postgres:18-alpine`
  - Adjusted the named-volume mount to `/var/lib/postgresql` and set `PGDATA=/var/lib/postgresql/data/pgdata` to match the PostgreSQL 18+ Docker image layout
  - Updated `README.md` and `AGENTS.md` so local setup docs match the new container baseline

- [x] **83.2 Add production-only npm audit gate to validation** *(done)*
  - Updated `validate.ps1` to run `npm audit --omit=dev` alongside the other quality/security checks
  - This keeps the validation gate focused on production/runtime vulnerabilities while avoiding false pressure from dev-only advisories in tooling dependencies
  - Recorded the behavior in `AGENTS.md` for future contributors
