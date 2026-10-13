DROP INDEX IF EXISTS "Facility_sport_idx";
ALTER TABLE "Facility" DROP COLUMN IF EXISTS "sport";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261017000000_facility_sport';
