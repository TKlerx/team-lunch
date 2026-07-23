# Menu item tags → filter & prune during meal selection

## Context
During the meal-selection phase (`FoodSelectionActiveView` → `OrderForm`), users browse the winning menu's items with only a text search (min 3 chars, `filteredMenuItems` memo at src/client/components/FoodSelectionActiveView.tsx:131). The ask: imported menus should carry menu-item tags (vegan, vegetarian, drink, dessert, meal, …) so users can **filter by tag** during selection and **quickly remove undesired items** from view.

Key discovery: **the tagging backend already exists.** `MenuItemFeature` (prisma/schema.prisma:96) stores per-item tags, written on every import in `src/server/services/menu.ts` via two paths — keyword extraction (`extractFeatures` in `src/server/services/mealFeatures.ts`, provenance `keyword`) and AI gap-fill (`requestAiFeatureTags`, provenance `ai`). Tags are prefixed and recommender-oriented: `ingredient:chicken`, `style:thai`, `style:vegan`, `course:drink`, `course:side`. They are **not** shipped to the client — `formatMenuItem` (src/server/services/menu.ts:233) drops them and the shared `MenuItem` type (src/lib/types.ts:64) has no tags field.

So the feature is mostly: **ship existing tags to the client + build the filter/prune UI**. No new tag storage, no new endpoints, no AI-prompt change.

## Open questions (decide before implementing)

**A. Tag quality / source.**
- **A1:** reuse existing keyword+AI tags as-is; surface only a curated subset. Zero backend tagging changes. Risk: keyword-derived vegan/vegetarian is best-effort, "dessert"≈`style:sweet` is approximate, "meal" is derived by absence.
- **A2:** extend the AI tagging prompt (`requestAiFeatureTags`) to emit clean course/diet categories (`course:meal`, `course:dessert`, reliable `diet:vegan`/`diet:vegetarian`). Better UX; touches the AI prompt + re-tag/backfill of existing menus.

**B. "Quick removal of undesired items" semantics.**
- **B1:** personal, ephemeral client-side hide while browsing (× on each card). Nothing persisted; pure convenience.
- **B2:** persistent per-user hidden-items/tags preference (stored via userPreferences).
- **B3:** admin actually removes items from the menu (persistent, affects everyone) — partly exists via ManageMenus item delete.

**C. Tag editing.** Should ManageMenus let an admin edit an item's tags, or is import-only tagging enough for v1?

> The implementation below is written for **A1 + B1 + import-only** and must be revised if the decisions land elsewhere.

## Implementation

### 1. Ship tags with menu items (server)
- `src/lib/types.ts`: add `tags: string[]` to `MenuItem` (line 64).
- `src/server/services/menu.ts`:
  - Extend `formatMenuItem` (line 233) to emit `tags` from `menuItemFeatures`.
  - Wherever a menu/items are loaded for `formatMenu`/`formatMenuItem`, extend the Prisma `include: { items: … }` with `menuItemFeatures: { select: { tag: true } }` — pattern repeats across the list/create/update/import paths (e.g. `findUniqueOrThrow` at lines ~907, ~939, and the menus-list query).
  - Item mutation paths that emit SSE `item_created`/`item_updated` (payload is `MenuItem`, src/lib/types.ts:633-634) must go through the same formatter so live updates carry tags.

### 2. Curated display vocabulary (shared helper)
New `src/lib/menuItemTags.ts` (pure, shared client/server-agnostic):
- Map raw tags → user-facing categories: `course:drink`→`Drink`, `style:sweet`→`Dessert`, `style:vegan`→`Vegan`, `style:vegetarian`→`Vegetarian`; `Meal` = item has none of `course:drink`/`course:side`/`style:sweet`. All other tags (ingredient:*, style:thai, …) stay hidden from the filter UI (still feed the recommender).
- Reuse the existing tag constants `SIDE_DISH_FEATURE_TAG`/`DRINK_FEATURE_TAG` from `src/server/services/mealFeatures.ts:18-19` — move/re-export the string constants so the shared helper doesn't import server code (mealFeatures imports prisma).
- `// ponytail:` comment naming the meal-by-absence heuristic and the AI-category upgrade path.

### 3. Filter + prune UI (client)
In `OrderForm` (src/client/components/FoodSelectionActiveView.tsx):
- Compute category chips present in `menuItems` via the shared helper; render a chip row above the existing search `Input` (line ~229). Chips = existing `Button` primitive (`src/client/components/ui/Button.tsx`), toggled state via `aria-pressed` + accent styling per the semantic-token theme architecture.
- State: `activeCategories: Set<string>` (multi-select OR within tags), `hiddenItemIds: Set<string>`.
- Extend the `filteredMenuItems` memo (line 131) to AND: text search ∧ (no active chips ∨ item in any active category) ∧ not hidden.
- Per-item dismiss (×) button on each item card adds to `hiddenItemIds`; a small "Show N hidden" reset link appears when non-empty. Ephemeral — resets on remount/phase change.
- Show the item's category labels as tiny badges on the card (reuses the mark-pill styling already in the card).

## Files touched
- `src/lib/types.ts` — `MenuItem.tags`
- `src/lib/menuItemTags.ts` — new shared category mapping (+ tag constants moved here)
- `src/server/services/menu.ts` — formatter + includes
- `src/server/services/mealFeatures.ts` — re-export constants from shared module
- `src/client/components/FoodSelectionActiveView.tsx` — chips, hide, filter memo
- Tests: `tests/lib/menuItemTags.test.ts` (new), `tests/client/FoodSelectionActiveView.test.tsx` (extend), server menus-route test (assert `tags` in response)

## Verification
1. `pnpm typecheck && pnpm lint`
2. Unit: `menuItemTags.test.ts` — mapping table + meal-by-absence edges (drink-only item, sweet+vegan item, untagged item ⇒ Meal).
3. Component: chip toggling narrows the list; × hides a card and "Show hidden" restores; text search composes with chips.
4. Server test: `GET /api/menus` items include `tags`; SSE item payloads include `tags`.
5. Manual: import a menu, run poll → food selection, verify chips/badges/hide during selection.
6. FAIM: `pnpm faim:deps` to refresh the dependency graph, then `faim validate` (auth invariant untouched — no new endpoints, no mutation changes).
