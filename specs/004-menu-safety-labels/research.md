# Research: Menu Safety Labels

## Decision: Store safety labels on `MenuItem` as two text lists

**Rationale**: Allergens and additives belong to one current menu item, are fully replaced with that item on import, and are not recommendation features. Two lists on the existing item keep reads, writes, and the food-selection filter simple. PostgreSQL supports these values without a separate lookup entity.

**Alternatives considered**:

- Extend `MenuItemFeature`: rejected because that model feeds item identity and recommendation features; safety labels must not become preference/recommender tags.
- Create allergen/additive catalogue and join tables: rejected because labels are intentionally free text and source-specific; it adds administration and migration complexity without a stated need.
- Store one mixed `safetyLabels` list: rejected because the UI and exclusion controls must distinguish allergens from additives.

## Decision: Normalize labels on every write path

**Rationale**: Import, manual create, and manual edit must compare the same values. Trim, lowercase, deduplicate, and enforce the existing 60-character label limit before persistence. Omitted lists become empty lists.

**Alternatives considered**:

- Reject uppercase values: rejected because it creates unnecessary import failures and differs from existing tag behavior.
- Normalize only imported labels: rejected because manual edits could then create non-matching exclusions.

## Decision: Extend the existing import contract and prompt

**Rationale**: The JSON schema, extraction prompt, import parser, and replacement transaction already define the import boundary. Adding optional `allergens` and `additives` arrays preserves atomic validation and replacement behavior.

**Alternatives considered**:

- Add a second safety-metadata import: rejected because it can drift from the menu item and complicates atomic import.
- Infer runtime labels from descriptions: rejected because source menu codes/legends are the authoritative input and inference can be unsafe.

## Decision: Keep exclusions local to `FoodSelectionActiveView`

**Rationale**: The user chose temporary exclusions. Local React state naturally clears on refresh/navigation, needs no API or profile data, and applies before rendering item cards.

**Alternatives considered**:

- Persist exclusions in Settings: rejected by scope; existing ingredient preferences remain warning-only.
- Send exclusions to the server: rejected because filtering is only presentation state and no shared/order state changes.

## Decision: Reuse current menu SSE events

**Rationale**: Editing or importing labels already changes a menu item and is covered by `item_created`, `item_updated`, `menu_created`, or `menu_updated`. Returned menu/item shapes gain the lists, so no new event is necessary.

**Alternatives considered**:

- New safety-label event: rejected as duplicate state propagation.
