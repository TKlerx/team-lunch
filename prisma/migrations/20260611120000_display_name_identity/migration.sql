ALTER TABLE "auth_access_users"
ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "display_name_source" VARCHAR(20);

ALTER TABLE "poll_votes"
ALTER COLUMN "nickname" TYPE VARCHAR(255),
ADD COLUMN IF NOT EXISTS "actor_key" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "actor_email" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "display_name_snapshot" VARCHAR(255);

UPDATE "poll_votes"
SET
  "actor_key" = COALESCE(LOWER("actor_key"), LOWER("nickname")),
  "display_name_snapshot" = COALESCE("display_name_snapshot", "nickname")
WHERE "actor_key" IS NULL OR "display_name_snapshot" IS NULL;

ALTER TABLE "poll_votes"
DROP CONSTRAINT IF EXISTS "poll_votes_poll_id_menu_id_nickname_key";

DROP INDEX IF EXISTS "poll_votes_poll_id_menu_id_nickname_key";

CREATE UNIQUE INDEX IF NOT EXISTS "poll_votes_poll_id_menu_id_actor_key_key"
ON "poll_votes"("poll_id", "menu_id", "actor_key");

ALTER TABLE "food_orders"
ALTER COLUMN "nickname" TYPE VARCHAR(255),
ADD COLUMN IF NOT EXISTS "actor_key" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "actor_email" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "display_name_snapshot" VARCHAR(255);

UPDATE "food_orders"
SET
  "actor_key" = COALESCE(LOWER("actor_key"), LOWER("nickname")),
  "display_name_snapshot" = COALESCE("display_name_snapshot", "nickname")
WHERE "actor_key" IS NULL OR "display_name_snapshot" IS NULL;
