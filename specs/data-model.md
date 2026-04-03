# Spec: Data Model & Persistence

## Topic
PostgreSQL schema for menus, polling, food selection lifecycle, and order tracking.

## Key tables

### office_locations
- `id` UUID PK
- `key` VARCHAR(40) unique
- `name` VARCHAR(80) unique
- `is_active` BOOLEAN
- `created_at` TIMESTAMPTZ default now
- `updated_at` TIMESTAMPTZ

### menus
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations
- `name` VARCHAR(60)
- `location` VARCHAR(160) nullable
- `phone` VARCHAR(40) nullable
- `url` VARCHAR(255) nullable
- `source_date_created` TIMESTAMPTZ nullable
- `created_at` TIMESTAMPTZ default now
- unique (`office_location_id`, `name`)

### menu_items
- `id` UUID PK
- `menu_id` UUID FK -> menus
- `item_number` VARCHAR(40) nullable
- `name` VARCHAR(80)
- `description` VARCHAR(200) nullable
- `price` NUMERIC(8,2) nullable
- `created_at` TIMESTAMPTZ default now
- unique (`menu_id`, `name`)

### polls
- `office_location_id` UUID FK -> office_locations
- `status`: `active | tied | finished | aborted`
- winner snapshot fields kept (`winner_menu_id`, `winner_menu_name`)
- support index (`office_location_id`, `status`)

### food_selections
- `office_location_id` UUID FK -> office_locations
- `status`: `active | overtime | ordering | delivering | delivery_due | completed | aborted`
- `started_at`, `ends_at`
- `order_placed_at` TIMESTAMPTZ nullable
- `eta_minutes` INT nullable
- `eta_set_at` TIMESTAMPTZ nullable
- `delivery_due_at` TIMESTAMPTZ nullable
- `completed_at` TIMESTAMPTZ nullable (actual delivery confirmation timestamp)
- `menu_name` snapshot
- support index (`office_location_id`, `status`, `created_at`)

### food_orders
- line-item model (`id` per line)
- `selection_id` FK -> food_selections
- `nickname`
- `item_id` FK -> menu_items nullable
- `item_name` snapshot
- `notes` VARCHAR(200) nullable
- `feedback_comment` VARCHAR(300) nullable
- `ordered_at` TIMESTAMPTZ

### user_menu_default_preferences
- per-user, per-menu default meal selection
- `user_key` VARCHAR(255)
- `menu_id` UUID FK -> menus
- `item_id` UUID FK -> menu_items
- `default_comment` VARCHAR(200) nullable
- `allow_organizer_fallback` BOOLEAN
- unique (`user_key`, `menu_id`)

### shopping_list_items
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations
- `name` VARCHAR(120)
- `requested_by` VARCHAR(255)
- `bought` BOOLEAN
- `bought_by` VARCHAR(255) nullable
- `bought_at` TIMESTAMPTZ nullable
- `created_at` TIMESTAMPTZ default now

## Lifecycle timestamps

- Real order placement: `order_placed_at`
- Announced arrival target: `delivery_due_at`
- Actual confirmed arrival: `completed_at`

These fields allow early/late comparison (`completed_at` vs `delivery_due_at`).

## Retention

- keep all completed polls (no automatic poll purge)
- keep all completed food selections (no automatic food-selection purge)

## Notes

- Snapshot fields (`menu_name`, `item_name`, winner names) preserve history if source rows change/deleted.
- Default-meal preferences are user preferences, not order history; they are deleted if the referenced menu or menu item is deleted.
- `auth_access_users.office_location_id` assigns regular users to a single office in the phase-1 multi-office model; configured/global admins may remain unassigned.
- Menus, shopping-list items, polls, and food selections are office-scoped as of phases 74.3 and 74.4.
