-- Reservas sin seña (solicitud que confirma el club), servicios del club y actividades.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';

ALTER TABLE "Club" ADD COLUMN "bookingMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Club" ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Los clubes que ya conectaron Mercado Pago siguen cobrando seña.
UPDATE "Club" SET "bookingMode" = 'deposit'
  WHERE "id" IN (SELECT "clubId" FROM "ClubPaymentAccount");

CREATE TYPE "ActivityInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

CREATE TABLE "ClubActivity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sport" TEXT,
  "audience" TEXT,
  "description" TEXT,
  "coaches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "schedule" JSONB NOT NULL DEFAULT '[]',
  "price" DECIMAL(12,2),
  "priceUnit" TEXT,
  "showPrice" BOOLEAN NOT NULL DEFAULT false,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClubActivity_companyId_clubId_idx" ON "ClubActivity"("companyId", "clubId");
CREATE INDEX "ClubActivity_clubId_isPublic_idx" ON "ClubActivity"("clubId", "isPublic");
ALTER TABLE "ClubActivity" ADD CONSTRAINT "ClubActivity_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubActivity" ADD CONSTRAINT "ClubActivity_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivityInquiry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT,
  "status" "ActivityInquiryStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityInquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivityInquiry_companyId_clubId_status_idx" ON "ActivityInquiry"("companyId", "clubId", "status");
CREATE INDEX "ActivityInquiry_userId_activityId_idx" ON "ActivityInquiry"("userId", "activityId");
ALTER TABLE "ActivityInquiry" ADD CONSTRAINT "ActivityInquiry_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityInquiry" ADD CONSTRAINT "ActivityInquiry_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "ClubActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityInquiry" ADD CONSTRAINT "ActivityInquiry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
