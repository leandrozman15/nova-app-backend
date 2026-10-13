-- Las configuraciones de disciplinas (y sus consultas) se borran: sin la columna no tienen sentido.
DELETE FROM "ClubActivity" WHERE "disciplineId" IS NOT NULL;
DROP INDEX IF EXISTS "ClubActivity_clubId_disciplineId_key";
ALTER TABLE "ClubActivity" DROP COLUMN IF EXISTS "disciplineId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019000000_activity_disciplines';
