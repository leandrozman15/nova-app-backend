DROP INDEX IF EXISTS "PlayerPayment_mpPaymentId_idx";
ALTER TABLE "PlayerPayment"
  DROP COLUMN IF EXISTS "mpPreferenceId",
  DROP COLUMN IF EXISTS "mpPaymentId",
  DROP COLUMN IF EXISTS "mpPaymentStatus";
