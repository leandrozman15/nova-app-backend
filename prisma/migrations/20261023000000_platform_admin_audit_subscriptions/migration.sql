-- Rol de plataforma, auditoría inmutable y suscripciones de clubes a Fluxion.
CREATE TABLE "PlatformAdmin" (
  "id" TEXT NOT NULL,
  "firebaseUid" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'SUPERADMIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformAdmin_firebaseUid_key" ON "PlatformAdmin"("firebaseUid");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUid" TEXT NOT NULL,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorUid_idx" ON "AuditLog"("actorUid");

-- Inmutable en la base: nadie (ni la API) puede editar o borrar registros de auditoría.
CREATE OR REPLACE FUNCTION "audit_log_is_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es inmutable: no se puede % registros', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_is_immutable"();
CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_is_immutable"();

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthlyPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

CREATE TABLE "ClubSubscription" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "customPrice" DECIMAL(12,2),
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "billingDay" INTEGER NOT NULL DEFAULT 10,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspendedReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClubSubscription_billingDay_check" CHECK ("billingDay" BETWEEN 1 AND 28)
);
CREATE UNIQUE INDEX "ClubSubscription_clubId_key" ON "ClubSubscription"("clubId");
CREATE INDEX "ClubSubscription_status_idx" ON "ClubSubscription"("status");
ALTER TABLE "ClubSubscription" ADD CONSTRAINT "ClubSubscription_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubSubscription" ADD CONSTRAINT "ClubSubscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'VOID');

CREATE TABLE "SubscriptionInvoice" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "paymentMethod" TEXT,
  "paymentRef" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionInvoice_subscriptionId_period_key" ON "SubscriptionInvoice"("subscriptionId", "period");
CREATE INDEX "SubscriptionInvoice_status_dueDate_idx" ON "SubscriptionInvoice"("status", "dueDate");
CREATE INDEX "SubscriptionInvoice_clubId_period_idx" ON "SubscriptionInvoice"("clubId", "period");
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "ClubSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
