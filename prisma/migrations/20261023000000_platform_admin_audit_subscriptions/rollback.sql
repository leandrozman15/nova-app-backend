-- Ojo: borra la auditoría. Hacé un respaldo de "AuditLog" antes si querés conservarla.
DROP TABLE IF EXISTS "SubscriptionInvoice";
DROP TYPE IF EXISTS "SubscriptionInvoiceStatus";
DROP TABLE IF EXISTS "ClubSubscription";
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TABLE IF EXISTS "SubscriptionPlan";
DROP TABLE IF EXISTS "AuditLog";
DROP FUNCTION IF EXISTS "audit_log_is_immutable"();
DROP TABLE IF EXISTS "PlatformAdmin";
DELETE FROM "FinancialTransaction" WHERE "reference" LIKE 'fx-sub:%';
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023000000_platform_admin_audit_subscriptions';
