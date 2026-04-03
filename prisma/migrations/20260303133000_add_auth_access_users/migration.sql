CREATE TABLE "auth_access_users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "approved" BOOLEAN NOT NULL DEFAULT FALSE,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "approved_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "auth_access_users_email_key" ON "auth_access_users"("email");
CREATE INDEX "auth_access_users_approved_requested_at_idx" ON "auth_access_users"("approved", "requested_at");
