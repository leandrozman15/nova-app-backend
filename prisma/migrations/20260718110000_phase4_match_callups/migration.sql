-- CreateEnum
CREATE TYPE "MatchCallupStatus" AS ENUM ('pending', 'confirmed', 'unavailable');

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "busDepartureTime" TEXT,
ADD COLUMN "callupsPublishedAt" TIMESTAMP(3),
ADD COLUMN "jersey" TEXT,
ADD COLUMN "lineupSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MatchCallup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerExternalId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerPhoto" TEXT,
    "status" "MatchCallupStatus" NOT NULL DEFAULT 'pending',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchCallup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchCallup_matchId_playerExternalId_key" ON "MatchCallup"("matchId", "playerExternalId");

-- CreateIndex
CREATE INDEX "MatchCallup_companyId_idx" ON "MatchCallup"("companyId");

-- CreateIndex
CREATE INDEX "MatchCallup_matchId_idx" ON "MatchCallup"("matchId");

-- CreateIndex
CREATE INDEX "MatchCallup_playerExternalId_idx" ON "MatchCallup"("playerExternalId");

-- CreateIndex
CREATE INDEX "MatchCallup_companyId_playerExternalId_idx" ON "MatchCallup"("companyId", "playerExternalId");

-- CreateIndex
CREATE INDEX "MatchCallup_companyId_publishedAt_idx" ON "MatchCallup"("companyId", "publishedAt");

-- AddForeignKey
ALTER TABLE "MatchCallup" ADD CONSTRAINT "MatchCallup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCallup" ADD CONSTRAINT "MatchCallup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;