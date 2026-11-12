-- CreateTable
CREATE TABLE "ClubInvoicingAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL DEFAULT 'factura_c',
    "autoIssue" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClubInvoicingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "pointOfSale" INTEGER,
    "number" INTEGER,
    "cae" TEXT,
    "caeDueDate" TEXT,
    "pdfUrl" TEXT,
    "qrUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubInvoicingAccount_clubId_key" ON "ClubInvoicingAccount"("clubId");
CREATE INDEX "ClubInvoicingAccount_companyId_idx" ON "ClubInvoicingAccount"("companyId");
CREATE UNIQUE INDEX "PaymentInvoice_paymentId_key" ON "PaymentInvoice"("paymentId");
CREATE INDEX "PaymentInvoice_companyId_idx" ON "PaymentInvoice"("companyId");
CREATE INDEX "PaymentInvoice_clubId_idx" ON "PaymentInvoice"("clubId");

ALTER TABLE "ClubInvoicingAccount" ADD CONSTRAINT "ClubInvoicingAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentInvoice" ADD CONSTRAINT "PaymentInvoice_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
