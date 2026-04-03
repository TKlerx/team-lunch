CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_key" VARCHAR(255) NOT NULL UNIQUE,
  "allergies_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dislikes_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
