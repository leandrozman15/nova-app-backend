CREATE TABLE "LeagueTournament" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'regular',
    "category" TEXT,
    "format" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueTournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeagueTournamentClub" (
    "tournamentId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueTournamentClub_pkey" PRIMARY KEY ("tournamentId","clubId")
);

CREATE INDEX "LeagueTournament_leagueId_createdAt_idx" ON "LeagueTournament"("leagueId", "createdAt");
CREATE INDEX "LeagueTournament_companyId_idx" ON "LeagueTournament"("companyId");
CREATE INDEX "LeagueTournamentClub_clubId_idx" ON "LeagueTournamentClub"("clubId");

ALTER TABLE "LeagueTournament" ADD CONSTRAINT "LeagueTournament_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueTournamentClub" ADD CONSTRAINT "LeagueTournamentClub_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "LeagueTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueTournamentClub" ADD CONSTRAINT "LeagueTournamentClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
