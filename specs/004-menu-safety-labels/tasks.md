# Tasks: Menu Safety Labels

**Input**: Design documents from `specs/004-menu-safety-labels/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/menu-items.md`, `quickstart.md`

**Tests**: Mandatory — this feature changes persisted menu data, import validation, and food-selection filtering.

**Organization**: Tasks are grouped by user story. Complete one unchecked task at a time, validate it, mark it done, update discoveries if needed, and commit before starting the next task.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the durable item fields and one shared normalization boundary. No new catalogue, endpoint, event, or dependency.

- [x] T001 Add `MenuItem.allergens` and `MenuItem.additives` with empty-list defaults in `prisma/schema.prisma`; generate and apply a new LF-only migration in `prisma/migrations/` with `pnpm prisma migrate dev`.
- [x] T002 Extend `src/lib/menuItemTags.ts` with reusable trim/lowercase/deduplication validation for safety-label lists while preserving existing tag behavior, and add `allergens`/`additives` to `MenuItem`, `CreateMenuItemRequest`, and `UpdateMenuItemRequest` in `src/lib/types.ts`.

**Checkpoint**: Existing menu items read as having two empty safety-label lists; all client/server type consumers compile against the shared shape.

---

## Phase 2: Foundational (Import and Menu Data Flow)

**Purpose**: Carry the two lists through every existing menu-item write/read path before adding UI behavior.

- [ ] T003 Extend `import/menu/import-menu-schema.json` and `import/menu/import-menu-prompt.txt` to emit optional lowercase `allergens` and `additives` separately from tags, map source legends into the correct set, and keep vegetarian/vegan annotations as tags only.
- [ ] T004 Extend parsing, formatting, manual create/update, atomic import replacement, and existing menu/item SSE payloads in `src/server/services/menu.ts` so omitted create/import lists become empty, omitted update lists are preserved, and invalid import values produce path-specific violations.
- [ ] T005 Extend the existing thin payload forwarding in `src/server/routes/menus.ts` and typed item requests in `src/client/api.ts` for `allergens` and `additives` without adding endpoints.

**Checkpoint**: Existing menu CRUD/import APIs persist and return distinct normalized safety lists, and menu update events expose the updated item data.

---

## Phase 3: User Story 1 - Import and Manage Safety Labels (Priority: P1) 🎯 MVP

**Goal**: A menu manager can import, create, and edit allergen/additive labels and receive atomic, path-specific validation.

**Independent Test**: Import mixed-case duplicate labels, create/edit an item, re-read it, and verify separate normalized lists; submit an invalid import and verify no item changes persist.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add normalization, omitted-list, update-preservation, and atomic invalid-import coverage in `tests/server/menu-service.test.ts`.
- [ ] T007 [P] [US1] Add create/update/import request and path-specific validation coverage in `tests/server/menu-routes.test.ts`.

### Implementation for User Story 1

- [ ] T008 [US1] Add comma-separated allergen and additive inputs, client-side validation, API payloads, reset behavior, and separate edit/list badges in `src/client/pages/ManageMenus.tsx`.
- [ ] T009 [US1] Extend manual item editing, badge separation, and copied import-prompt assertions in `tests/client/ManageMenus.test.tsx`.

**Checkpoint**: Menu management independently supports imported and manually edited safety labels, while tags retain their existing behavior.

---

## Phase 4: User Story 2 - Recognize Item Safety Information (Priority: P1)

**Goal**: Users can visually distinguish preference tags from allergens and additives wherever an item is presented during ordering.

**Independent Test**: Render items with all combinations of label sets and verify separate labelled groups, no empty groups, and no reliance on color-only meaning.

### Tests for User Story 2

- [ ] T010 [P] [US2] Add card-display coverage for separate tag, allergen, and additive groups in `tests/client/FoodSelectionActiveView.test.tsx`.

### Implementation for User Story 2

- [ ] T011 [US2] Extend `OrderMenuItem` and `OrderItemCard` in `src/client/components/FoodSelectionActiveView.tsx` to display explicitly labelled allergen and additive groups independently from visible preference tags.

**Checkpoint**: Food-selection cards clearly identify every non-empty label set without changing Settings warnings or recommendation behavior.

---

## Phase 5: User Story 3 - Temporarily Exclude Dishes by Safety Labels (Priority: P1)

**Goal**: A user can select temporary allergen/additive exclusions and see matching items hidden in both food-selection tabs.

**Independent Test**: Select one or both exclusion types; verify matching items hide, non-matches remain, clearing restores matches, the empty state stays empty, switching tabs retains exclusions, and refresh/navigation do not persist them.

### Tests for User Story 3

- [ ] T012 [P] [US3] Add food-selection exclusion tests for allergen/additive matching, clearing, meal/beverage tabs, combined tag/search filters, empty results, and non-persistence in `tests/client/FoodSelectionActiveView.test.tsx`.

### Implementation for User Story 3

- [ ] T013 [US3] Add local selected-allergen/additive state, deduplicated controls, intersection filtering, and an explicit empty-filtered result to `src/client/components/FoodSelectionActiveView.tsx`; compose it with existing tab, search, and tag filters without mutating orders or preferences.

**Checkpoint**: Food-selection users can safely hide matching dishes temporarily; orders and existing ingredient-warning behavior remain unchanged.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Verify the whole feature and keep the specification state accurate.

- [ ] T014 Run the focused commands in `specs/004-menu-safety-labels/quickstart.md`, then `pwsh -File ./validate.ps1 all`; resolve failures caused by this feature and record unrelated blockers in `specs/004-menu-safety-labels/tasks.md`.
- [ ] T015 Update completed checkboxes and operational discoveries in `specs/004-menu-safety-labels/tasks.md`, then refresh continuity only if intentionally requested by `specs/CURRENT-WORK.md`.

---

## Dependencies & Execution Order

```text
T001 → T002 → T003 → T004 → T005
                         ├→ US1: T006/T007 → T008 → T009
                         ├→ US2: T010 → T011
                         └→ US3: T012 → T013
US1 + US2 + US3 → T014 → T015
```

- **Phase 1** blocks all subsequent work because the shared data shape does not exist yet.
- **Phase 2** blocks all stories because all menu reads/writes need the new shape.
- **US1, US2, and US3** can proceed in parallel after T005 if separate people own the indicated files, but complete them in listed order in this task loop.
- **Phase 6** runs only after all user stories are complete.

## Parallel Opportunities

- T006 and T007 modify separate server test files and can run in parallel after T005.
- T010 and T012 target separate test concerns in the same client file; keep them sequential in one worktree, or split only with coordinated edits.
- After Phase 2, implementation ownership can split across `ManageMenus.tsx` (US1), `FoodSelectionActiveView.tsx` display (US2), and exclusion behavior (US3), but merge US2/US3 carefully because they share the same component.

## Implementation Strategy

### MVP First

1. Complete T001–T005 to establish schema/import/API flow.
2. Complete US1 (T006–T009) and validate menu import/manual management independently.
3. Continue with US2 display, then US3 filtering.

### Incremental Delivery

1. **US1** delivers accurate persistent safety metadata.
2. **US2** makes that metadata recognizable while ordering.
3. **US3** adds the temporary hiding behavior without new persisted preference state.
4. **Polish** validates the full flow and records progress.

## Notes

- Do not put safety labels in `MenuItemFeature`; that model remains recommendation/tag data.
- Do not add a catalogue, settings persistence, a new endpoint, or a new SSE event.
- Before each task is marked complete, run its focused test; before feature completion run the full validation gate.
- The existing production dependency audit currently reports unrelated locked dependency advisories; do not weaken validation or alter dependencies as part of this feature unless separately requested.
