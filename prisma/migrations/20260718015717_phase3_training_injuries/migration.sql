-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('scheduled', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('going', 'not_going', 'unknown');

-- CreateEnum
CREATE TYPE "InjuryStatus" AS ENUM ('active', 'recovered');

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'scheduled',
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'unknown',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "InjuryStatus" NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingSession_companyId_idx" ON "TrainingSession"("companyId");

-- CreateIndex
CREATE INDEX "TrainingSession_clubId_idx" ON "TrainingSession"("clubId");

-- CreateIndex
CREATE INDEX "TrainingSession_teamId_idx" ON "TrainingSession"("teamId");

-- CreateIndex
CREATE INDEX "TrainingSession_scheduledAt_idx" ON "TrainingSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "TrainingSession_companyId_scheduledAt_idx" ON "TrainingSession"("companyId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TrainingAttendance_companyId_idx" ON "TrainingAttendance"("companyId");

-- CreateIndex
CREATE INDEX "TrainingAttendance_sessionId_idx" ON "TrainingAttendance"("sessionId");

-- CreateIndex
CREATE INDEX "TrainingAttendance_playerId_idx" ON "TrainingAttendance"("playerId");

-- CreateIndex
CREATE INDEX "TrainingAttendance_companyId_status_idx" ON "TrainingAttendance"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAttendance_sessionId_playerId_key" ON "TrainingAttendance"("sessionId", "playerId");

-- CreateIndex
CREATE INDEX "InjuryReport_companyId_idx" ON "InjuryReport"("companyId");

-- CreateIndex
CREATE INDEX "InjuryReport_clubId_idx" ON "InjuryReport"("clubId");

-- CreateIndex
CREATE INDEX "InjuryReport_teamId_idx" ON "InjuryReport"("teamId");

-- CreateIndex
CREATE INDEX "InjuryReport_playerId_idx" ON "InjuryReport"("playerId");

-- CreateIndex
CREATE INDEX "InjuryReport_companyId_status_idx" ON "InjuryReport"("companyId", "status");

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttendance" ADD CONSTRAINT "TrainingAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttendance" ADD CONSTRAINT "TrainingAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttendance" ADD CONSTRAINT "TrainingAttendance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
