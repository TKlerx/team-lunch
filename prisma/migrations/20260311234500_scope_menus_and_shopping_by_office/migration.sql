ALTER TABLE "menus" ADD COLUMN "office_location_id" UUID;
ALTER TABLE "shopping_list_items" ADD COLUMN "office_location_id" UUID;

UPDATE "menus"
SET "office_location_id" = (
  SELECT "id" FROM "office_locations" WHERE "key" = 'default'
)
WHERE "office_location_id" IS NULL;

UPDATE "shopping_list_items"
SET "office_location_id" = (
  SELECT "id" FROM "office_locations" WHERE "key" = 'default'
)
WHERE "office_location_id" IS NULL;

ALTER TABLE "menus" ALTER COLUMN "office_location_id" SET NOT NULL;
ALTER TABLE "shopping_list_items" ALTER COLUMN "office_location_id" SET NOT NULL;

ALTER TABLE "menus"
  ADD CONSTRAINT "menus_office_location_id_fkey"
  FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopping_list_items"
  ADD CONSTRAINT "shopping_list_items_office_location_id_fkey"
  FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "menus_name_key";
CREATE UNIQUE INDEX "menus_office_location_id_name_key" ON "menus"("office_location_id", "name");
CREATE INDEX "shopping_list_items_office_location_id_bought_created_at_idx"
  ON "shopping_list_items"("office_location_id", "bought", "created_at");
