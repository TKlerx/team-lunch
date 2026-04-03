-- Allow line-item ordering semantics (duplicate item selections per nickname).
-- Remove the uniqueness key introduced for nickname+item in a selection.
ALTER TABLE "food_orders"
DROP CONSTRAINT IF EXISTS "food_orders_selection_id_nickname_item_id_key";

DROP INDEX IF EXISTS "food_orders_selection_id_nickname_item_id_key";
