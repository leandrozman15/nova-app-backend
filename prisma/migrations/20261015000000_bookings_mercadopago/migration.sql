-- Reservas online con seña por Mercado Pago.

ALTER TABLE "Club"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Facility"
  ADD COLUMN "bookable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hourlyPrice" DECIMAL(12,2);

CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED_BY_USER', 'CANCELLED_BY_CLUB');

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "price" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "mpPaymentStatus" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Booking_hour_check" CHECK ("hour" BETWEEN 0 AND 23),
    CONSTRAINT "Booking_amounts_check" CHECK ("price" >= 0 AND "depositAmount" >= 0 AND "depositAmount" <= "price")
);

CREATE INDEX "Booking_companyId_clubId_date_idx" ON "Booking"("companyId", "clubId", "date");
CREATE INDEX "Booking_facilityId_date_idx" ON "Booking"("facilityId", "date");
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");
CREATE INDEX "Booking_mpPaymentId_idx" ON "Booking"("mpPaymentId");

-- Anti doble reserva: un solo turno activo por cancha, fecha y hora.
-- (Prisma no modela índices parciales; se mantiene solo en SQL.)
CREATE UNIQUE INDEX "Booking_active_slot_key" ON "Booking"("facilityId", "date", "hour")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClubPaymentAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mercadopago',
    "providerUserId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "publicKey" TEXT,
    "liveMode" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubPaymentAccount_clubId_key" ON "ClubPaymentAccount"("clubId");
CREATE INDEX "ClubPaymentAccount_companyId_idx" ON "ClubPaymentAccount"("companyId");

ALTER TABLE "ClubPaymentAccount" ADD CONSTRAINT "ClubPaymentAccount_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
