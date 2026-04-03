ALTER TABLE "polls"
ADD COLUMN "office_location_id" UUID;

ALTER TABLE "food_selections"
ADD COLUMN "office_location_id" UUID;

UPDATE "polls" AS p
SET "office_location_id" = COALESCE(
  (
    SELECT m."office_location_id"
    FROM "menus" AS m
    WHERE m."id" = p."winner_menu_id"
  ),
  (
    SELECT ol."id"
    FROM "office_locations" AS ol
    WHERE ol."key" = 'default'
    LIMIT 1
  )
)
WHERE p."office_location_id" IS NULL;

UPDATE "food_selections" AS fs
SET "office_location_id" = COALESCE(
  (
    SELECT p."office_location_id"
    FROM "polls" AS p
    WHERE p."id" = fs."poll_id"
  ),
  (
    SELECT m."office_location_id"
    FROM "menus" AS m
    WHERE m."id" = fs."menu_id"
  ),
  (
    SELECT ol."id"
    FROM "office_locations" AS ol
    WHERE ol."key" = 'default'
    LIMIT 1
  )
)
WHERE fs."office_location_id" IS NULL;

ALTER TABLE "polls"
ALTER COLUMN "office_location_id" SET NOT NULL;

ALTER TABLE "food_selections"
ALTER COLUMN "office_location_id" SET NOT NULL;

ALTER TABLE "polls"
ADD CONSTRAINT "polls_office_location_id_fkey"
FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_selections"
ADD CONSTRAINT "food_selections_office_location_id_fkey"
FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "polls_office_location_id_status_idx"
ON "polls"("office_location_id", "status");

CREATE INDEX "food_selections_office_location_id_status_created_at_idx"
ON "food_selections"("office_location_id", "status", "created_at");
