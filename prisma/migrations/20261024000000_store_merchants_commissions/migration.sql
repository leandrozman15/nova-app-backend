-- Tienda de la app: comercios, invitaciones, cuentas de cobro, comisiones versionadas,
-- configuración de tienda por club, productos de comercios y pedidos con snapshot.

ALTER TABLE "PlatformSettings"
  ADD COLUMN "commissionPlatformMin" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionPlatformMax" DECIMAL(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN "commissionClubMin" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionClubMax" DECIMAL(5,2) NOT NULL DEFAULT 15;

CREATE TYPE "MerchantStatus" AS ENUM ('INVITADO', 'ACTIVO', 'SUSPENDIDO');
CREATE TYPE "MerchantRole" AS ENUM ('ADMIN_COMERCIO', 'OPERADOR');
CREATE TYPE "CommissionScope" AS ENUM ('GLOBAL', 'CLUB', 'MERCHANT');
CREATE TYPE "StoreOrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'AT_CLUB', 'DELIVERED', 'CANCELLED');
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'ACCRUED', 'VOID');

CREATE TABLE "Merchant" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT NOT NULL,
  "cuit" TEXT NOT NULL,
  "ivaCondition" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "description" TEXT,
  "logoUrl" TEXT,
  "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "MerchantStatus" NOT NULL DEFAULT 'INVITADO',
  "cuitVerifiedAt" TIMESTAMP(3),
  "cuitVerifiedByUid" TEXT,
  "cuitVerificationNote" TEXT,
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspendedReason" TEXT,
  "createdByUid" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Merchant_cuit_check" CHECK ("cuit" ~ '^[0-9]{11}$')
);
CREATE UNIQUE INDEX "Merchant_cuit_key" ON "Merchant"("cuit");
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

CREATE TABLE "MerchantMember" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MerchantRole" NOT NULL DEFAULT 'OPERADOR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantMember_merchantId_userId_key" ON "MerchantMember"("merchantId", "userId");
CREATE INDEX "MerchantMember_userId_idx" ON "MerchantMember"("userId");
ALTER TABLE "MerchantMember" ADD CONSTRAINT "MerchantMember_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantMember" ADD CONSTRAINT "MerchantMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MerchantInvitation" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "MerchantRole" NOT NULL DEFAULT 'ADMIN_COMERCIO',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdByUid" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantInvitation_tokenHash_key" ON "MerchantInvitation"("tokenHash");
CREATE INDEX "MerchantInvitation_merchantId_idx" ON "MerchantInvitation"("merchantId");
ALTER TABLE "MerchantInvitation" ADD CONSTRAINT "MerchantInvitation_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MerchantPaymentAccount" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "holderName" TEXT,
  "accountLabel" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantPaymentAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantPaymentAccount_merchantId_key" ON "MerchantPaymentAccount"("merchantId");
ALTER TABLE "MerchantPaymentAccount" ADD CONSTRAINT "MerchantPaymentAccount_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommissionRule" (
  "id" TEXT NOT NULL,
  "scope" "CommissionScope" NOT NULL,
  "clubId" TEXT,
  "merchantId" TEXT,
  "platformPercent" DECIMAL(5,2),
  "clubPercent" DECIMAL(5,2),
  "version" INTEGER NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "reason" TEXT,
  "createdByUid" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionRule_scope_check" CHECK (
    ("scope" = 'GLOBAL' AND "clubId" IS NULL AND "merchantId" IS NULL AND "platformPercent" IS NOT NULL AND "clubPercent" IS NOT NULL)
    OR ("scope" = 'CLUB' AND "clubId" IS NOT NULL AND "merchantId" IS NULL)
    OR ("scope" = 'MERCHANT' AND "merchantId" IS NOT NULL AND "clubId" IS NULL AND "platformPercent" IS NOT NULL AND "clubPercent" IS NULL)
  ),
  CONSTRAINT "CommissionRule_percent_check" CHECK (
    ("platformPercent" IS NULL OR "platformPercent" BETWEEN 0 AND 100)
    AND ("clubPercent" IS NULL OR "clubPercent" BETWEEN 0 AND 100)
  )
);
CREATE INDEX "CommissionRule_scope_clubId_merchantId_idx" ON "CommissionRule"("scope", "clubId", "merchantId");
-- Una sola versión vigente por alcance y números de versión únicos.
CREATE UNIQUE INDEX "CommissionRule_current_key" ON "CommissionRule"("scope", COALESCE("clubId", ''), COALESCE("merchantId", ''))
  WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "CommissionRule_version_key" ON "CommissionRule"("scope", COALESCE("clubId", ''), COALESCE("merchantId", ''), "version");

-- Las versiones no se editan ni se borran: solo se cierra la vigente (validTo).
CREATE OR REPLACE FUNCTION "commission_rule_is_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."validTo" IS NULL AND NEW."validTo" IS NOT NULL
     AND NEW."id" = OLD."id" AND NEW."scope" = OLD."scope"
     AND NEW."clubId" IS NOT DISTINCT FROM OLD."clubId"
     AND NEW."merchantId" IS NOT DISTINCT FROM OLD."merchantId"
     AND NEW."platformPercent" IS NOT DISTINCT FROM OLD."platformPercent"
     AND NEW."clubPercent" IS NOT DISTINCT FROM OLD."clubPercent"
     AND NEW."version" = OLD."version" AND NEW."validFrom" = OLD."validFrom"
     AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
     AND NEW."createdByUid" = OLD."createdByUid" AND NEW."createdAt" = OLD."createdAt" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'CommissionRule es inmutable: creá una versión nueva';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommissionRule_immutable"
  BEFORE UPDATE OR DELETE ON "CommissionRule"
  FOR EACH ROW EXECUTE FUNCTION "commission_rule_is_immutable"();

CREATE TABLE "ClubStoreSettings" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "acceptMerchants" BOOLEAN NOT NULL DEFAULT false,
  "excludedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "pickupHours" TEXT,
  "dailyCapacity" INTEGER,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubStoreSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClubStoreSettings_capacity_check" CHECK ("dailyCapacity" IS NULL OR "dailyCapacity" > 0)
);
CREATE UNIQUE INDEX "ClubStoreSettings_clubId_key" ON "ClubStoreSettings"("clubId");
ALTER TABLE "ClubStoreSettings" ADD CONSTRAINT "ClubStoreSettings_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreProduct" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreProduct_stock_check" CHECK ("stock" >= 0),
  CONSTRAINT "StoreProduct_price_check" CHECK ("price" >= 0)
);
CREATE INDEX "StoreProduct_merchantId_active_idx" ON "StoreProduct"("merchantId", "active");
CREATE INDEX "StoreProduct_category_idx" ON "StoreProduct"("category");
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreOrder" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "sellerType" TEXT NOT NULL,
  "merchantId" TEXT,
  "sellerClubId" TEXT,
  "pickupClubId" TEXT NOT NULL,
  "pickupCompanyId" TEXT NOT NULL,
  "status" "StoreOrderStatus" NOT NULL DEFAULT 'PLACED',
  "pickupCode" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerPhone" TEXT,
  "notes" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "paymentMode" TEXT NOT NULL DEFAULT 'coordinated',
  "platformPercent" DECIMAL(5,2) NOT NULL,
  "clubPercent" DECIMAL(5,2) NOT NULL,
  "platformAmount" DECIMAL(12,2) NOT NULL,
  "clubAmount" DECIMAL(12,2) NOT NULL,
  "sellerAmount" DECIMAL(12,2) NOT NULL,
  "commissionRules" JSONB,
  "commissionStatus" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "commissionAccruedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "receivedAtClubAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreOrder_seller_check" CHECK (
    ("sellerType" = 'MERCHANT' AND "merchantId" IS NOT NULL AND "sellerClubId" IS NULL)
    OR ("sellerType" = 'CLUB' AND "sellerClubId" IS NOT NULL AND "merchantId" IS NULL)
  ),
  CONSTRAINT "StoreOrder_split_check" CHECK ("clubPercent" <= "platformPercent")
);
CREATE UNIQUE INDEX "StoreOrder_code_key" ON "StoreOrder"("code");
CREATE INDEX "StoreOrder_buyerUserId_createdAt_idx" ON "StoreOrder"("buyerUserId", "createdAt");
CREATE INDEX "StoreOrder_merchantId_status_idx" ON "StoreOrder"("merchantId", "status");
CREATE INDEX "StoreOrder_pickupClubId_status_idx" ON "StoreOrder"("pickupClubId", "status");
CREATE INDEX "StoreOrder_sellerClubId_status_idx" ON "StoreOrder"("sellerClubId", "status");
CREATE INDEX "StoreOrder_commissionStatus_createdAt_idx" ON "StoreOrder"("commissionStatus", "createdAt");
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_buyerUserId_fkey"
  FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_pickupClubId_fkey"
  FOREIGN KEY ("pickupClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_sellerClubId_fkey"
  FOREIGN KEY ("sellerClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StoreOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "clubProductId" TEXT,
  "name" TEXT NOT NULL,
  "size" TEXT,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "StoreOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreOrderItem_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "StoreOrderItem_orderId_idx" ON "StoreOrderItem"("orderId");
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_clubProductId_fkey"
  FOREIGN KEY ("clubProductId") REFERENCES "ShopProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regla global inicial: 5% Fluxion, 2% de eso para el club de retiro (editable desde el panel).
INSERT INTO "CommissionRule" ("id", "scope", "platformPercent", "clubPercent", "version", "reason", "createdByUid")
VALUES ('commission-global-v1', 'GLOBAL', 5.00, 2.00, 1, 'Valor inicial', 'system');
