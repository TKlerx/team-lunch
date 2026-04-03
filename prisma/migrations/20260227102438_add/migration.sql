-- AlterTable
ALTER TABLE "food_selections" ADD COLUMN     "completed_at" TIMESTAMPTZ,
ADD COLUMN     "eta_hhmm" VARCHAR(5);
