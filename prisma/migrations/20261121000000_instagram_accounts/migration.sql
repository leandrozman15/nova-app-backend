-- CreateTable
CREATE TABLE "ClubInstagramAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "connectedByUserId" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubInstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubInstagramAccount_clubId_key" ON "ClubInstagramAccount"("clubId");

-- CreateIndex
CREATE INDEX "ClubInstagramAccount_companyId_idx" ON "ClubInstagramAccount"("companyId");

-- AddForeignKey
ALTER TABLE "ClubInstagramAccount" ADD CONSTRAINT "ClubInstagramAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
