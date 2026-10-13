-- Vuelve al esquema anterior. Los turnos de la consola (sin usuario) se borran.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_no_overlap";
DELETE FROM "Booking" WHERE "userId" IS NULL;
-- Turnos que no empiezan en hora en punto no entran en el índice anterior.
DELETE FROM "Booking" WHERE "startMinute" % 60 <> 0
  AND "status" IN ('REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED');
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_active_slot_key" ON "Booking"("facilityId", "date", "hour")
  WHERE "status" IN ('REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED');
DROP INDEX IF EXISTS "Booking_recurringId_date_key";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_recurringId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_time_check";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_attendance_check";
ALTER TABLE "Booking"
  DROP COLUMN IF EXISTS "startMinute",
  DROP COLUMN IF EXISTS "durationMinutes",
  DROP COLUMN IF EXISTS "endsAt",
  DROP COLUMN IF EXISTS "source",
  DROP COLUMN IF EXISTS "kind",
  DROP COLUMN IF EXISTS "recurringId",
  DROP COLUMN IF EXISTS "attendance",
  DROP COLUMN IF EXISTS "depositMethod",
  DROP COLUMN IF EXISTS "depositPaidAt",
  DROP COLUMN IF EXISTS "paidAmount",
  DROP COLUMN IF EXISTS "paymentMethod",
  DROP COLUMN IF EXISTS "notes",
  DROP COLUMN IF EXISTS "createdByUid";
ALTER TABLE "Booking" ALTER COLUMN "userId" SET NOT NULL;
DROP TABLE IF EXISTS "RecurringBooking";
ALTER TABLE "Facility" DROP COLUMN IF EXISTS "slotDurations";
ALTER TABLE "Club"
  DROP CONSTRAINT IF EXISTS "Club_booking_hours_check",
  DROP CONSTRAINT IF EXISTS "Club_deposit_hold_check",
  DROP COLUMN IF EXISTS "openMinute",
  DROP COLUMN IF EXISTS "closeMinute",
  DROP COLUMN IF EXISTS "requireDeposit",
  DROP COLUMN IF EXISTS "depositAlias",
  DROP COLUMN IF EXISTS "depositHoldHours";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261025000000_agenda_turnos';
