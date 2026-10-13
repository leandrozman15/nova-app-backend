-- Cargos de Fluxion a los clubes por torneos, con valores globales editables por el dueño de la plataforma.
CREATE TABLE "PlatformSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "tournamentPublishFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tournamentEntryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "updatedByUid" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('global', now()) ON CONFLICT DO NOTHING;

CREATE TYPE "PlatformChargeStatus" AS ENUM ('PENDING', 'PAID', 'VOIDED');

CREATE TABLE "PlatformCharge" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "tournamentId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "description" TEXT NOT NULL,
  "status" "PlatformChargeStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformCharge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformCharge_sourceKey_key" ON "PlatformCharge"("sourceKey");
CREATE INDEX "PlatformCharge_clubId_status_idx" ON "PlatformCharge"("clubId", "status");
CREATE INDEX "PlatformCharge_status_createdAt_idx" ON "PlatformCharge"("status", "createdAt");
ALTER TABLE "PlatformCharge" ADD CONSTRAINT "PlatformCharge_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
