-- Cobro online de cuotas de socio por Mercado Pago (cuenta propia de cada club).
ALTER TABLE "PlayerPayment"
  ADD COLUMN "mpPreferenceId" TEXT,
  ADD COLUMN "mpPaymentId" TEXT,
  ADD COLUMN "mpPaymentStatus" TEXT;

CREATE INDEX "PlayerPayment_mpPaymentId_idx" ON "PlayerPayment"("mpPaymentId");
