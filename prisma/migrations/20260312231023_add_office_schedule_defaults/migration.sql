-- AlterTable
ALTER TABLE "office_locations" ADD COLUMN     "auto_start_poll_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_start_poll_finish_time" VARCHAR(5),
ADD COLUMN     "auto_start_poll_weekdays" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "default_food_selection_duration_minutes" INTEGER NOT NULL DEFAULT 30;
