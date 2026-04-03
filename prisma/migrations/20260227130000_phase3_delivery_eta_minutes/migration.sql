ALTER TABLE "food_selections"
  DROP COLUMN IF EXISTS "eta_hhmm",
  ADD COLUMN "eta_minutes" INTEGER,
  ADD COLUMN "eta_set_at" TIMESTAMPTZ,
  ADD COLUMN "delivery_due_at" TIMESTAMPTZ;
