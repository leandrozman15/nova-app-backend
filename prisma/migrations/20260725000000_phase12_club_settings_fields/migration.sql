-- ─── Phase 12: Club settings / branding fields ──────────────────────────────

ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "legalName"      TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "cuit"           TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "foundationDate" TIMESTAMP(3);
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "city"           TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "phone"          TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "email"          TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "billingEmail"   TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "website"        TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "instagram"      TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "facebook"       TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "logoUrl"        TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "description"    TEXT;
