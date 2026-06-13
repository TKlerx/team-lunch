CREATE TABLE "auth_audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event" VARCHAR(80) NOT NULL,
  "actor_email" VARCHAR(255),
  "target_email" VARCHAR(255),
  "target_type" VARCHAR(40) NOT NULL DEFAULT 'auth_user',
  "field" VARCHAR(80),
  "old_value" TEXT,
  "new_value" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "auth_audit_logs_target_email_idx"
ON "auth_audit_logs" ("target_email", "created_at");

CREATE INDEX "auth_audit_logs_event_idx"
ON "auth_audit_logs" ("event", "created_at");
