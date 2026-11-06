-- CreateTable
CREATE TABLE "SwimCompetition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "poolLength" INTEGER NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'open',
    "clubTournamentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwimCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwimEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "stroke" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'X',
    "category" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwimTime" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "stroke" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "poolLength" INTEGER NOT NULL DEFAULT 25,
    "timeMs" INTEGER NOT NULL,
    "splits" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ok',
    "source" TEXT NOT NULL DEFAULT 'training',
    "eventId" TEXT,
    "lane" INTEGER,
    "heat" INTEGER,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwimTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwimCompetition_companyId_clubId_date_idx" ON "SwimCompetition"("companyId", "clubId", "date");
CREATE INDEX "SwimEvent_competitionId_position_idx" ON "SwimEvent"("competitionId", "position");
CREATE INDEX "SwimTime_companyId_clubId_recordedAt_idx" ON "SwimTime"("companyId", "clubId", "recordedAt");
CREATE INDEX "SwimTime_playerId_stroke_distance_idx" ON "SwimTime"("playerId", "stroke", "distance");
CREATE INDEX "SwimTime_eventId_idx" ON "SwimTime"("eventId");

-- AddForeignKey
ALTER TABLE "SwimCompetition" ADD CONSTRAINT "SwimCompetition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimCompetition" ADD CONSTRAINT "SwimCompetition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimEvent" ADD CONSTRAINT "SwimEvent_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SwimCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimTime" ADD CONSTRAINT "SwimTime_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimTime" ADD CONSTRAINT "SwimTime_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimTime" ADD CONSTRAINT "SwimTime_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimTime" ADD CONSTRAINT "SwimTime_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SwimEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
