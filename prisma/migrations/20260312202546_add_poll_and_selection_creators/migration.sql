-- AlterTable
ALTER TABLE "food_selections" ADD COLUMN     "created_by" VARCHAR(255);

-- AlterTable
ALTER TABLE "polls" ADD COLUMN     "created_by" VARCHAR(255);

-- RenameIndex
ALTER INDEX "auth_access_user_offices_auth_access_user_id_office_location_id" RENAME TO "auth_access_user_offices_auth_access_user_id_office_locatio_key";
