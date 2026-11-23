-- "Mi plan" del club: datos de cobro de Fluxion y pedidos del club (más usuarios, packs, alta, aviso de pago).
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentAlias" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentCbu" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentHolder" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentBank" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentCuit" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentNote" TEXT;

CREATE TYPE "PlanRequestKind" AS ENUM ('ACTIVATION', 'EXTRA_USERS', 'INTEGRATIONS', 'BUFFET', 'PAYMENT');
CREATE TYPE "PlanRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PlanRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "PlanRequestKind" NOT NULL,
    "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "extraBlocks" INTEGER,
    "invoiceId" TEXT,
    "amount" DECIMAL(12,2),
    "reference" TEXT,
    "note" TEXT,
    "createdByUid" TEXT NOT NULL,
    "createdByName" TEXT,
    "resolvedByUid" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanRequest_clubId_createdAt_idx" ON "PlanRequest"("clubId", "createdAt");
CREATE INDEX "PlanRequest_status_createdAt_idx" ON "PlanRequest"("status", "createdAt");
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
