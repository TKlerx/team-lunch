-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "additives" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[],
ADD COLUMN     "allergens" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[];
