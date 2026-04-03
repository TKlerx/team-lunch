-- DropIndex
DROP INDEX "auth_access_users_approved_requested_at_idx";

-- AlterTable
ALTER TABLE "auth_access_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "local_auth_users" ALTER COLUMN "updated_at" DROP DEFAULT;
