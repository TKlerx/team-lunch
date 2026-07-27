# Menu item tags → meal/beverage tabs and tag filters

## Context

During the meal-selection phase (`FoodSelectionActiveView` → `OrderForm`), users browse the winning menu's items with only a text search. The feature goal is to let imported menus carry user-facing tags per menu item, show/edit those tags in Manage Menus, and use them during food selection for simple filtering.

Important distinction: the backend already has internal recommender feature tags in `MenuItemFeature`, written by keyword extraction (`provenance: "keyword"`) and AI gap-fill (`provenance: "ai"`). Those tags are not this feature's user-facing tags.

This feature adds user-facing menu tags using the same table with `provenance: "menu"`.

## Decisions

### A. Tag quality / source

Imported menu items may have optional arbitrary plaintext tags:

```json
{
  "name": "Club Mate",
  "ingredients": "500ml bottle",
  "price": 2.8,
  "tags": ["beverage", "cold", "caffeinated"]
}
```

Rules:

- Store import/admin menu tags as `MenuItemFeature` rows with `provenance: "menu"`.
- Existing `provenance: "keyword"` and `provenance: "ai"` rows stay internal recommender metadata.
- API/client `MenuItem.tags` exposes only `provenance: "menu"` tags.
- Tags are arbitrary lowercase strings. `vegan`, `vegetarian`, `xyz`, etc. have no special meaning.
- The only interpreted tag is `beverage`.
- Items with `beverage` appear in the Beverage tab.
- Items without `beverage` appear in the Meal tab.
- There is no stored, imported, displayed, or edited `meal` tag.

### B. Quick removal / prune semantics

Dropped from v1. Meal/Beverage tabs plus tag filters are the pruning mechanism.

No per-item hide button, no "show hidden", no persistent hidden preferences, and no admin delete semantics in this feature.

### C. Tag editing

Tags are editable in Manage Menus. Anyone who can edit menu items can add/remove that item's menu tags.

Editing tags replaces only `provenance: "menu"` rows. It must not delete or alter `provenance: "keyword"` or `provenance: "ai"` rows.

## Tag normalization

Use one shared helper for import and manual editing:

- Accept only arrays of strings from import JSON.
- Trim whitespace.
- Lowercase tags.
- Drop empty tags.
- Reject tags longer than 60 characters (`MenuItemFeature.tag` is `VarChar(60)`).
- De-duplicate after normalization.

Lowercase is the canonical stored and displayed form: `Beverage`, ` beverage `, and `beverage` all become `beverage`.

## Implementation

### 1. Shared types and helpers

- `src/lib/types.ts`
  - Add `tags: string[]` to `MenuItem`.
  - Add optional `tags?: string[]` to `CreateMenuItemRequest` and `UpdateMenuItemRequest`.
- New shared helper, likely `src/lib/menuItemTags.ts`:
  - `MENU_TAG_PROVENANCE = "menu"`
  - `BEVERAGE_TAG = "beverage"`
  - `normalizeMenuTags(...)`
  - `isBeverageMenuItem(item)`
  - `getFoodSelectionVisibleTags(item)` filters out `beverage`.

### 2. Database constraint

Current schema has:

```prisma
@@unique([menuItemId, tag])
```

Change to:

```prisma
@@unique([menuItemId, provenance, tag])
```

Reason: user-facing menu tags are arbitrary and could collide with internal recommender tags such as `style:thai`. The same literal tag may need to exist once as `provenance: "menu"` and once as `provenance: "keyword"` or `"ai"`.

Add a Prisma migration.

### 3. Import JSON schema and parser

- `import/menu/import-menu-schema.json`
  - Add optional item field `tags` as an array of strings, max item length 60.
- `src/client/pages/ManageMenus.tsx`
  - Update the import LLM prompt to mention optional `tags`.
  - Tell it to use `beverage` for drinks only when appropriate.
- `src/server/services/menu.ts`
  - Extend `ImportItem` with `tags: string[]`.
  - Parse optional `item.tags`.
  - Validate through the shared normalization helper.
  - Store parsed tags after menu items are created/fetched.

Implementation note: the import flow currently uses `createMany`, which does not return item IDs. After `createMany`, fetch menu items for the menu and map by unique item name; item names are already validated unique case-insensitively.

### 4. Preserve menu tags during internal feature sync

Current internal feature sync deletes all feature rows for an item:

```ts
await db.menuItemFeature.deleteMany({ where: { menuItemId: menuItem.id } });
```

That would delete user-facing menu tags. Scope it to internal provenance only:

```ts
await db.menuItemFeature.deleteMany({
  where: {
    menuItemId: menuItem.id,
    provenance: { in: ["keyword", "ai"] },
  },
});
```

If AI tags are only inserted in a separate import gap-fill path, ensure that path also does not conflict with or delete `provenance: "menu"` rows.

### 5. Format and load menu tags

- Extend `formatMenuItem` to emit `tags` from `menuItemFeatures` filtered to `provenance: "menu"`.
- Every query that returns menus/items for API/SSE payloads must include:

```ts
menuItemFeatures: {
  where: { provenance: "menu" },
  select: { tag: true },
  orderBy: { tag: "asc" }
}
```

Relevant paths include:

- menu list/detail responses
- `listItems`
- `createItem`
- `updateItem`
- import create/update result
- SSE payloads for `item_created`, `item_updated`, `menu_created`, `menu_updated`

### 6. Manage Menus UI

- Show all `MenuItem.tags` as subtle badges on each menu item, including `beverage`.
- Add simple tag editing to the existing item edit/create flow.
- Saving an item with `tags` replaces only `provenance: "menu"` tags.
- `tags: undefined` means leave tags unchanged for backward-compatible update calls.
- `tags: []` means clear all menu tags.

Badge visual style: subtle, small font, pastel-ish background, low contrast enough to avoid distraction but still readable.

### 7. Food Selection UI

In `FoodSelectionActiveView` / `OrderForm`:

- Split the item list into two tabs:
  - Meal: items without `beverage`
  - Beverage: items with `beverage`
- Within the active tab, derive available filter chips from tags in that tab.
- Hide `beverage` from food-selection badges and filter chips.
- If no chip is selected, show all items in the active tab.
- If one or more chips are selected, show items matching any selected tag (OR semantics).
- Existing text search still composes with tabs and tag filters.
- Render non-`beverage` item tags as subtle badges on item cards.

### 8. Tests

Add/update focused tests:

- `tests/lib/menuItemTags.test.ts`
  - normalization
  - beverage classification
  - food-selection visible tags hide `beverage`
  - OR matching behavior if helper owns it
- Server menu/import tests
  - import accepts item `tags`
  - imported tags are returned as `MenuItem.tags`
  - internal `keyword`/`ai` tags are not returned as `MenuItem.tags`
  - updating item tags replaces only `provenance: "menu"`
  - internal feature sync does not delete menu tags
- Client Manage Menus tests
  - tags display as badges
  - tags can be edited with existing item-edit permission
- Client Food Selection tests
  - Meal tab excludes `beverage` items
  - Beverage tab includes only `beverage` items
  - `beverage` is hidden from chips/badges during food selection
  - selecting multiple chips filters with OR semantics
  - text search composes with selected tab and tags

## Verification

Focused while iterating:

```bash
pnpm typecheck
pnpm test:server
pnpm test:client
```

Before marking the task shipped:

```bash
pwsh -File ./validate.ps1 all
```

FAIM after code changes:

```bash
pnpm faim:deps
faim validate
```
