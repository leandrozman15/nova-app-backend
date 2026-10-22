CREATE TABLE "LeagueAnnouncement" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeagueAnnouncement_leagueId_createdAt_idx" ON "LeagueAnnouncement"("leagueId", "createdAt");
CREATE INDEX "LeagueAnnouncement_companyId_idx" ON "LeagueAnnouncement"("companyId");

ALTER TABLE "LeagueAnnouncement" ADD CONSTRAINT "LeagueAnnouncement_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
