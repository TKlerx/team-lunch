# Phase 1 Data Model: Learned Meal Recommender

New/changed persisted models. Both `prisma/schema.prisma` (Postgres) and
`prisma/schema.sqlite.prisma` (SQLite) change together. Name-snapshot columns
accompany FKs per the constitution so history survives source-row deletion. All
new models are added to `tests/server/helpers/db.ts` cleanup.

## New models

### menu_item_features
Persisted flavor tags per menu item (computed at import).
- `id` UUID PK
- `menu_item_id` UUID FK -> menu_items (cascade delete)
- `item_identity_key` VARCHAR(120) — normalized per-office identity (denormalized for joins)
- `office_location_id` UUID FK -> office_locations (cascade delete)
- `tag` VARCHAR(60) — e.g. `ingredient:chicken`, `style:thai`
- `provenance` VARCHAR(10): `keyword | ai`
- `created_at` TIMESTAMPTZ default now
- unique (`menu_item_id`, `tag`); index (`item_identity_key`, `office_location_id`)

### menu_item_identities
Stable per-office dish identity so signal survives re-import/rename.
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations (cascade delete)
- `identity_key` VARCHAR(120) — normalized name (lowercased, trimmed, punctuation-collapsed)
- `display_name_snapshot` VARCHAR(80) — most recent human-readable name
- `created_at` TIMESTAMPTZ default now
- unique (`office_location_id`, `identity_key`)
- Note: menu_items gain `item_identity_key` VARCHAR(120) (nullable, backfilled at import).

### user_anticipated_likes
Always-available pre-taste "I'd like / dislike this" marks.
- `id` UUID PK
- `actor_key` VARCHAR(255), `actor_email` VARCHAR(255) nullable, `display_name_snapshot` VARCHAR(255) nullable
- `office_location_id` UUID FK -> office_locations (cascade delete)
- `item_identity_key` VARCHAR(120) — joins to identity; survives item record changes
- `item_name_snapshot` VARCHAR(80)
- `sentiment` VARCHAR(10): `like | dislike`
- `created_at` TIMESTAMPTZ default now; `updated_at` TIMESTAMPTZ
- unique (`actor_key`, `office_location_id`, `item_identity_key`)
- Superseded at scoring time by a real rating of the same identity (no column needed — resolved in service).

### recommender_models
Versioned trained model parameters (shared across offices).
- `id` UUID PK
- `version` INT — monotonically increasing
- `status` VARCHAR(12): `trained | active | retired`
- `params_json` JSON — serialized FM parameters (w0, linear weights, factor vectors) + feature index map
- `factor_dim` INT — k
- `trained_at` TIMESTAMPTZ; `training_sample_count` INT
- `created_at` TIMESTAMPTZ default now
- index (`status`); at most one logical `active` model served (selection is per-office via setting below)

### model_evaluation_results
Per-office offline comparison gating rollout.
- `id` UUID PK
- `recommender_model_id` UUID FK -> recommender_models (cascade delete)
- `office_location_id` UUID FK -> office_locations (cascade delete)
- `baseline_top3_hit_rate` DECIMAL(5,4)
- `model_top3_hit_rate` DECIMAL(5,4)
- `margin_points` DECIMAL(6,4) — model minus baseline, in percentage points
- `sample_count` INT
- `evaluated_at` TIMESTAMPTZ default now
- index (`office_location_id`, `recommender_model_id`)

### office_recommender_settings
Per-office mode + which model serves the safe path.
- `id` UUID PK
- `office_location_id` UUID FK -> office_locations (cascade delete) unique
- `safe_mode` VARCHAR(10): `baseline | learned` (default `baseline`)
- `active_model_id` UUID FK -> recommender_models nullable (set only when enabled)
- `explore_enabled` BOOLEAN default true
- `updated_at` TIMESTAMPTZ
- Invariant: `safe_mode = learned` requires an `active_model_id` whose evaluation for this office meets the ≥5pt gate (enforced in service).

## Changed models

### meal_recommendation_impressions (from feature 002)
- `source` widened to: `deterministic | ai_assisted | deterministic_fallback | safe_learned | explore`
  (keep existing values; add `safe_learned`, `explore`).
- add `recommender_model_id` UUID FK -> recommender_models nullable (which model produced a learned/explore impression).

### menu_items (from feature 002)
- add `item_identity_key` VARCHAR(120) nullable — set at import; backfilled.

## Key relationships / lifecycle

- Import → ensure `menu_item_identities` row (office+normalized name) → set
  `menu_items.item_identity_key` → produce `menu_item_features` (keyword, then AI
  gap-fill if configured).
- Train → read orders/ratings/impressions/marks (joined by identity_key, office)
  → fit FM → write `recommender_models` row (`status=trained`).
- Evaluate → replay impressions per office → write `model_evaluation_results`.
- Enable → admin sets `office_recommender_settings.safe_mode=learned` +
  `active_model_id` (gate enforced). Disable → revert to `baseline`.
- Recommend (safe) → if office `safe_mode=learned` and model loads → FM score with
  recency/diversity → else baseline. Persist impression with source + model id.
- Explore → Thompson policy over per-user feature counts → labelled results →
  persist impression `source=explore`.
- Mark → upsert `user_anticipated_likes`; feeds next training + immediate
  cold-start seeding at scoring time.

## Notes

- No new SSE events (consistent with feature 002).
- Two genuinely different dishes sharing a normalized name within one office will
  share an identity (accepted heuristic limitation; see research Decision 5).
- A real rating supersedes an anticipated-like mark for the same identity —
  resolved when assembling training examples and cold-start seeds, not by deleting
  the mark.
- Allergies/dislikes reuse feature 002's `user_preference` (`allergies_json`,
  `dislikes_json` string arrays). Entries may be canonical ingredient tags (from
  the shared vocabulary, e.g. `peanut`) or free text; the constraint filter matches
  tags exactly and free text by substring. They are a deterministic hard/soft
  constraint applied after scoring — never FM features. No schema change required
  beyond optionally validating structured entries against the ingredient
  vocabulary at the service layer.
