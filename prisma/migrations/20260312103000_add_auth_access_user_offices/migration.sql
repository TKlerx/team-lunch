CREATE TABLE "auth_access_user_offices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_access_user_id" UUID NOT NULL,
    "office_location_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_access_user_offices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_access_user_offices_auth_access_user_id_office_location_id_key"
ON "auth_access_user_offices"("auth_access_user_id", "office_location_id");

CREATE INDEX "auth_access_user_offices_office_location_id_idx"
ON "auth_access_user_offices"("office_location_id");

ALTER TABLE "auth_access_user_offices"
ADD CONSTRAINT "auth_access_user_offices_auth_access_user_id_fkey"
FOREIGN KEY ("auth_access_user_id") REFERENCES "auth_access_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_access_user_offices"
ADD CONSTRAINT "auth_access_user_offices_office_location_id_fkey"
FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "auth_access_user_offices" ("auth_access_user_id", "office_location_id")
SELECT "id", "office_location_id"
FROM "auth_access_users"
WHERE "office_location_id" IS NOT NULL
ON CONFLICT ("auth_access_user_id", "office_location_id") DO NOTHING;
