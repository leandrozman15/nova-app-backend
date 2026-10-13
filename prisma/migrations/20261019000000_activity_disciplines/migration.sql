-- Configuración en la app de las disciplinas que el club ya tiene en la consola.
ALTER TABLE "ClubActivity" ADD COLUMN "disciplineId" TEXT;
CREATE UNIQUE INDEX "ClubActivity_clubId_disciplineId_key" ON "ClubActivity"("clubId", "disciplineId");
