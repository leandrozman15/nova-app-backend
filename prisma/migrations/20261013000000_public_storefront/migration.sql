-- Vidriera pública: usuarios libres, ubicación/visibilidad de clubes y
-- solicitudes de vínculo con ficha existente.

-- Usuario libre: sin empresa hasta que un club lo acepte (vía ClubMembership).
ALTER TABLE "User" ALTER COLUMN "companyId" DROP NOT NULL;

-- Ubicación y visibilidad pública por sección (todo oculto por defecto).
ALTER TABLE "Club"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicFacilities" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicSchools" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicCoaches" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicShop" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Club_isPublic_idx" ON "Club"("isPublic");

-- Solicitudes: mensaje, revisión y vínculo con jugador/socio existente.
ALTER TABLE "ClubMembership"
  ADD COLUMN "message" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "playerId" TEXT,
  ADD COLUMN "memberId" TEXT;

CREATE INDEX "ClubMembership_playerId_idx" ON "ClubMembership"("playerId");
CREATE INDEX "ClubMembership_memberId_idx" ON "ClubMembership"("memberId");

ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
