-- Revierte 20261013000000_public_storefront.
-- ATENCIÓN: antes de restaurar NOT NULL, los usuarios libres (companyId NULL)
-- deben borrarse o asignarse a una empresa; si no, el último paso falla.
ALTER TABLE "ClubMembership" DROP CONSTRAINT IF EXISTS "ClubMembership_memberId_fkey";
ALTER TABLE "ClubMembership" DROP CONSTRAINT IF EXISTS "ClubMembership_playerId_fkey";
DROP INDEX IF EXISTS "ClubMembership_memberId_idx";
DROP INDEX IF EXISTS "ClubMembership_playerId_idx";
ALTER TABLE "ClubMembership"
  DROP COLUMN IF EXISTS "memberId",
  DROP COLUMN IF EXISTS "playerId",
  DROP COLUMN IF EXISTS "reviewedByUserId",
  DROP COLUMN IF EXISTS "reviewedAt",
  DROP COLUMN IF EXISTS "message";

DROP INDEX IF EXISTS "Club_isPublic_idx";
ALTER TABLE "Club"
  DROP COLUMN IF EXISTS "publicShop",
  DROP COLUMN IF EXISTS "publicCoaches",
  DROP COLUMN IF EXISTS "publicSchools",
  DROP COLUMN IF EXISTS "publicFacilities",
  DROP COLUMN IF EXISTS "isPublic",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "latitude";

ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
