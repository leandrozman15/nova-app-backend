-- CreateTable
CREATE TABLE "Municipality" (
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
  ADD COLUMN "address" TEXT,
  ADD COLUMN "leagueId" TEXT,
  ADD COLUMN "municipalityId" TEXT,
  ADD COLUMN "sport" TEXT,
  ADD COLUMN "status" TEXT;

-- AlterTable
ALTER TABLE "League"
  ADD COLUMN "municipalityId" TEXT;

-- CreateIndex
CREATE INDEX "Municipality_companyId_idx" ON "Municipality"("companyId");
CREATE INDEX "Municipality_companyId_name_idx" ON "Municipality"("companyId", "name");
CREATE INDEX "Club_leagueId_idx" ON "Club"("leagueId");
CREATE INDEX "Club_municipalityId_idx" ON "Club"("municipalityId");
CREATE INDEX "League_municipalityId_idx" ON "League"("municipalityId");

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Club" ADD CONSTRAINT "Club_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Club" ADD CONSTRAINT "Club_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "League" ADD CONSTRAINT "League_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;