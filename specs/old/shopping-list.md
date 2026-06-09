# Spec: Shared Shopping List

## Topic of Concern
The app should provide a lightweight shared shopping list for office supplies or snacks.

## Behavior

- Any user can add a shopping-list item.
- Any user can mark an open item as bought.
- Bought items stay visible in a completed section for traceability.
- The list should update live for connected users.

## Data Model

- `name`
- `requested_by`
- `bought`
- `bought_by`
- `bought_at`
- `created_at`
- `updated_at`

## API

- `GET /api/shopping-list`
- `POST /api/shopping-list`
- `POST /api/shopping-list/:id/bought`

## UI

- Header navigation entry for `Shopping List`
- Simple add-item form
- `To Buy` section
- `Bought all` action for pending items
- `Bought` section
- Bought items grouped by purchase date
- `Mark bought` button on open items

## Realtime

- `shopping_list_item_added`
- `shopping_list_item_updated`
