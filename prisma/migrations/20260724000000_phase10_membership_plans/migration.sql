-- ─── Phase 10: Membership Plans & Player membership fields ──────────────────

-- 1. Extend Player with membership fields
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "membershipTier"     TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "membershipCategory" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "membershipPlanId"   TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isFamilyPlan"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "parking"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "paymentMethod"      TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "notes"              TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "facilitiesAccess"   JSONB;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "extrasAccess"       JSONB;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "familyMembers"      JSONB;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "phone"              TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "address"            TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "locality"           TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "province"           TEXT;

-- 2. MembershipPlan table (club-configurable)
CREATE TABLE IF NOT EXISTS "MembershipPlan" (
  "id"                 TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"          TEXT         NOT NULL,
  "clubId"             TEXT         NOT NULL,
  "name"               TEXT         NOT NULL,
  "description"        TEXT,
  "price"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "parkingPrice"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "familyMemberPrice"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "facilities"         JSONB,
  "extras"             JSONB,
  "isActive"           BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"          INTEGER      NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "MembershipPlan_clubId_fkey"    FOREIGN KEY ("clubId")    REFERENCES "Club"("id")    ON DELETE CASCADE
);

-- 3. FK from Player to MembershipPlan (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Player_membershipPlanId_fkey'
  ) THEN
    ALTER TABLE "Player"
      ADD CONSTRAINT "Player_membershipPlanId_fkey"
      FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Index for plan lookups
CREATE INDEX IF NOT EXISTS "MembershipPlan_clubId_idx" ON "MembershipPlan"("clubId");
