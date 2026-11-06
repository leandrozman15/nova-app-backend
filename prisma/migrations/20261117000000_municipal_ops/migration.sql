-- CreateTable
CREATE TABLE "MunicipalAnnouncement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountRequested" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MunicipalAnnouncement_municipalityId_createdAt_idx" ON "MunicipalAnnouncement"("municipalityId", "createdAt");
CREATE INDEX "ClubDocument_clubId_kind_idx" ON "ClubDocument"("clubId", "kind");
CREATE INDEX "ClubDocument_companyId_idx" ON "ClubDocument"("companyId");
CREATE INDEX "ClubRequest_municipalityId_status_idx" ON "ClubRequest"("municipalityId", "status");
CREATE INDEX "ClubRequest_clubId_createdAt_idx" ON "ClubRequest"("clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "MunicipalAnnouncement" ADD CONSTRAINT "MunicipalAnnouncement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalAnnouncement" ADD CONSTRAINT "MunicipalAnnouncement_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubDocument" ADD CONSTRAINT "ClubDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubDocument" ADD CONSTRAINT "ClubDocument_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubRequest" ADD CONSTRAINT "ClubRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubRequest" ADD CONSTRAINT "ClubRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
