-- Etapa 1 de la salida de Firestore: disciplinas, ramas y padrón de jugadores en Postgres.

ALTER TABLE "Club" ADD COLUMN "firestoreMigration" JSONB;

-- Jugador: datos deportivos que vivían solo en Firestore.
ALTER TABLE "Player"
  ADD COLUMN "legacyId" TEXT,
  ADD COLUMN "sport" TEXT,
  ADD COLUMN "divisionId" TEXT,
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "membershipNumber" TEXT,
  ADD COLUMN "hasMedicalCert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasMinorAuth" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isFan" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "role" TEXT,
  ADD COLUMN "extra" JSONB;

CREATE UNIQUE INDEX "Player_legacyId_key" ON "Player"("legacyId");
CREATE INDEX "Player_clubId_divisionId_idx" ON "Player"("clubId", "divisionId");

-- Disciplinas habilitadas del club.
CREATE TABLE "ClubDiscipline" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "sportId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT,
  "season" TEXT,
  "coordinatorId" TEXT,
  "coordinatorName" TEXT,
  "location" TEXT,
  "gender" TEXT,
  "minAge" INTEGER,
  "maxAge" INTEGER,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "extra" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubDiscipline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubDiscipline_clubId_sportId_key" ON "ClubDiscipline"("clubId", "sportId");
CREATE INDEX "ClubDiscipline_companyId_idx" ON "ClubDiscipline"("companyId");
ALTER TABLE "ClubDiscipline" ADD CONSTRAINT "ClubDiscipline_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ramas / categorías.
CREATE TABLE "Division" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "sport" TEXT,
  "name" TEXT NOT NULL,
  "branch" TEXT,
  "minAge" INTEGER,
  "maxAge" INTEGER,
  "coordinatorId" TEXT,
  "headCoachId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "extra" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Division_clubId_sport_idx" ON "Division"("clubId", "sport");
CREATE INDEX "Division_companyId_idx" ON "Division"("companyId");
ALTER TABLE "Division" ADD CONSTRAINT "Division_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Player" ADD CONSTRAINT "Player_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
