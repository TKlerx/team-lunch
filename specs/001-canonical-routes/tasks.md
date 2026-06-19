# Tasks: Canonical App Routes

**Input**: Design documents from `specs/001-canonical-routes/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/ui-routes.md`, `quickstart.md`

**Tests**: Mandatory for Team Lunch. This task list is backfilled after implementation, so completed tasks are marked `[x]`.

**Organization**: Tasks are grouped by user story so each story remains independently testable.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm this is a client-router-only slice and avoid unnecessary backend/database work.

- [x] T001 Review `specs/001-canonical-routes/spec.md` and confirm no Prisma, server route, or SSE event changes are required
- [x] T002 [P] Identify existing router and shell ownership in `src/client/App.tsx`
- [x] T003 [P] Identify existing shopping navigation ownership in `src/client/components/Header.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add shared route fallback primitives before story-specific routes.

- [x] T004 Add route loading and unavailable-state UI helpers in `src/client/App.tsx`
- [x] T005 Keep existing `useSSE` subscription mounted across routed views in `src/client/App.tsx`
- [x] T006 Preserve authenticated app shell and database connection modal behavior in `src/client/App.tsx`

**Checkpoint**: Foundation ready for canonical section and detail routes.

---

## Phase 3: User Story 1 - Navigate Core App Sections by URL (Priority: P1)

**Goal**: Users can open, refresh, and test top-level app surfaces by stable URL.

**Independent Test**: Open section URLs directly and verify the expected view appears inside the app shell.

### Tests for User Story 1

- [x] T007 [P] [US1] Add `/shopping-list` route coverage in `tests/client/App.test.tsx`
- [x] T008 [P] [US1] Add `/shopping` compatibility redirect coverage in `tests/client/App.test.tsx`
- [x] T009 [P] [US1] Update shopping navigation href expectation in `tests/client/Header.test.tsx`
- [x] T010 [P] [US1] Add production-style direct shopping-list coverage in `tests/e2e/smoke.spec.ts`

### Implementation for User Story 1

- [x] T011 [US1] Add canonical `/shopping-list` route in `src/client/App.tsx`
- [x] T012 [US1] Add `/shopping` redirect to `/shopping-list` in `src/client/App.tsx`
- [x] T013 [US1] Update header shopping navigation to point at `/shopping-list` in `src/client/components/Header.tsx`
- [x] T014 [US1] Keep `/menus`, `/settings`, and `/admin` routes available in `src/client/App.tsx`

**Checkpoint**: Top-level section URLs are stable and independently testable.

---

## Phase 4: User Story 2 - Share Current Lunch Flow Links (Priority: P2)

**Goal**: Users can open a current poll or current food-selection URL and see the matching live phase.

**Independent Test**: Route to a matching live poll or food-selection ID and verify the main lunch phase view renders; route to a stale ID and verify unavailable state.

### Tests for User Story 2

- [x] T015 [P] [US2] Add matching `/polls/{pollId}` route coverage in `tests/client/App.test.tsx`
- [x] T016 [P] [US2] Add stale `/polls/{pollId}` unavailable coverage in `tests/client/App.test.tsx`
- [x] T017 [P] [US2] Add matching active `/food-selections/{foodSelectionId}` route coverage in `tests/client/App.test.tsx`
- [x] T018 [P] [US2] Add stale `/food-selections/{foodSelectionId}` unavailable coverage in `tests/client/App.test.tsx`

### Implementation for User Story 2

- [x] T019 [US2] Add `/polls/:pollId` route and active/just-finished matching logic in `src/client/App.tsx`
- [x] T020 [US2] Add `/food-selections/:foodSelectionId` route and active-flow matching logic in `src/client/App.tsx`
- [x] T021 [US2] Add unavailable route states for stale or inaccessible detail IDs in `src/client/App.tsx`
- [x] T022 [US2] Route the in-progress rail item to the best matching live URL in `src/client/App.tsx`

**Checkpoint**: Current lunch flow links render live state or a clear recovery state.

---

## Phase 5: User Story 3 - Link to Completed Meal History (Priority: P3)

**Goal**: Users can open a loaded completed meal by URL and refresh/share that route.

**Independent Test**: Route to a completed food-selection ID present in history and verify the historical completed view renders.

### Tests for User Story 3

- [x] T023 [P] [US3] Add completed history route coverage in `tests/client/App.test.tsx`
- [x] T024 [P] [US3] Add orders-rail navigation URL coverage in `tests/client/App.test.tsx`

### Implementation for User Story 3

- [x] T025 [US3] Resolve completed food selections from loaded history in `src/client/App.tsx`
- [x] T026 [US3] Render `FoodSelectionCompletedView` for matching completed detail routes in `src/client/App.tsx`
- [x] T027 [US3] Navigate completed orders-rail selections to `/food-selections/{id}` in `src/client/App.tsx`

**Checkpoint**: Loaded completed meal details are URL-addressable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the completed route slice and document the process.

- [x] T028 [P] Add Spec Kit route contract documentation in `specs/001-canonical-routes/contracts/ui-routes.md`
- [x] T029 [P] Add quickstart validation notes in `specs/001-canonical-routes/quickstart.md`
- [x] T030 [P] Update spec tracking in `specs/OVERVIEW.md`
- [x] T031 Run client route tests with `pnpm exec vitest run --project client tests/client/App.test.tsx tests/client/Header.test.tsx`
- [x] T032 Run client project tests with `pnpm exec vitest run --project client`
- [x] T033 Run Playwright e2e smoke tests with `pnpm exec playwright test --project=chromium`
- [x] T034 Run non-test quality gates: typecheck, lint, duplication, semgrep, audit, and `git diff --check`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1
- **User Story 1 (Phase 3)**: Depends on Phase 2
- **User Story 2 (Phase 4)**: Depends on Phase 2; can be developed after or alongside US1 once route helpers exist
- **User Story 3 (Phase 5)**: Depends on Phase 2 and uses the same food-selection route as US2
- **Polish (Phase 6)**: Depends on selected stories being complete

### Parallel Opportunities

- T002 and T003 can run in parallel.
- US1 tests T007-T010 can run in parallel with implementation tasks once route names are agreed.
- US2 tests T015-T018 can run in parallel because they cover independent route states in one test file.
- US3 documentation tasks T028-T029 can run in parallel with validation.

## Implementation Strategy

1. Deliver the MVP section URLs first (`/shopping-list`, `/shopping` redirect, existing section routes).
2. Add live detail routes for current poll and active food-selection flows.
3. Add completed food-selection history route support.
4. Validate with focused client tests, full client tests, and production-style Playwright smoke coverage.
