-- CreateTable
CREATE TABLE "ClubFacebookPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "connectedByUserId" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubFacebookPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubFacebookPage_clubId_key" ON "ClubFacebookPage"("clubId");

-- CreateIndex
CREATE INDEX "ClubFacebookPage_companyId_idx" ON "ClubFacebookPage"("companyId");

-- AddForeignKey
ALTER TABLE "ClubFacebookPage" ADD CONSTRAINT "ClubFacebookPage_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
