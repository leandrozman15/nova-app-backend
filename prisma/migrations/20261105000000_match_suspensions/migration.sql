ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'suspended';

ALTER TABLE "Match" ADD COLUMN "originalScheduledAt" TIMESTAMP(3);

CREATE TABLE "MatchSuspension" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "clubId" TEXT,
    "categories" TEXT[],
    "reason" TEXT NOT NULL,
    "suspendedBy" TEXT,
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL DEFAULT 'open',
    "newDate" TIMESTAMP(3),
    "newVenue" TEXT,
    "rescheduleNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSuspension_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchSuspension_matchId_idx" ON "MatchSuspension"("matchId");
CREATE INDEX "MatchSuspension_companyId_state_idx" ON "MatchSuspension"("companyId", "state");

ALTER TABLE "MatchSuspension" ADD CONSTRAINT "MatchSuspension_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
