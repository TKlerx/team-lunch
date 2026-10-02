-- UTC initialization is editable; retain a dynamic default for direct creation callers.
ALTER TABLE "office_locations"
    ADD COLUMN "ordering_interval_weeks" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "time_zone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    ADD COLUMN "ordering_anchor_date" DATE NOT NULL DEFAULT (date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')))::date,
    ADD CONSTRAINT "office_locations_ordering_interval_weeks_check" CHECK ("ordering_interval_weeks" IN (0, 1, 2, 3, 4)),
    ADD CONSTRAINT "office_locations_ordering_anchor_monday_check" CHECK (EXTRACT(ISODOW FROM "ordering_anchor_date") = 1);

ALTER TABLE "polls" ADD COLUMN "ordering_policy_exception" JSONB;

CREATE INDEX "food_selections_office_location_id_status_completed_at_idx"
    ON "food_selections"("office_location_id", "status", "completed_at");
