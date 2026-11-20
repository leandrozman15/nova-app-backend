-- Estado de turnos libres (WhatsApp / historia de Instagram)
CREATE TABLE "ClubAvailabilityStory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "instagram" BOOLEAN NOT NULL DEFAULT false,
    "facilityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact" TEXT,
    "lastRunDate" TEXT,
    "lastInstagramAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClubAvailabilityStory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubAvailabilityStory_clubId_key" ON "ClubAvailabilityStory"("clubId");
CREATE INDEX "ClubAvailabilityStory_companyId_idx" ON "ClubAvailabilityStory"("companyId");
ALTER TABLE "ClubAvailabilityStory" ADD CONSTRAINT "ClubAvailabilityStory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
