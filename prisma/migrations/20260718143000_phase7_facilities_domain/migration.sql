-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "typeLabel" TEXT,
    "status" TEXT NOT NULL,
    "statusLabel" TEXT,
    "photoUrl" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "surfaceType" TEXT,
    "services" JSONB,
    "capacity" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Facility_companyId_idx" ON "Facility"("companyId");
CREATE INDEX "Facility_clubId_idx" ON "Facility"("clubId");
CREATE INDEX "Facility_companyId_clubId_idx" ON "Facility"("companyId", "clubId");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;