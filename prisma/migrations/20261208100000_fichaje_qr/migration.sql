CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reasons" JSONB,
    "scannedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessLog_clubId_createdAt_idx" ON "AccessLog"("clubId", "createdAt");
CREATE INDEX "AccessLog_playerId_createdAt_idx" ON "AccessLog"("playerId", "createdAt");
