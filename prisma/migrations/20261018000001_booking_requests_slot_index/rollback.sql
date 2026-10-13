-- Las solicitudes abiertas se cancelan para no chocar con el índice anterior.
UPDATE "Booking" SET "status" = 'CANCELLED_BY_CLUB', "cancelReason" = 'Reservas sin seña desactivadas', "cancelledAt" = now()
  WHERE "status" = 'REQUESTED';
DROP INDEX IF EXISTS "Booking_active_slot_key";
CREATE UNIQUE INDEX "Booking_active_slot_key" ON "Booking"("facilityId", "date", "hour")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018000001_booking_requests_slot_index';
