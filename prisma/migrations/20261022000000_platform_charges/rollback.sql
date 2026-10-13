DELETE FROM "FinancialTransaction" WHERE "reference" LIKE 'fx:%';
DROP TABLE IF EXISTS "PlatformCharge";
DROP TYPE IF EXISTS "PlatformChargeStatus";
DROP TABLE IF EXISTS "PlatformSettings";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022000000_platform_charges';
