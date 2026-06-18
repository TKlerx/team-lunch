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
- `item_identity_key` stable identity key for re-import matching
- `item_number` VARCHAR(40) nullable
- `name` VARCHAR(80)
- `description` VARCHAR(200) nullable
- `price` NUMERIC(8,2) nullable
- `created_at` TIMESTAMPTZ default now
- unique (`menu_id`, `name`)

### menu_item_identities
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations
- `identity_key` VARCHAR(120)
- `display_name_snapshot` VARCHAR(80)
- unique (`office_location_id`, `identity_key`)

### menu_item_features
- `id` UUID PK
- `menu_item_id` UUID FK -> menu_items
- `item_identity_key` VARCHAR(120)
- `office_location_id` UUID FK -> office_locations
- `tag` VARCHAR(60)
- `provenance` VARCHAR(10)
- unique (`menu_item_id`, `tag`)
- index (`item_identity_key`, `office_location_id`)

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
- `nickname` legacy display snapshot/backfill field
- `actor_key` stable signed-session actor key nullable for historical rows
- `actor_email` signed-session email nullable for historical rows
- `display_name_snapshot` immutable display label shown in lunch history
- `item_id` FK -> menu_items nullable
- `item_name` snapshot
- `notes` VARCHAR(200) nullable
- `feedback_comment` VARCHAR(300) nullable
- `ordered_at` TIMESTAMPTZ

### user_anticipated_likes
- `id` UUID PK
- `actor_key` VARCHAR(255)
- `actor_email` VARCHAR(255) nullable
- `display_name_snapshot` VARCHAR(255) nullable
- `office_location_id` UUID FK -> office_locations
- `item_identity_key` VARCHAR(120)
- `item_name_snapshot` VARCHAR(80)
- `sentiment` VARCHAR(10)
- unique (`actor_key`, `office_location_id`, `item_identity_key`)

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

### auth_access_users
- `email` VARCHAR(255) unique
- `display_name` VARCHAR(255) nullable
- `display_name_source` VARCHAR(20) nullable (`local`, `entra`)
- `session_version` INT default 0; increments for sensitive access/identity changes and is embedded in signed auth cookies
- approval/admin/blocking flags and office assignment fields

### meal_recommendation_impressions
- `id` UUID PK
- `food_selection_id` UUID FK -> food_selections (cascade delete)
- `poll_id` UUID FK -> polls (set null)
- `office_location_id` UUID FK -> office_locations (cascade delete)
- `actor_key` VARCHAR(255), `actor_email` VARCHAR(255) nullable, `display_name_snapshot` VARCHAR(255) nullable
- `source` VARCHAR(40): `deterministic | ai_assisted | deterministic_fallback | pre_vote`
- `provider` VARCHAR(60) nullable (AI provider name when `source = ai_assisted`)
- `recommender_model_id` UUID FK -> recommender_models nullable
- `recommended_at` TIMESTAMPTZ
- `input_summary_json` JSON: privacy-safe aggregate counts (history/rating/preference/popularity counts), no raw history
- `items_json` JSON: snapshot of the displayed ranked items (item id/name, rank, score, reason, source signals, AI-assisted flag)
- `created_at` TIMESTAMPTZ default now
- index (`food_selection_id`, `actor_key`); index (`office_location_id`, `actor_key`, `recommended_at`)

### recommender_models
- `id` UUID PK
- `version` INT unique
- `status` VARCHAR(12)
- `params_json` JSON
- `factor_dim` INT
- `trained_at` TIMESTAMPTZ
- `training_sample_count` INT

### model_evaluation_results
- `id` UUID PK
- `recommender_model_id` UUID FK -> recommender_models
- `office_location_id` UUID FK -> office_locations
- `baseline_top3_hit_rate` DECIMAL(5,4)
- `model_top3_hit_rate` DECIMAL(5,4)
- `margin_points` DECIMAL(6,4)
- `sample_count` INT
- `evaluated_at` TIMESTAMPTZ

### office_recommender_settings
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations
- `safe_mode` VARCHAR(10) default `baseline`
- `active_model_id` UUID FK -> recommender_models nullable
- `explore_enabled` BOOLEAN default true
- `updated_at` TIMESTAMPTZ

### auth_audit_logs
- `event` VARCHAR(80)
- `actor_email` VARCHAR(255) nullable
- `target_email` VARCHAR(255) nullable
- `target_type` VARCHAR(40) default `auth_user`
- `field` VARCHAR(80) nullable
- `old_value` / `new_value` text snapshots nullable
- `metadata` JSON nullable
- `created_at` timestamp default now

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
- User-attributed poll votes and food orders use `actor_key` / `actor_email` for ownership and store `display_name_snapshot` for presentation; display names are optional and non-unique.
- Default-meal preferences are user preferences, not order history; they are deleted if the referenced menu or menu item is deleted.
- `auth_access_users.office_location_id` assigns regular users to a single office in the phase-1 multi-office model; configured/global admins may remain unassigned.
- `auth_access_users.session_version` is the authoritative invalidation source for both local and Entra sessions; display-name edits do not increment it.
- `auth_audit_logs` is DB-only history for profile/access/login events; it intentionally has no UI in Priority 88.10.
- Entra/Graph avatars are intentionally not part of the persistent data model.
  Avatar image bytes and fallback states live only in bounded backend memory with
  TTLs, so multi-container instances cache independently and restart refetches.
- Menus, shopping-list items, polls, and food selections are office-scoped as of phases 74.3 and 74.4.
- `meal_recommendation_impressions` persists the displayed "Recommend a meal" response (ranks, reasons, AI/deterministic source) per actor/office for audit and outcome-learning; there is no separate helpful/not-helpful feedback table - later `food_orders`/ratings for the same actor+office are the outcome signal.
