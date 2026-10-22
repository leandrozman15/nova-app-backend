ALTER TABLE "Match" ADD COLUMN "tournamentId" TEXT, ADD COLUMN "round" INTEGER;
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "LeagueTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
