-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- CreateTable
CREATE TABLE "ShopProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "images" JSONB,
    "sizes" JSONB,
    "sports" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "customerExternalId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productImage" TEXT,
    "size" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopProduct_companyId_idx" ON "ShopProduct"("companyId");
CREATE INDEX "ShopProduct_clubId_idx" ON "ShopProduct"("clubId");
CREATE INDEX "ShopProduct_companyId_clubId_idx" ON "ShopProduct"("companyId", "clubId");
CREATE INDEX "ShopOrder_companyId_idx" ON "ShopOrder"("companyId");
CREATE INDEX "ShopOrder_clubId_idx" ON "ShopOrder"("clubId");
CREATE INDEX "ShopOrder_productId_idx" ON "ShopOrder"("productId");
CREATE INDEX "ShopOrder_customerExternalId_idx" ON "ShopOrder"("customerExternalId");
CREATE INDEX "ShopOrder_companyId_clubId_idx" ON "ShopOrder"("companyId", "clubId");
CREATE INDEX "ShopOrder_companyId_customerExternalId_idx" ON "ShopOrder"("companyId", "customerExternalId");
CREATE INDEX "ShopOrder_companyId_status_idx" ON "ShopOrder"("companyId", "status");

-- AddForeignKey
ALTER TABLE "ShopProduct" ADD CONSTRAINT "ShopProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopProduct" ADD CONSTRAINT "ShopProduct_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;