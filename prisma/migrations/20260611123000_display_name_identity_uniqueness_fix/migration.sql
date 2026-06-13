ALTER TABLE "poll_votes"
DROP CONSTRAINT IF EXISTS "poll_votes_poll_id_menu_id_nickname_key";

DROP INDEX IF EXISTS "poll_votes_poll_id_menu_id_nickname_key";

UPDATE "poll_votes"
SET "actor_key" = LOWER("actor_key")
WHERE "actor_key" IS NOT NULL AND "actor_key" <> LOWER("actor_key");

UPDATE "food_orders"
SET "actor_key" = LOWER("actor_key")
WHERE "actor_key" IS NOT NULL AND "actor_key" <> LOWER("actor_key");
