-- Ojo: borra pedidos, productos y comercios de la tienda.
DROP TABLE IF EXISTS "StoreOrderItem";
DROP TABLE IF EXISTS "StoreOrder";
DROP TABLE IF EXISTS "StoreProduct";
DROP TABLE IF EXISTS "ClubStoreSettings";
DROP TABLE IF EXISTS "CommissionRule";
DROP FUNCTION IF EXISTS "commission_rule_is_immutable"();
DROP TABLE IF EXISTS "MerchantPaymentAccount";
DROP TABLE IF EXISTS "MerchantInvitation";
DROP TABLE IF EXISTS "MerchantMember";
DROP TABLE IF EXISTS "Merchant";
DROP TYPE IF EXISTS "CommissionStatus";
DROP TYPE IF EXISTS "StoreOrderStatus";
DROP TYPE IF EXISTS "CommissionScope";
DROP TYPE IF EXISTS "MerchantRole";
DROP TYPE IF EXISTS "MerchantStatus";
ALTER TABLE "PlatformSettings"
  DROP COLUMN IF EXISTS "commissionPlatformMin",
  DROP COLUMN IF EXISTS "commissionPlatformMax",
  DROP COLUMN IF EXISTS "commissionClubMin",
  DROP COLUMN IF EXISTS "commissionClubMax";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261024000000_store_merchants_commissions';
