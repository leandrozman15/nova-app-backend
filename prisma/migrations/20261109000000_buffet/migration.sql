CREATE TABLE "Buffet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Buffet',
    "mode" TEXT NOT NULL DEFAULT 'own',
    "canonAmount" DECIMAL(12,2),
    "percent" DECIMAL(5,2),
    "concessionaire" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Buffet_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BuffetProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuffetProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BuffetCashSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedByUid" TEXT NOT NULL,
    "openedByName" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedByUid" TEXT,
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "salesTotal" DECIMAL(12,2),
    "note" TEXT,
    "reportedToTreasury" BOOLEAN NOT NULL DEFAULT false,
    "treasuryAmount" DECIMAL(12,2),
    "treasuryTransactionId" TEXT,
    CONSTRAINT "BuffetCashSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BuffetSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdByUid" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuffetSale_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BuffetSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "BuffetSaleItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BuffetStockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "saleId" TEXT,
    "note" TEXT,
    "createdByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuffetStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Buffet_clubId_key" ON "Buffet"("clubId");
CREATE INDEX "Buffet_companyId_idx" ON "Buffet"("companyId");
CREATE INDEX "BuffetProduct_companyId_clubId_idx" ON "BuffetProduct"("companyId", "clubId");
CREATE INDEX "BuffetCashSession_companyId_clubId_status_idx" ON "BuffetCashSession"("companyId", "clubId", "status");
CREATE INDEX "BuffetCashSession_clubId_openedAt_idx" ON "BuffetCashSession"("clubId", "openedAt");
CREATE INDEX "BuffetSale_sessionId_idx" ON "BuffetSale"("sessionId");
CREATE INDEX "BuffetSale_clubId_createdAt_idx" ON "BuffetSale"("clubId", "createdAt");
CREATE INDEX "BuffetSaleItem_saleId_idx" ON "BuffetSaleItem"("saleId");
CREATE INDEX "BuffetSaleItem_productId_idx" ON "BuffetSaleItem"("productId");
CREATE INDEX "BuffetStockMovement_productId_createdAt_idx" ON "BuffetStockMovement"("productId", "createdAt");
CREATE INDEX "BuffetStockMovement_clubId_createdAt_idx" ON "BuffetStockMovement"("clubId", "createdAt");

ALTER TABLE "Buffet" ADD CONSTRAINT "Buffet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Buffet" ADD CONSTRAINT "Buffet_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetProduct" ADD CONSTRAINT "BuffetProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetProduct" ADD CONSTRAINT "BuffetProduct_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetCashSession" ADD CONSTRAINT "BuffetCashSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetCashSession" ADD CONSTRAINT "BuffetCashSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSale" ADD CONSTRAINT "BuffetSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSale" ADD CONSTRAINT "BuffetSale_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSale" ADD CONSTRAINT "BuffetSale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuffetCashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSaleItem" ADD CONSTRAINT "BuffetSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "BuffetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSaleItem" ADD CONSTRAINT "BuffetSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "BuffetProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuffetStockMovement" ADD CONSTRAINT "BuffetStockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetStockMovement" ADD CONSTRAINT "BuffetStockMovement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetStockMovement" ADD CONSTRAINT "BuffetStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "BuffetProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
