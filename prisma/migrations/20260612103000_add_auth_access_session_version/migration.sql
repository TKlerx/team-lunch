ALTER TABLE "auth_access_users"
ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
