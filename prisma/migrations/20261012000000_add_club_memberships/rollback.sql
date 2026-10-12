ALTER TABLE "ClubMembership" DROP CONSTRAINT IF EXISTS "ClubMembership_clubId_fkey";
ALTER TABLE "ClubMembership" DROP CONSTRAINT IF EXISTS "ClubMembership_companyId_fkey";
ALTER TABLE "ClubMembership" DROP CONSTRAINT IF EXISTS "ClubMembership_userId_fkey";
DROP TABLE IF EXISTS "ClubMembership";
DROP TYPE IF EXISTS "ClubMembershipStatus";