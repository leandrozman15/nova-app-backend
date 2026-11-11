-- CreateTable
CREATE TABLE "ClubEmailSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "receipts" BOOLEAN NOT NULL DEFAULT false,
    "invoices" BOOLEAN NOT NULL DEFAULT false,
    "feeNotices" BOOLEAN NOT NULL DEFAULT false,
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubEmailSettings_clubId_key" ON "ClubEmailSettings"("clubId");

-- CreateIndex
CREATE INDEX "ClubEmailSettings_companyId_idx" ON "ClubEmailSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_kind_refId_key" ON "EmailLog"("kind", "refId");

-- CreateIndex
CREATE INDEX "EmailLog_companyId_clubId_idx" ON "EmailLog"("companyId", "clubId");

-- AddForeignKey
ALTER TABLE "ClubEmailSettings" ADD CONSTRAINT "ClubEmailSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
