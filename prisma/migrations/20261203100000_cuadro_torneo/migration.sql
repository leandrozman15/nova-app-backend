-- Cuadro de eliminación de los torneos del club: participantes cargados a mano y partidos.
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "players" JSONB NOT NULL DEFAULT '[]',
    "notifyUids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seed" INTEGER,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentTeam_entryId_key" ON "TournamentTeam"("entryId");
CREATE INDEX "TournamentTeam_tournamentId_idx" ON "TournamentTeam"("tournamentId");
CREATE INDEX "TournamentTeam_notifyUids_idx" ON "TournamentTeam" USING GIN ("notifyUids");
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "ClubTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "date" TEXT,
    "startMinute" INTEGER,
    "court" TEXT,
    "score" TEXT,
    "winnerId" TEXT,
    "notifiedKey" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_round_position_key" ON "TournamentMatch"("tournamentId", "round", "position");
CREATE INDEX "TournamentMatch_teamAId_idx" ON "TournamentMatch"("teamAId");
CREATE INDEX "TournamentMatch_teamBId_idx" ON "TournamentMatch"("teamBId");
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "ClubTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
