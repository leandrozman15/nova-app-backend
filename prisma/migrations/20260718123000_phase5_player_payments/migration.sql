-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'pending', 'overdue');

-- CreateTable
CREATE TABLE "PlayerPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerPayment_companyId_idx" ON "PlayerPayment"("companyId");

-- CreateIndex
CREATE INDEX "PlayerPayment_clubId_idx" ON "PlayerPayment"("clubId");

-- CreateIndex
CREATE INDEX "PlayerPayment_playerId_idx" ON "PlayerPayment"("playerId");

-- CreateIndex
CREATE INDEX "PlayerPayment_companyId_clubId_idx" ON "PlayerPayment"("companyId", "clubId");

-- CreateIndex
CREATE INDEX "PlayerPayment_companyId_playerId_idx" ON "PlayerPayment"("companyId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerPayment_companyId_status_idx" ON "PlayerPayment"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPayment_playerId_month_year_key" ON "PlayerPayment"("playerId", "month", "year");

-- AddForeignKey
ALTER TABLE "PlayerPayment" ADD CONSTRAINT "PlayerPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPayment" ADD CONSTRAINT "PlayerPayment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPayment" ADD CONSTRAINT "PlayerPayment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;