CREATE TABLE "MatchCategoryResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'played',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchCategoryResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchCategoryResult_matchId_category_key" ON "MatchCategoryResult"("matchId", "category");
CREATE INDEX "MatchCategoryResult_companyId_idx" ON "MatchCategoryResult"("companyId");

ALTER TABLE "MatchCategoryResult" ADD CONSTRAINT "MatchCategoryResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
