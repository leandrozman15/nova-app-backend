-- AlterTable
ALTER TABLE "ClubDocument" ADD COLUMN "validatedAt" TIMESTAMP(3),
ADD COLUMN "validatedBy" TEXT;

-- AlterTable
ALTER TABLE "ClubRequest" ADD COLUMN "settledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClubRequestReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubRequestReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "actorUid" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubRequestReceipt_requestId_idx" ON "ClubRequestReceipt"("requestId");

-- CreateIndex
CREATE INDEX "MunicipalAuditLog_municipalityId_createdAt_idx" ON "MunicipalAuditLog"("municipalityId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClubRequestReceipt" ADD CONSTRAINT "ClubRequestReceipt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClubRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
