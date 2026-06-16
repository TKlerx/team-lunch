CREATE TABLE "meal_recommendation_impressions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "food_selection_id" UUID NOT NULL,
  "office_location_id" UUID NOT NULL,
  "actor_key" VARCHAR(255) NOT NULL,
  "actor_email" VARCHAR(255),
  "display_name_snapshot" VARCHAR(255),
  "source" VARCHAR(30) NOT NULL,
  "provider" VARCHAR(60),
  "recommended_at" TIMESTAMPTZ NOT NULL,
  "input_summary_json" JSONB NOT NULL,
  "items_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "meal_recommendation_impressions_food_selection_id_fkey"
    FOREIGN KEY ("food_selection_id") REFERENCES "food_selections" ("id") ON DELETE CASCADE,
  CONSTRAINT "meal_recommendation_impressions_office_location_id_fkey"
    FOREIGN KEY ("office_location_id") REFERENCES "office_locations" ("id") ON DELETE CASCADE
);

CREATE INDEX "meal_recommendation_impressions_food_selection_id_actor_key_idx"
ON "meal_recommendation_impressions" ("food_selection_id", "actor_key");

CREATE INDEX "meal_recommendation_impressions_office_location_id_actor_key_re_idx"
ON "meal_recommendation_impressions" ("office_location_id", "actor_key", "recommended_at");
