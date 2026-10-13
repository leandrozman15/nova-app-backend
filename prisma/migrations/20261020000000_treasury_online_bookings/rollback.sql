-- Quita solo lo cargado por la migración (los movimientos nuevos quedan).
DELETE FROM "FinancialTransaction" WHERE "id" LIKE 'bkfill\_%';
DROP INDEX IF EXISTS "FinancialTransaction_mp_reference_key";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261020000000_treasury_online_bookings';
