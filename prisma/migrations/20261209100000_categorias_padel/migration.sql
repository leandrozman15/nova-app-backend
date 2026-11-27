ALTER TABLE "ClubTournament"
  ADD COLUMN "padelMode" TEXT,
  ADD COLUMN "padelCategory" TEXT,
  ADD COLUMN "padelSum" INTEGER,
  ADD COLUMN "padelTopCategory" TEXT;

ALTER TABLE "TournamentEntry" ADD COLUMN "partnerDniHash" TEXT;

CREATE TABLE "PadelProfile" (
    "id" TEXT NOT NULL,
    "dniHash" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "floorCategory" TEXT NOT NULL,
    "elo" INTEGER NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "matchesWon" INTEGER NOT NULL DEFAULT 0,
    "tournamentsWon" INTEGER NOT NULL DEFAULT 0,
    "lastCategoryChangeAt" TIMESTAMP(3),
    "verifiedByClubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PadelProfile_dniHash_key" ON "PadelProfile"("dniHash");
CREATE UNIQUE INDEX "PadelProfile_userId_key" ON "PadelProfile"("userId");
CREATE INDEX "PadelProfile_displayName_idx" ON "PadelProfile"("displayName");
CREATE INDEX "PadelProfile_category_elo_idx" ON "PadelProfile"("category", "elo");

CREATE TABLE "PadelCategoryChange" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fromCategory" TEXT,
    "toCategory" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "clubId" TEXT,
    "byUid" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelCategoryChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PadelCategoryChange_profileId_createdAt_idx" ON "PadelCategoryChange"("profileId", "createdAt");
ALTER TABLE "PadelCategoryChange" ADD CONSTRAINT "PadelCategoryChange_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PadelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PadelResult" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "teamsCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PadelResult_profileId_tournamentId_key" ON "PadelResult"("profileId", "tournamentId");
CREATE INDEX "PadelResult_profileId_createdAt_idx" ON "PadelResult"("profileId", "createdAt");
ALTER TABLE "PadelResult" ADD CONSTRAINT "PadelResult_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PadelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
