ALTER TABLE "User" DROP COLUMN IF EXISTS "sports";
ALTER TABLE "User" DROP COLUMN IF EXISTS "city";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phone";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016000000_user_profile';
