-- Padrón de pádel por club: quiénes son socios/jugadores del club o se anotaron a sus torneos.
CREATE TABLE "ClubPadelMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPadelMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubPadelMember_clubId_profileId_key" ON "ClubPadelMember"("clubId", "profileId");
CREATE INDEX "ClubPadelMember_companyId_clubId_idx" ON "ClubPadelMember"("companyId", "clubId");

ALTER TABLE "ClubPadelMember" ADD CONSTRAINT "ClubPadelMember_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "PadelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
