-- Torneos abiertos publicados en la app y sus inscripciones.
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'FINISHED');
CREATE TYPE "TournamentEntryStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ClubTournament" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sport" TEXT NOT NULL,
  "variant" TEXT,
  "category" TEXT,
  "entryType" TEXT NOT NULL DEFAULT 'equipo',
  "description" TEXT,
  "days" JSONB NOT NULL DEFAULT '[]',
  "venues" JSONB NOT NULL DEFAULT '[]',
  "organizers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "registrationFee" DECIMAL(12,2),
  "feeUnit" TEXT,
  "registrationDeadline" TEXT,
  "maxEntries" INTEGER,
  "prizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rules" TEXT,
  "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
  "startDate" TEXT,
  "endDate" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubTournament_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClubTournament_companyId_clubId_idx" ON "ClubTournament"("companyId", "clubId");
CREATE INDEX "ClubTournament_status_sport_startDate_idx" ON "ClubTournament"("status", "sport", "startDate");
ALTER TABLE "ClubTournament" ADD CONSTRAINT "ClubTournament_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubTournament" ADD CONSTRAINT "ClubTournament_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TournamentEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamName" TEXT,
  "message" TEXT,
  "status" "TournamentEntryStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TournamentEntry_tournamentId_status_idx" ON "TournamentEntry"("tournamentId", "status");
CREATE INDEX "TournamentEntry_userId_idx" ON "TournamentEntry"("userId");
CREATE INDEX "TournamentEntry_companyId_clubId_idx" ON "TournamentEntry"("companyId", "clubId");
-- Una sola inscripción vigente por usuario y torneo.
CREATE UNIQUE INDEX "TournamentEntry_active_user_key" ON "TournamentEntry"("tournamentId", "userId")
  WHERE "status" IN ('PENDING', 'ACCEPTED');
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "ClubTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
