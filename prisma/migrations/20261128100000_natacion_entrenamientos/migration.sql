-- Entrenamientos cronometrados de natación (series de repeticiones).
CREATE TABLE "SwimWorkout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT,
    "divisionId" TEXT,
    "name" TEXT NOT NULL,
    "stroke" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "intervalSec" INTEGER,
    "poolLength" INTEGER NOT NULL DEFAULT 25,
    "notes" TEXT,
    "createdBy" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SwimWorkout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SwimWorkout_companyId_clubId_recordedAt_idx" ON "SwimWorkout"("companyId", "clubId", "recordedAt");
CREATE INDEX "SwimWorkout_teamId_idx" ON "SwimWorkout"("teamId");

ALTER TABLE "SwimWorkout" ADD CONSTRAINT "SwimWorkout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwimWorkout" ADD CONSTRAINT "SwimWorkout_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SwimTime" ADD COLUMN "workoutId" TEXT;
ALTER TABLE "SwimTime" ADD COLUMN "rep" INTEGER;
CREATE INDEX "SwimTime_workoutId_idx" ON "SwimTime"("workoutId");
ALTER TABLE "SwimTime" ADD CONSTRAINT "SwimTime_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "SwimWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
