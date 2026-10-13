-- Ejecutar DESPUÉS del rollback de 20261018000001_booking_requests_slot_index.
-- El valor 'REQUESTED' del enum queda (Postgres no permite quitarlo); sin uso es inofensivo.
DROP TABLE IF EXISTS "ActivityInquiry";
DROP TABLE IF EXISTS "ClubActivity";
DROP TYPE IF EXISTS "ActivityInquiryStatus";
ALTER TABLE "Club" DROP COLUMN IF EXISTS "amenities";
ALTER TABLE "Club" DROP COLUMN IF EXISTS "bookingMode";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018000000_booking_requests_activities';
