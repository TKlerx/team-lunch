CREATE TABLE "poll_excluded_menus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "menu_name" VARCHAR(60) NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_excluded_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "poll_excluded_menus_poll_id_menu_id_key"
ON "poll_excluded_menus"("poll_id", "menu_id");

ALTER TABLE "poll_excluded_menus"
ADD CONSTRAINT "poll_excluded_menus_poll_id_fkey"
FOREIGN KEY ("poll_id") REFERENCES "polls"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "poll_excluded_menus"
ADD CONSTRAINT "poll_excluded_menus_menu_id_fkey"
FOREIGN KEY ("menu_id") REFERENCES "menus"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
