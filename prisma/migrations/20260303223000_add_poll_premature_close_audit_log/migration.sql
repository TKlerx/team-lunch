CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event" VARCHAR(80) NOT NULL,
  "actor_email" VARCHAR(255) NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "audit_logs_target_idx" ON "audit_logs"("target_type", "target_id");
