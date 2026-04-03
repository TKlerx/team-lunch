-- Allow multiple selected items per nickname within a food selection.
-- Replace one-per-nickname uniqueness with one-per-nickname-per-item uniqueness.
ALTER TABLE "food_orders"
DROP CONSTRAINT IF EXISTS "food_orders_selection_id_nickname_key";

DROP INDEX IF EXISTS "food_orders_selection_id_nickname_key";

CREATE UNIQUE INDEX IF NOT EXISTS "food_orders_selection_id_nickname_item_id_key"
ON "food_orders"("selection_id", "nickname", "item_id");
