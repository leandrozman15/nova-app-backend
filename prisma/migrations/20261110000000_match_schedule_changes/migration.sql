CREATE TABLE "MatchScheduleChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previousAt" TIMESTAMP(3) NOT NULL,
    "newAt" TIMESTAMP(3) NOT NULL,
    "deltaMinutes" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchScheduleChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchScheduleChange_matchId_createdAt_idx" ON "MatchScheduleChange"("matchId", "createdAt");
CREATE INDEX "MatchScheduleChange_companyId_idx" ON "MatchScheduleChange"("companyId");
ALTER TABLE "MatchScheduleChange" ADD CONSTRAINT "MatchScheduleChange_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
