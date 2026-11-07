-- CreateTable
CREATE TABLE "MunicipalProject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "responsible" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalProjectLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "category" TEXT,
    "plannedAmount" INTEGER NOT NULL DEFAULT 0,
    "spentAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalProjectLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalProjectEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalProjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalStaff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MunicipalProject_municipalityId_status_idx" ON "MunicipalProject"("municipalityId", "status");
CREATE INDEX "MunicipalProjectLine_projectId_idx" ON "MunicipalProjectLine"("projectId");
CREATE INDEX "MunicipalProjectEvent_projectId_createdAt_idx" ON "MunicipalProjectEvent"("projectId", "createdAt");
CREATE UNIQUE INDEX "MunicipalStaff_firebaseUid_key" ON "MunicipalStaff"("firebaseUid");
CREATE INDEX "MunicipalStaff_municipalityId_idx" ON "MunicipalStaff"("municipalityId");

-- AddForeignKey
ALTER TABLE "MunicipalProject" ADD CONSTRAINT "MunicipalProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalProject" ADD CONSTRAINT "MunicipalProject_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalProjectLine" ADD CONSTRAINT "MunicipalProjectLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MunicipalProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalProjectEvent" ADD CONSTRAINT "MunicipalProjectEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MunicipalProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalStaff" ADD CONSTRAINT "MunicipalStaff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MunicipalStaff" ADD CONSTRAINT "MunicipalStaff_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
