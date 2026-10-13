-- Va en una migración aparte: Postgres no deja usar un valor de enum nuevo
-- en la misma transacción que lo crea.
-- Las solicitudes sin seña también retienen el turno.
DROP INDEX IF EXISTS "Booking_active_slot_key";
CREATE UNIQUE INDEX "Booking_active_slot_key" ON "Booking"("facilityId", "date", "hour")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'REQUESTED');
