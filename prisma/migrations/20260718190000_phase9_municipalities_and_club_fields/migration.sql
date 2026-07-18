-- Make the migration resilient to partial application in production.
-- This allows reruns after a failed attempt without duplicate-object errors.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Municipality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "status" TEXT DEFAULT 'active',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Club"
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "leagueId" TEXT,
  ADD COLUMN IF NOT EXISTS "municipalityId" TEXT,
  ADD COLUMN IF NOT EXISTS "sport" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT;

-- AlterTable
ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "municipalityId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Municipality_companyId_idx" ON "Municipality"("companyId");
CREATE INDEX IF NOT EXISTS "Municipality_companyId_name_idx" ON "Municipality"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Club_leagueId_idx" ON "Club"("leagueId");
CREATE INDEX IF NOT EXISTS "Club_municipalityId_idx" ON "Club"("municipalityId");
CREATE INDEX IF NOT EXISTS "League_municipalityId_idx" ON "League"("municipalityId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Municipality_companyId_fkey') THEN
    ALTER TABLE "Municipality"
      ADD CONSTRAINT "Municipality_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Club_municipalityId_fkey') THEN
    ALTER TABLE "Club"
      ADD CONSTRAINT "Club_municipalityId_fkey"
      FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Club_leagueId_fkey') THEN
    ALTER TABLE "Club"
      ADD CONSTRAINT "Club_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'League_municipalityId_fkey') THEN
    ALTER TABLE "League"
      ADD CONSTRAINT "League_municipalityId_fkey"
      FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;