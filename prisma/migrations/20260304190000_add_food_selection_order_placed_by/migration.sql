ALTER TABLE "food_selections"
ADD COLUMN IF NOT EXISTS "order_placed_by" VARCHAR(255);
