# Feature Specification: Menu Safety Labels

**Feature Branch**: `004-menu-safety-labels`

**Created**: 2026-07-24

**Status**: Draft

**Input**: Extend imported and manually managed menu items with separate allergen and additive labels. Show them apart from preference tags and let food-selection users temporarily exclude matching dishes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import and manage safety labels (Priority: P1)

A menu manager imports, creates, or edits an item with allergen and additive labels so that the menu accurately communicates ingredients users may need to avoid.

**Why this priority**: Accurate safety information is required before a user can safely exclude dishes.

**Independent Test**: Import a menu containing labels, then create and edit an item; verify each item retains its separate labels after the menu is displayed again.

**Acceptance Scenarios**:

1. **Given** a valid imported item containing `allergens` and `additives`, **When** the import completes, **Then** both label sets are retained separately from its tags.
2. **Given** an imported or manually edited label with surrounding whitespace, uppercase characters, or duplicates, **When** it is saved, **Then** its stored/displayed set is trimmed, lowercase, and deduplicated.
3. **Given** an imported item without one or both safety-label fields, **When** the import completes, **Then** the missing set is empty and the import remains valid.
4. **Given** an invalid safety-label value, **When** import validation runs, **Then** the import is rejected atomically with a path-specific violation.

---

### User Story 2 - Recognize item safety information (Priority: P1)

A user viewing a menu item can distinguish ordinary preference tags from its allergens and additives before deciding whether to order it.

**Why this priority**: Safety labels are useful only when they are clearly distinct from optional preference tags.

**Independent Test**: View an item with all three sets and confirm tags, allergens, and additives are rendered as separately labelled visual groups.

**Acceptance Scenarios**:

1. **Given** an item with tags, allergens, and additives, **When** it is shown in menu management or food selection, **Then** each non-empty set is visually distinct and explicitly identified.
2. **Given** an item with no allergens or additives, **When** it is shown, **Then** no empty safety-label group is displayed.
3. **Given** an item with allergens or additives but no tags, **When** it is shown, **Then** its safety-label groups remain visible.

---

### User Story 3 - Temporarily exclude dishes by safety labels (Priority: P1)

A food-selection user selects allergens and/or additives to avoid and sees only dishes that contain none of the selected labels.

**Why this priority**: This is the safety behavior the labels enable during ordering.

**Independent Test**: Start food selection with items carrying different labels, select one or more exclusions, and verify matching items disappear while non-matching items remain.

**Acceptance Scenarios**:

1. **Given** an active food selection with safety labels, **When** a user selects an allergen or additive exclusion, **Then** every item containing any selected value is hidden from the item list.
2. **Given** selected exclusions, **When** a user clears one, **Then** matching items become visible again unless another active filter excludes them.
3. **Given** exclusions that hide every item in the active tab, **When** the user views that tab, **Then** the empty filtered result is shown and no excluded item is restored automatically.
4. **Given** a user changes between meal and beverage tabs, **When** exclusions are selected, **Then** the same temporary exclusions apply to both tabs for the current food-selection view.
5. **Given** an existing order or a configured ingredient preference, **When** safety exclusions are selected, **Then** the existing order remains intact and existing preference warnings retain their current behavior.

### Edge Cases

- A label may appear in more than one item and must be offered only once as an exclusion choice.
- A menu item may have overlapping text in a tag and a safety-label set; their functions remain separate.
- Selecting both allergen and additive exclusions excludes an item matching either set.
- Refreshing, leaving, or reopening food selection clears temporary exclusions; they are not saved as user preferences.
- An empty safety-label set does not exclude any item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each menu item MUST support independent `tags`, `allergens`, and `additives` label sets.
- **FR-002**: The system MUST accept optional `allergens` and `additives` sets during menu import and manual item create/update flows.
- **FR-003**: Each accepted safety-label value MUST be trimmed, normalized to lowercase, and deduplicated within its own set.
- **FR-004**: The system MUST reject non-list safety-label input, non-text entries, and values exceeding the existing menu-label length limit; import rejection MUST remain atomic and identify the invalid field path.
- **FR-005**: An omitted `allergens` or `additives` field MUST be interpreted as an empty set.
- **FR-006**: Menu-item displays MUST render non-empty tags, allergens, and additives as visually and textually distinct groups.
- **FR-007**: Food selection MUST offer the distinct allergen and additive values present in the active menu as temporary exclusions.
- **FR-008**: Food selection MUST hide an item when its allergens or additives intersect the user's selected exclusions.
- **FR-009**: Safety exclusions MUST be local to the current food-selection view and MUST NOT be persisted, shared, or converted into profile preferences.
- **FR-010**: Tags MUST retain their existing preference/filtering behavior; safety exclusions MUST NOT change existing ingredient-allergy or dislike warnings.
- **FR-011**: Existing menu-update notifications MUST continue to refresh other clients after changes to an item's safety labels.

### Key Entities *(include if feature involves data)*

- **Menu item**: A purchasable dish with separate preference tags, allergens, and additives.
- **Allergen label**: A normalized, free-text value supplied by the menu source that identifies an allergen in one or more items.
- **Additive label**: A normalized, free-text value supplied by the menu source that identifies an additive in one or more items.
- **Temporary safety exclusion**: A user-selected allergen or additive label that filters the current food-selection view only.

### Realtime / SSE Events *(include if feature changes shared state)*

- **Existing menu update event**: emitted when item safety labels are created, edited, or replaced by import; clients refresh menu data using the existing behavior.

### Data / Migration Impact *(include if feature touches persisted data)*

- New/changed models or columns: persisted allergen and additive label sets on menu items.
- PostgreSQL schema and migration updated: yes.
- Name-snapshot column needed alongside any FK: no; labels do not reference another entity.
- `tests/server/helpers/db.ts` cleanup extended for new persisted models: no; the labels belong to existing menu items.

### Scope Flags *(Team Lunch optional surfaces)*

- Multi-office aware: yes — labels remain attached to the existing office-scoped menu items.
- Auth scope: existing menu-management and food-selection access rules.
- Email notification involved (Microsoft Graph): no.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A valid imported or manually saved item preserves 100% of its distinct normalized tags, allergens, and additives when viewed again.
- **SC-002**: In a menu containing labelled and unlabelled items, selecting any safety exclusion hides 100% of matching items and 0% of non-matching items.
- **SC-003**: Users can identify whether a displayed label is a tag, allergen, or additive without relying on color alone.
- **SC-004**: Clearing all temporary exclusions restores the same item set that was visible before exclusions, subject only to existing search, tab, and tag filters.

## Assumptions

- Safety labels are free-text values from menu JSON; no shared allergen or additive catalogue is introduced.
- Values are normalized and deduplicated on all write paths, including manual menu management, using the same user-friendly behavior as tags.
- Temporary exclusions apply to both meal and beverage tabs while the food-selection view is open, but are lost on refresh, navigation, or reopening the view.
- Existing Settings ingredient allergies/dislikes remain warning-only and do not preselect or alter safety exclusions.
- This feature does not change recommendation scoring, food-order persistence, or historical order records.
