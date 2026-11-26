-- Mora configurable de las cuotas vencidas.
ALTER TABLE "Club" ADD COLUMN "lateFeeMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Club" ADD COLUMN "lateFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "Club" ADD COLUMN "lateFeeGraceDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Club" ADD COLUMN "lateFeeMaxPercent" DECIMAL(5,2);
ALTER TABLE "PlayerPayment" ADD COLUMN "lateFeeAmount" DECIMAL(12,2);
