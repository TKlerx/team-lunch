-- DropForeignKey
ALTER TABLE "meal_recommendation_impressions" DROP CONSTRAINT "meal_recommendation_impressions_food_selection_id_fkey";

-- DropForeignKey
ALTER TABLE "meal_recommendation_impressions" DROP CONSTRAINT "meal_recommendation_impressions_office_location_id_fkey";

-- AlterTable
ALTER TABLE "auth_audit_logs" ALTER COLUMN "metadata" DROP NOT NULL,
ALTER COLUMN "metadata" DROP DEFAULT;

-- AlterTable
ALTER TABLE "meal_recommendation_impressions" ADD COLUMN     "recommender_model_id" UUID,
ALTER COLUMN "source" SET DATA TYPE VARCHAR(40);

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "item_identity_key" VARCHAR(120);

-- CreateTable
CREATE TABLE "menu_item_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "office_location_id" UUID NOT NULL,
    "identity_key" VARCHAR(120) NOT NULL,
    "display_name_snapshot" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "item_identity_key" VARCHAR(120) NOT NULL,
    "office_location_id" UUID NOT NULL,
    "tag" VARCHAR(60) NOT NULL,
    "provenance" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommender_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "params_json" JSONB NOT NULL,
    "factor_dim" INTEGER NOT NULL,
    "trained_at" TIMESTAMPTZ NOT NULL,
    "training_sample_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommender_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_evaluation_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recommender_model_id" UUID NOT NULL,
    "office_location_id" UUID NOT NULL,
    "baseline_top3_hit_rate" DECIMAL(5,4) NOT NULL,
    "model_top3_hit_rate" DECIMAL(5,4) NOT NULL,
    "margin_points" DECIMAL(6,4) NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "evaluated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_evaluation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_recommender_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "office_location_id" UUID NOT NULL,
    "safe_mode" VARCHAR(10) NOT NULL DEFAULT 'baseline',
    "active_model_id" UUID,
    "explore_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "office_recommender_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_anticipated_likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_key" VARCHAR(255) NOT NULL,
    "actor_email" VARCHAR(255),
    "display_name_snapshot" VARCHAR(255),
    "office_location_id" UUID NOT NULL,
    "item_identity_key" VARCHAR(120) NOT NULL,
    "item_name_snapshot" VARCHAR(80) NOT NULL,
    "sentiment" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_anticipated_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_identities_office_location_id_identity_key_key" ON "menu_item_identities"("office_location_id", "identity_key");

-- CreateIndex
CREATE INDEX "menu_item_features_item_identity_key_office_location_id_idx" ON "menu_item_features"("item_identity_key", "office_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_features_menu_item_id_tag_key" ON "menu_item_features"("menu_item_id", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "recommender_models_version_key" ON "recommender_models"("version");

-- CreateIndex
CREATE INDEX "recommender_models_status_idx" ON "recommender_models"("status");

-- CreateIndex
CREATE INDEX "model_evaluation_results_office_location_id_recommender_mod_idx" ON "model_evaluation_results"("office_location_id", "recommender_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "office_recommender_settings_office_location_id_key" ON "office_recommender_settings"("office_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_anticipated_likes_actor_key_office_location_id_item_id_key" ON "user_anticipated_likes"("actor_key", "office_location_id", "item_identity_key");

-- AddForeignKey
ALTER TABLE "menu_item_identities" ADD CONSTRAINT "menu_item_identities_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_features" ADD CONSTRAINT "menu_item_features_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_features" ADD CONSTRAINT "menu_item_features_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_evaluation_results" ADD CONSTRAINT "model_evaluation_results_recommender_model_id_fkey" FOREIGN KEY ("recommender_model_id") REFERENCES "recommender_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_evaluation_results" ADD CONSTRAINT "model_evaluation_results_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_recommender_settings" ADD CONSTRAINT "office_recommender_settings_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_recommender_settings" ADD CONSTRAINT "office_recommender_settings_active_model_id_fkey" FOREIGN KEY ("active_model_id") REFERENCES "recommender_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_anticipated_likes" ADD CONSTRAINT "user_anticipated_likes_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_recommendation_impressions" ADD CONSTRAINT "meal_recommendation_impressions_food_selection_id_fkey" FOREIGN KEY ("food_selection_id") REFERENCES "food_selections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_recommendation_impressions" ADD CONSTRAINT "meal_recommendation_impressions_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_recommendation_impressions" ADD CONSTRAINT "meal_recommendation_impressions_recommender_model_id_fkey" FOREIGN KEY ("recommender_model_id") REFERENCES "recommender_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "meal_recommendation_impressions_office_location_id_actor_key_re" RENAME TO "meal_recommendation_impressions_office_location_id_actor_ke_idx";
