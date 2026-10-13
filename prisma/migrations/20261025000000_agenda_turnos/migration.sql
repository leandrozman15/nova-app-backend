-- Agenda de canchas: turnos por minutos con duración, turnos fijos semanales,
-- seña sin pasarela, asistencia y cobro del turno.

-- Club: horario de turnos y seña manual.
ALTER TABLE "Club"
  ADD COLUMN "openMinute" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "closeMinute" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN "requireDeposit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "depositAlias" TEXT,
  ADD COLUMN "depositHoldHours" INTEGER NOT NULL DEFAULT 12,
  ADD CONSTRAINT "Club_booking_hours_check" CHECK (
    "openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute"
  ),
  ADD CONSTRAINT "Club_deposit_hold_check" CHECK ("depositHoldHours" BETWEEN 1 AND 72);

-- Cancha: duraciones de turno que ofrece.
ALTER TABLE "Facility" ADD COLUMN "slotDurations" INTEGER[] NOT NULL DEFAULT ARRAY[60]::INTEGER[];

-- Turnos fijos.
CREATE TABLE "RecurringBooking" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "kind" TEXT NOT NULL DEFAULT 'ALQUILER',
  "clientName" TEXT NOT NULL,
  "clientPhone" TEXT,
  "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT,
  "createdByUid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringBooking_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "RecurringBooking_time_check" CHECK (
    "startMinute" >= 0 AND "durationMinutes" > 0 AND "startMinute" + "durationMinutes" <= 1440
  )
);
CREATE INDEX "RecurringBooking_clubId_weekday_idx" ON "RecurringBooking"("clubId", "weekday");
CREATE INDEX "RecurringBooking_facilityId_idx" ON "RecurringBooking"("facilityId");
ALTER TABLE "RecurringBooking" ADD CONSTRAINT "RecurringBooking_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringBooking" ADD CONSTRAINT "RecurringBooking_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reservas: minutos, duración, origen y operación del turno.
ALTER TABLE "Booking"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "startMinute" INTEGER,
  ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'APP',
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ALQUILER',
  ADD COLUMN "recurringId" TEXT,
  ADD COLUMN "attendance" TEXT,
  ADD COLUMN "depositMethod" TEXT,
  ADD COLUMN "depositPaidAt" TIMESTAMP(3),
  ADD COLUMN "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdByUid" TEXT;

UPDATE "Booking" SET
  "startMinute" = "hour" * 60,
  "endsAt" = "startsAt" + INTERVAL '60 minutes';
-- Señas ya cobradas por Mercado Pago cuentan como cobradas.
UPDATE "Booking" SET "paidAmount" = "depositAmount", "depositMethod" = 'mercadopago', "depositPaidAt" = "paidAt"
  WHERE "paidAt" IS NOT NULL;

ALTER TABLE "Booking"
  ALTER COLUMN "startMinute" SET NOT NULL,
  ALTER COLUMN "endsAt" SET NOT NULL,
  ADD CONSTRAINT "Booking_time_check" CHECK ("durationMinutes" > 0 AND "endsAt" > "startsAt"),
  ADD CONSTRAINT "Booking_attendance_check" CHECK ("attendance" IS NULL OR "attendance" IN ('SHOWED', 'NO_SHOW'));

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_recurringId_fkey"
  FOREIGN KEY ("recurringId") REFERENCES "RecurringBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Booking_recurringId_date_key" ON "Booking"("recurringId", "date");

-- Un turno activo no puede pisarse con otro en la misma cancha (sirve para cualquier duración).
DROP INDEX IF EXISTS "Booking_active_slot_key";
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist ("facilityId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'));

-- Los alquileres de la grilla semanal pasan a ser turnos fijos (siempre se repitieron cada semana).
INSERT INTO "RecurringBooking" (
  "id", "companyId", "clubId", "facilityId", "weekday", "startMinute", "durationMinutes",
  "kind", "clientName", "clientPhone", "price", "notes", "startDate", "updatedAt"
)
SELECT
  'fr_' || r."id",
  r."companyId",
  r."clubId",
  r."facilityId",
  CASE r."day" WHEN 'Dom' THEN 0 WHEN 'Lun' THEN 1 WHEN 'Mar' THEN 2 WHEN 'Mié' THEN 3
    WHEN 'Jue' THEN 4 WHEN 'Vie' THEN 5 ELSE 6 END,
  r."hour" * 60,
  60,
  CASE lower(r."status") WHEN 'training' THEN 'ENTRENAMIENTO' WHEN 'match' THEN 'PARTIDO'
    WHEN 'maintenance' THEN 'MANTENIMIENTO' ELSE 'ALQUILER' END,
  r."clientName",
  r."clientPhone",
  r."price",
  r."notes",
  to_char(CURRENT_DATE, 'YYYY-MM-DD'),
  CURRENT_TIMESTAMP
FROM "FacilityRental" r
WHERE lower(r."status") NOT IN ('cancelled', 'canceled', 'cancelado', 'cancelada', 'available')
  AND r."day" IN ('Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb')
  AND r."hour" BETWEEN 0 AND 23;
