-- Allow recommendation impressions to exist without a food selection
ALTER TABLE "meal_recommendation_impressions"
ALTER COLUMN "food_selection_id" DROP NOT NULL;

-- Add optional poll scoping for pre-vote impressions
ALTER TABLE "meal_recommendation_impressions"
ADD COLUMN "poll_id" UUID;

CREATE INDEX "meal_recommendation_impressions_poll_id_actor_key_idx"
ON "meal_recommendation_impressions" ("poll_id", "actor_key");

ALTER TABLE "meal_recommendation_impressions"
ADD CONSTRAINT "meal_recommendation_impressions_poll_id_fkey"
FOREIGN KEY ("poll_id") REFERENCES "polls" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
