-- Ficha del alumno del profe de pádel.
ALTER TABLE "CoachStudent" ADD COLUMN "birthDate" TEXT;
ALTER TABLE "CoachStudent" ADD COLUMN "hand" TEXT;
ALTER TABLE "CoachStudent" ADD COLUMN "side" TEXT;
ALTER TABLE "CoachStudent" ADD COLUMN "goals" TEXT;
ALTER TABLE "CoachStudent" ADD COLUMN "skills" JSONB;
ALTER TABLE "CoachStudent" ADD COLUMN "skillsUpdatedAt" TIMESTAMP(3);
