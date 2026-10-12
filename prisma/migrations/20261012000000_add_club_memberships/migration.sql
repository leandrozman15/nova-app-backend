CREATE TYPE "ClubMembershipStatus" AS ENUM ('SOLICITADA', 'ACTIVA', 'RECHAZADA', 'BAJA');

CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" "ClubMembershipStatus" NOT NULL DEFAULT 'SOLICITADA',
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubMembership_userId_clubId_key" ON "ClubMembership"("userId", "clubId");
CREATE INDEX "ClubMembership_companyId_clubId_status_idx" ON "ClubMembership"("companyId", "clubId", "status");
CREATE INDEX "ClubMembership_userId_status_idx" ON "ClubMembership"("userId", "status");

ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;