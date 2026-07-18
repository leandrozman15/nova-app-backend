-- CreateTable
CREATE TABLE "FacilityRental" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "isRecurrent" BOOLEAN NOT NULL DEFAULT false,
    "day" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityRental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityRental_companyId_idx" ON "FacilityRental"("companyId");
CREATE INDEX "FacilityRental_clubId_idx" ON "FacilityRental"("clubId");
CREATE INDEX "FacilityRental_facilityId_idx" ON "FacilityRental"("facilityId");
CREATE INDEX "FacilityRental_companyId_clubId_idx" ON "FacilityRental"("companyId", "clubId");
CREATE INDEX "FacilityRental_companyId_facilityId_idx" ON "FacilityRental"("companyId", "facilityId");
CREATE INDEX "FacilityRental_companyId_day_hour_idx" ON "FacilityRental"("companyId", "day", "hour");

-- AddForeignKey
ALTER TABLE "FacilityRental" ADD CONSTRAINT "FacilityRental_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityRental" ADD CONSTRAINT "FacilityRental_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityRental" ADD CONSTRAINT "FacilityRental_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
