ALTER TABLE "BuffetSale" ADD COLUMN "clientRef" TEXT;
CREATE UNIQUE INDEX "BuffetSale_clubId_clientRef_key" ON "BuffetSale"("clubId", "clientRef");
