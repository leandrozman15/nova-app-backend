ALTER TABLE "Player" DROP CONSTRAINT IF EXISTS "Player_divisionId_fkey";
DROP TABLE IF EXISTS "Division";
DROP TABLE IF EXISTS "ClubDiscipline";
DROP INDEX IF EXISTS "Player_clubId_divisionId_idx";
DROP INDEX IF EXISTS "Player_legacyId_key";
ALTER TABLE "Player"
  DROP COLUMN IF EXISTS "legacyId",
  DROP COLUMN IF EXISTS "sport",
  DROP COLUMN IF EXISTS "divisionId",
  DROP COLUMN IF EXISTS "branch",
  DROP COLUMN IF EXISTS "gender",
  DROP COLUMN IF EXISTS "membershipNumber",
  DROP COLUMN IF EXISTS "hasMedicalCert",
  DROP COLUMN IF EXISTS "hasMinorAuth",
  DROP COLUMN IF EXISTS "isFan",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "extra";
ALTER TABLE "Club" DROP COLUMN IF EXISTS "firestoreMigration";
