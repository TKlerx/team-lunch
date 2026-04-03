-- AlterTable
ALTER TABLE "auth_access_users" ADD COLUMN     "office_location_id" UUID;

-- CreateTable
CREATE TABLE "office_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "office_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_locations_key_key" ON "office_locations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "office_locations_name_key" ON "office_locations"("name");

-- Seed the legacy single-office deployment with one default office so existing
-- users can be backfilled safely before per-office scoping is introduced.
INSERT INTO "office_locations" ("key", "name", "updated_at")
VALUES ('default', 'Default Office', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

UPDATE "auth_access_users"
SET "office_location_id" = (
    SELECT "id" FROM "office_locations" WHERE "key" = 'default'
)
WHERE "office_location_id" IS NULL
  AND NOT "is_admin";

-- AddForeignKey
ALTER TABLE "auth_access_users" ADD CONSTRAINT "auth_access_users_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
