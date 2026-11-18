-- Qué cuenta de Mercado Pago está conectada a cada club.
ALTER TABLE "ClubPaymentAccount" ADD COLUMN "providerNickname" TEXT;
ALTER TABLE "ClubPaymentAccount" ADD COLUMN "providerEmail" TEXT;
CREATE INDEX "ClubPaymentAccount_providerUserId_idx" ON "ClubPaymentAccount"("providerUserId");
