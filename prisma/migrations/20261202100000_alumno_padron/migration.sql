-- Alumno del profe vinculado a su ficha del padrón del club.
ALTER TABLE "CoachStudent" ADD COLUMN "playerId" TEXT;
CREATE INDEX "CoachStudent_playerId_idx" ON "CoachStudent"("playerId");
