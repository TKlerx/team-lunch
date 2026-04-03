-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "price" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "location" VARCHAR(160),
ADD COLUMN     "phone" VARCHAR(40),
ADD COLUMN     "source_date_created" TIMESTAMPTZ;
