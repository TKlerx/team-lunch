-- Allow the same tag text to exist as user-facing menu data and internal recommender metadata.
ALTER TABLE "menu_item_features" DROP CONSTRAINT IF EXISTS "menu_item_features_menu_item_id_tag_key";
DROP INDEX IF EXISTS "menu_item_features_menu_item_id_tag_key";

ALTER TABLE "menu_item_features"
  ADD CONSTRAINT "menu_item_features_menu_item_id_provenance_tag_key"
  UNIQUE ("menu_item_id", "provenance", "tag");
