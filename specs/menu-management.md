# Spec: Menu Management

## Topic of Concern
The menu management system allows any user to create, edit, and delete food menus and their items. Menus and items are stored in PostgreSQL and survive app restarts.

## Concepts

| Term        | Definition                                                     |
|-------------|----------------------------------------------------------------|
| Menu        | A named food category (e.g. "Italian", "Indian", "Asian")      |
| Menu Item   | A named dish belonging to a menu (e.g. "Margherita Pizza")     |

## Requirements

### Menu Operations

**Create**
- Any user can create a new menu by providing a menu name.
- Menu name: 1–60 characters, trimmed, must be unique (case-insensitive).
- On success the menu is immediately visible in the menu list.

**Edit**
- Any user can rename an existing menu.
- Same validation as create applies.
- If the name is already taken by a different menu, the rename is rejected with a clear error.

**Delete**
- Any user can delete a menu.
- Deleting a menu also deletes all its items (cascade).
- If the menu has been used as the winner of a past poll, its name is preserved in the poll record as a plain string so historical data is not broken.
- A confirmation prompt must be shown before deletion ("Delete menu 'Italian' and all its items?").

### Menu Item Operations

**Create**
- Any user can add an item to a menu by providing an item name.
- Item name: 1–80 characters, trimmed, must be unique within its parent menu (case-insensitive).
- Optional item number field: 0–40 characters, trimmed.
- Optional description field: 0–200 characters.
- Optional price field: nullable, finite number, range `0..9999.99`, max 2 decimal places.

**Edit**
- Any user can rename an item or update its item number, description, and price.
- Same validation as create applies within the parent menu.

**Delete**
- Any user can delete a menu item.
- A confirmation prompt is shown before deletion.
- If the item is referenced in an existing food order, its name is stored as a plain string in the order so historical data is not broken.

### Empty State
- When no menus exist (or all menus have zero items), the main app view shows a prominent empty-state UI.
- The empty state invites the user to create the first menu with a clearly labelled CTA button.
- The empty state message: "No menus yet. Create one to get started."

### Listing
- Menus are listed alphabetically.
- Each menu shows its item count.
- Items within a menu are listed in creation order.
- Item rows show item number and price when available.
- Menus and their items are accessible from a dedicated "Manage Menus" section reachable from the main navigation.

### Per-User Default Meals
- The Manage Menus screen also lets the current user configure a default meal per menu.
- A default meal is selected from the existing items of that menu.
- Users can also store an optional default comment per menu; it is reused as the saved order note if an organizer places that default meal for them.
- Per menu, the user can also opt in to: "Allow organizers to order this default meal for me if I do not respond in time."
- Clearing the default removes that menu-specific preference.
- Default-meal preferences are user-specific and do not change the shared menu data for other users.

### Persistence
- All menus and menu items are persisted in PostgreSQL.
- Changes are immediately reflected across all connected clients (via SSE broadcast — see `realtime-events.md`).

### JSON Import

**Goal**
- A user can import a menu from a JSON file on the Manage Menus page.
- Import is all-or-nothing (atomic). No partial writes are allowed.

**Accepted Import Shape (v1)**
- Root object with a `menu` array.
- First array element is menu metadata containing:
	- `name` (required)
	- `location` (required)
	- `phone` (required)
	- `date-created` (required, ISO datetime)
- Remaining array elements represent category blocks and contain:
	- `category` (optional / ignored by domain)
	- `items` (required array)
- Each item must contain:
	- `name` (required)
	- `ingredients` (mapped to app item `description`)
	- `price` (required, numeric, persisted)
	- `item-number` (optional, persisted when present)

**Validation & Error Reporting**
- Server validates the full payload before writing.
- If any violation exists, request is rejected and nothing is persisted.
- Error response is `400` with:
	- `error: string`
	- `violations: Array<{ path: string; message: string }>`
- Violation paths must identify exact JSON location (example: `menu[2].items[4].name`).

**Price Validation Rules (import v1)**
- `price` is required for each imported item.
- `price` must be a finite number.
- `price` must be `>= 0`.
- `price` supports at most 2 fractional digits.
- Accepted range: `0` to `9999.99`.
- `item-number` (if provided) must be a string with max length 40.
- Values outside these rules are reported as schema violations (no partial import).

**Import Semantics**
- Menu matching is case-insensitive by menu name.
- If no matching menu exists: create a new menu.
- If a matching menu exists: update that menu and replace all existing items with imported items.
- Category values are ignored for now (no category persistence in current domain model).

**Persistence Additions**
- Persist menu-level metadata from import:
	- `name`
	- `location`
	- `phone`
	- source creation timestamp from `date-created`
- Persist item-level metadata from import:
	- `price`
	- `item-number`

## Out of Scope
- Menu images or photos.
- Prices or nutritional info.
- Per-user menu visibility restrictions.
