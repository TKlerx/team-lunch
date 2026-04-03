-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "user_menu_default_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_key" VARCHAR(255) NOT NULL,
    "menu_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "allow_organizer_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_menu_default_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_menu_default_preferences_user_key_menu_id_key" ON "user_menu_default_preferences"("user_key", "menu_id");

-- AddForeignKey
ALTER TABLE "user_menu_default_preferences" ADD CONSTRAINT "user_menu_default_preferences_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_menu_default_preferences" ADD CONSTRAINT "user_menu_default_preferences_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
