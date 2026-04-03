# Implementation Plan

> Gap analysis: all specs reviewed, `src/` does not exist yet. Every item below is outstanding.
> Tests are first-class citizens — each feature task includes its corresponding tests.

---

## Priority 1 — Project Scaffolding & Infrastructure

- [ ] **1.1 Initialize Node project**
  - Create `package.json` (single monorepo package) with scripts: `dev:server`, `dev:client`, `build`, `start`, `typecheck`, `lint`, `test`, `test:server`, `test:client`, `validate`
  - Create root `tsconfig.json` (strict mode) + path aliases for `src/server`, `src/client`, `src/lib`
  - Install core dependencies: fastify, react 18, react-dom, react-router-dom v6, typescript, vite, tailwindcss, prisma, @prisma/client
  - Install dev dependencies: vitest, @testing-library/react, @testing-library/jest-dom, supertest, tsx, eslint, prettier

- [ ] **1.2 Docker & database setup**
  - Create `docker-compose.yml` with PostgreSQL 16 service (port 5432) + app service
  - Create `Dockerfile` (multi-stage: build → production)
  - Create `.env.example` with `DATABASE_URL` template
  - Enable `citext` extension in PostgreSQL

- [ ] **1.3 Prisma schema & initial migration**
  - Create `prisma/schema.prisma` matching `data-model.md` exactly: `menus`, `menu_items`, `polls`, `poll_votes`, `food_selections`, `food_orders`
  - All UUID PKs, cascade deletes, unique constraints (case-insensitive via citext), snapshot name columns alongside FKs
  - Run `prisma migrate dev` to generate initial migration
  - **Test:** Verify migration applies cleanly against a fresh database

- [ ] **1.4 Vite & Tailwind configuration**
  - Create `vite.config.ts` with React plugin, proxy `/api` and `/api/events` to backend
  - Create `tailwind.config.ts` scanning `src/client/**/*.{ts,tsx}`
  - Create `postcss.config.js`
  - Create `index.html` entry point for Vite (client SPA)

---

## Priority 2 — Shared Types & Server Foundation

- [ ] **2.1 Shared TypeScript types (`src/lib/`)**
  - Define types/interfaces: `Menu`, `MenuItem`, `Poll`, `PollVote`, `FoodSelection`, `FoodOrder`
  - Define enums/unions: `PollStatus`, `FoodSelectionStatus`, `AppPhase`
  - Define SSE event types: `SSEEvent` union type covering all events from `realtime-events.md`
  - Define API request/response shapes
  - **Test:** Type-only — validated by `tsc --noEmit`

- [ ] **2.2 Prisma client singleton (`src/server/db.ts`)**
  - Export a single `PrismaClient` instance (no other file instantiates Prisma)
  - **Test:** Unit test — importing twice returns same instance

- [ ] **2.3 SSE manager (`src/server/sse.ts`)**
  - Maintain `Set<ServerResponse>` of active connections
  - `register(res)` — add to set, configure SSE headers (`text/event-stream`, keep-alive), remove on `close`
  - `broadcast(eventName, payload)` — iterate set, write `event: <name>\ndata: <JSON>\n\n` to each
  - `sendInitialState(res)` — query current app state and send `initial_state` event to single connection
  - **Tests:**
    - `broadcast` delivers named event + JSON payload to all registered mock responses
    - Disconnected clients are removed from the registry
    - `sendInitialState` sends correct payload shape

- [ ] **2.4 Fastify server entry point (`src/server/index.ts`)**
  - Create Fastify instance with CORS, JSON body parser
  - Register route modules: `/api/menus`, `/api/polls`, `/api/food-selections`, `/api/events`
  - `GET /api/events` — SSE endpoint: call `register(res)` then `sendInitialState(res)`
  - In production: serve Vite-built static files from `dist/client`
  - **Test:** Server starts without error; SSE endpoint returns `text/event-stream` content type

---

## Priority 3 — Menu Management (Backend + Tests)

- [ ] **3.1 Menu service (`src/server/services/menu.ts`)**
  - `createMenu(name)` — validate 1–60 chars, trimmed, unique (case-insensitive); insert; broadcast `menu_created`
  - `updateMenu(id, name)` — same validation; reject if name taken by different menu; broadcast `menu_updated`
  - `deleteMenu(id)` — cascade delete items; broadcast `menu_deleted`
  - `listMenus()` — alphabetical, include item count
  - `createItem(menuId, name, description?)` — validate 1–80 chars, unique within menu; broadcast `item_created`
  - `updateItem(id, name, description?)` — same validation; broadcast `item_updated`
  - `deleteItem(id)` — broadcast `item_deleted`
  - `listItems(menuId)` — creation order
  - **Tests (unit):**
    - Create menu with valid name succeeds
    - Create menu with duplicate name (case-insensitive) rejects
    - Create menu with empty/over-length name rejects
    - Delete menu cascades items
    - Create item with duplicate name within same menu rejects
    - Create item on non-existent menu rejects

- [ ] **3.2 Menu routes (`src/server/routes/menus.ts`)**
  - `GET /api/menus` — list all menus with items
  - `POST /api/menus` — create menu
  - `PUT /api/menus/:id` — rename menu
  - `DELETE /api/menus/:id` — delete menu (with confirmation note in response)
  - `POST /api/menus/:menuId/items` — add item
  - `PUT /api/menus/:menuId/items/:id` — edit item
  - `DELETE /api/menus/:menuId/items/:id` — delete item
  - **Tests (integration via supertest):**
    - Full CRUD round-trip for menus
    - Full CRUD round-trip for items
    - Duplicate name returns 409
    - Invalid input returns 400

---

## Priority 4 — Poll Lifecycle (Backend + Tests)

- [ ] **4.1 Poll service (`src/server/services/poll.ts`)**
  - `startPoll(description, durationMinutes)` — validate description 1–120 chars; duration must be multiple of 15 in range 60–720; reject if active/tied poll exists (HTTP 409); create with `status=active`, `ends_at=now+duration`; broadcast `poll_started`
  - `castVote(pollId, menuId, nickname)` — validate poll is active and not expired; one vote per menu per user; store `menu_name` snapshot; broadcast `vote_cast` with updated `voteCounts`
  - `withdrawVote(pollId, menuId, nickname)` — validate poll is active and not expired; remove vote; broadcast `vote_withdrawn` with updated `voteCounts`
  - `endPoll(pollId)` — count votes; single highest → `status=finished`, set winner; tie → `status=tied`; broadcast `poll_ended`; enforce retention (keep 5 most recent)
  - `extendPoll(pollId, extensionMinutes)` — validate poll is `tied`; extension in [5,10,15,30]; set `ends_at=now+extension`, `status=active`; broadcast `poll_extended`
  - `randomWinner(pollId)` — validate poll is `tied`; pick random from tied top candidates; set winner, `winner_selected_randomly=true`, `status=finished`; broadcast `poll_ended`; enforce retention
  - `getActivePoll()` — return current active/tied poll or null
  - `getLatestCompletedPoll()` — return most recent finished poll or null
  - **Tests (unit — critical paths per AGENTS.md):**
    - Vote counting per menu returns correct totals
    - Winner determination: single highest vote count → `status=finished`
    - Tie detection: two+ menus share top count → `status=tied`
    - Random winner picks only from tied top candidates
    - Duration validation: only multiples of 15 between 60–720 accepted
    - Single active poll enforcement: creating while active/tied → 409
    - Tie extension: `ends_at = now + extension`, returns `status=active`
    - Retention rule: after finishing, only 5 most recent polls kept

- [ ] **4.2 Poll routes (`src/server/routes/polls.ts`)**
  - `POST /api/polls` — start poll
  - `GET /api/polls/active` — get active/tied poll
  - `POST /api/polls/:id/votes` — cast vote
  - `DELETE /api/polls/:id/votes` — withdraw vote
  - `POST /api/polls/:id/end` — trigger timer expiry logic (called by server timer or client)
  - `POST /api/polls/:id/extend` — extend tied poll
  - `POST /api/polls/:id/random-winner` — pick random winner from tie
  - **Tests (integration via supertest):**
    - `POST /api/polls` rejects with 409 if active poll exists
    - `POST /api/polls/:id/votes` rejects after timer expiry
    - `POST /api/polls/:id/extend` rejects if poll is not `tied`
    - Vote cast/withdraw round-trip updates totals correctly

- [ ] **4.3 Server-side timer for poll expiry**
  - On poll start/extend: schedule a `setTimeout` for `ends_at - now`
  - On expiry: call `endPoll(pollId)` automatically
  - Cancel timer if poll is extended or resolved early
  - Persist timer reference in-memory (lost on restart — acceptable for this scope)
  - **Test:** Timer triggers `endPoll` after configured duration (use fake timers in vitest)

---

## Priority 5 — Food Selection Lifecycle (Backend + Tests)

- [ ] **5.1 Food selection service (`src/server/services/foodSelection.ts`)**
  - `startFoodSelection(pollId, durationMinutes)` — validate poll is `finished`; duration must be 10, 15, or 30; create with `status=active`, snapshot `menu_id`/`menu_name` from poll winner; broadcast `food_selection_started`
  - `placeOrder(selectionId, nickname, itemId, notes?)` — validate selection is `active` and not expired; snapshot `item_name`; upsert (one order per nickname); broadcast `order_placed` or `order_updated`
  - `withdrawOrder(selectionId, nickname)` — validate active and not expired; delete order; broadcast `order_withdrawn`
  - `expireFoodSelection(selectionId)` — set `status=overtime`; broadcast `food_selection_overtime`
  - `extendFoodSelection(selectionId, extensionMinutes)` — validate `overtime`; extension in [5,10,15]; set `ends_at=now+extension`, `status=active`; broadcast `food_selection_extended`
  - `completeFoodSelection(selectionId)` — validate `overtime`; set `status=completed`; enforce retention (keep 5 most recent completed); broadcast `food_selection_completed`
  - `getActiveFoodSelection()` — return current active/overtime selection or null
  - `getLatestCompletedFoodSelection()` — return most recent completed selection with orders or null
  - **Tests (unit — critical paths per AGENTS.md):**
    - Duration validation: only 10, 15, 30 accepted
    - One order per nickname: second submission replaces first
    - No order changes accepted once `status=overtime`
    - Extension sets `ends_at = now + extension`, returns `status=active`
    - Retention rule: after completing, only 5 most recent completed kept
    - Cannot start food selection if poll is not finished

- [ ] **5.2 Food selection routes (`src/server/routes/foodSelections.ts`)**
  - `POST /api/food-selections` — start food selection
  - `GET /api/food-selections/active` — get active/overtime food selection with orders
  - `POST /api/food-selections/:id/orders` — place/update order
  - `DELETE /api/food-selections/:id/orders` — withdraw order
  - `POST /api/food-selections/:id/expire` — trigger timer expiry
  - `POST /api/food-selections/:id/extend` — extend overtime
  - `POST /api/food-selections/:id/complete` — confirm completion
  - **Tests (integration via supertest):**
    - `POST /api/food-selections` rejects if no finished poll
    - `POST /api/food-selections/:id/orders` rejects after timer expiry
    - Order place/update/withdraw round-trip works correctly

- [ ] **5.3 Server-side timer for food selection expiry**
  - Same pattern as poll timer: schedule `setTimeout` on start/extend, call `expireFoodSelection` on expiry
  - **Test:** Timer triggers expiry after configured duration (fake timers)

---

## Priority 6 — Client Foundation

- [ ] **6.1 React app shell & routing (`src/client/`)**
  - `main.tsx` — React 18 `createRoot`, wrap in `BrowserRouter`
  - `App.tsx` — layout with Header + main content area
  - Header: app title "Team Lunch", "Manage Menus" nav link, nickname display (clickable for rename)
  - Routes: `/` (phase-driven main view), `/menus` (menu management)
  - Global CSS with Tailwind base/components/utilities

- [ ] **6.2 SSE hook (`src/client/hooks/useSSE.ts`)**
  - Connect to `GET /api/events` via `EventSource`
  - Register listeners for all event types from `realtime-events.md`
  - On `initial_state`: hydrate app state
  - On disconnect: auto-reconnect (native `EventSource` behavior)
  - Expose current app state via React Context
  - **Tests:**
    - `useSSE` correctly processes `initial_state` payload
    - Event handlers update state for each event type

- [ ] **6.3 App phase hook (`src/client/hooks/useAppPhase.ts`)**
  - Derive `AppPhase` enum from SSE state: `NICKNAME_PROMPT`, `NO_MENUS`, `POLL_IDLE`, `POLL_ACTIVE`, `POLL_TIED`, `POLL_FINISHED`, `FOOD_SELECTION_ACTIVE`, `FOOD_SELECTION_OVERTIME`, `FOOD_SELECTION_COMPLETED`
  - **Tests:**
    - Correctly derives phase from various `initial_state` combinations
    - Nickname absent → `NICKNAME_PROMPT`
    - No menus → `NO_MENUS`

- [ ] **6.4 Nickname hook & modal (`src/client/hooks/useNickname.ts`)**
  - Read/write `team_lunch_nickname` from `localStorage`
  - Full-screen modal on first visit (blocks interaction until nickname set)
  - Click nickname in header → rename dialog (same validation: 1–30 chars, trimmed)
  - **Tests:**
    - Nickname is read from `team_lunch_nickname` localStorage key
    - Modal shown when no nickname exists
    - Rename updates localStorage but does not retroactively change server data

---

## Priority 7 — Client Views

- [ ] **7.1 Manage Menus page (`src/client/pages/ManageMenus.tsx`)**
  - List menus alphabetically with item counts
  - Inline CRUD: create menu, rename, delete (with confirmation)
  - Per-menu: list items in creation order, add/edit/delete items
  - Empty state: "No menus yet. Create one to get started."
  - All mutations via REST API calls; SSE updates keep list in sync across clients

- [ ] **7.2 No Menus view**
  - Centered empty-state card with message + "Create Menu" CTA
  - CTA navigates to `/menus`

- [ ] **7.3 Poll Idle view**
  - "Start a Poll" card: description input (1–120 chars) + duration picker (1h–12h in 15-min steps)
  - Optionally show most recent completed poll result (collapsible)
  - Optionally show most recent completed food order (collapsible)

- [ ] **7.4 Poll Active view**
  - Poll description + circular countdown ring with remaining time (HH:MM:SS or MM:SS)
  - Live vote histogram (bar chart per menu, real-time via SSE)
  - Voting panel: list of menus with toggle buttons to cast/withdraw votes
  - "I'll sit this one out" option to collapse voting panel

- [ ] **7.5 Poll Tied view**
  - Show tied menus and vote counts
  - "Extend voting" button with duration picker (5/10/15/30 min)
  - "Pick randomly" button

- [ ] **7.6 Poll Finished view**
  - Winning menu name (+ "chosen randomly" label if applicable)
  - Final vote counts
  - "Start Food Selection" CTA with duration picker (10/15/30 min)

- [ ] **7.7 Food Selection Active view**
  - Subtle countdown (small timer or thin progress bar in header area)
  - Order form (primary): item list from winning menu, notes field (0–200 chars), submit/update/withdraw buttons
  - Order board (secondary): live list of nickname · item · notes for all orders (real-time via SSE)

- [ ] **7.8 Food Selection Overtime view**
  - Order form disabled
  - Prompt: "Time's up! Extend or confirm the order?"
  - Duration picker (5/10/15 min) + "Confirm — we're done" button

- [ ] **7.9 Food Selection Completed view**
  - Final order summary list (nickname · item · notes)
  - "Start a new poll" CTA → returns to Poll Idle

---

## Priority 8 — Client Component Tests

- [ ] **8.1 Component tests with @testing-library/react**
  - Nickname modal: renders on first visit, validates input, saves to localStorage
  - Menu management: CRUD operations, validation errors, empty state
  - Poll views: countdown display, vote histogram updates, duration picker constraints
  - Food selection views: order form validation, order board updates, overtime prompt
  - Phase transitions: correct view rendered for each AppPhase value

---

## Priority 9 — Integration & Polish

- [ ] **9.1 End-to-end SSE integration test**
  - Start server, connect SSE client, perform mutations, verify events received in correct order with correct payloads

- [ ] **9.2 Retention rule integration tests**
  - Create 6 polls → verify only 5 retained
  - Complete 6 food selections → verify only 5 retained

- [ ] **9.3 Production build & Docker**
  - Verify `npm run build` produces working output
  - Verify `docker compose up --build` starts full stack
  - Verify static client served correctly in production mode

- [ ] **9.4 CI validation script**
  - `npm run validate` runs `typecheck && lint && test` successfully with zero failures
