-- Conciliación bancaria: extractos y movimientos.
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "matchedFeeId" TEXT,
    "transactionId" TEXT,
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankStatement_companyId_clubId_idx" ON "BankStatement"("companyId", "clubId");
CREATE UNIQUE INDEX "BankMovement_clubId_hash_key" ON "BankMovement"("clubId", "hash");
CREATE INDEX "BankMovement_companyId_clubId_status_idx" ON "BankMovement"("companyId", "clubId", "status");
CREATE INDEX "BankMovement_statementId_idx" ON "BankMovement"("statementId");

ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
