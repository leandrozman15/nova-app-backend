-- ─── Phase 11: Member domain table (socios / hinchas) ───────────────────────

CREATE TABLE IF NOT EXISTS "Member" (
  "id"                 TEXT           NOT NULL DEFAULT gen_random_uuid()::text,
  "authUid"            TEXT,
  "email"              TEXT,
  "photoUrl"           TEXT,
  "firstName"          TEXT           NOT NULL,
  "lastName"           TEXT           NOT NULL,
  "dni"                TEXT,
  "birthDate"          TIMESTAMP(3),
  "phone"              TEXT,
  "address"            TEXT,
  "locality"           TEXT,
  "province"           TEXT,
  "isFan"              BOOLEAN        NOT NULL DEFAULT false,
  "active"             BOOLEAN        NOT NULL DEFAULT true,
  "status"             TEXT           DEFAULT 'active',
  "companyId"          TEXT           NOT NULL,
  "clubId"             TEXT           NOT NULL,
  "membershipNumber"   TEXT,
  "membershipTier"     TEXT,
  "membershipCategory" TEXT,
  "membershipPlanId"   TEXT,
  "isFamilyPlan"       BOOLEAN        NOT NULL DEFAULT false,
  "parking"            BOOLEAN        NOT NULL DEFAULT false,
  "paymentMethod"      TEXT,
  "notes"              TEXT,
  "facilitiesAccess"   JSONB,
  "extrasAccess"       JSONB,
  "familyMembers"      JSONB,
  "createdAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Member_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Member_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "Member_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE,
  CONSTRAINT "Member_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Member_authUid_key" ON "Member"("authUid");
CREATE UNIQUE INDEX IF NOT EXISTS "Member_email_key" ON "Member"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Member_companyId_dni_key" ON "Member"("companyId", "dni");

CREATE INDEX IF NOT EXISTS "Member_companyId_idx" ON "Member"("companyId");
CREATE INDEX IF NOT EXISTS "Member_companyId_clubId_idx" ON "Member"("companyId", "clubId");
CREATE INDEX IF NOT EXISTS "Member_authUid_idx" ON "Member"("authUid");
CREATE INDEX IF NOT EXISTS "Member_membershipPlanId_idx" ON "Member"("membershipPlanId");
CREATE INDEX IF NOT EXISTS "Member_isFan_idx" ON "Member"("isFan");
