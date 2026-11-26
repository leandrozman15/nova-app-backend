-- Buffet: cobro con más de un medio de pago y consumos cargados a la cuenta de un alquiler.
ALTER TABLE "BuffetSale" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "BuffetSale" ADD COLUMN "accountStatus" TEXT;
ALTER TABLE "BuffetSale" ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE TABLE "BuffetSalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuffetSalePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuffetSale_bookingId_accountStatus_idx" ON "BuffetSale"("bookingId", "accountStatus");
CREATE INDEX "BuffetSalePayment_saleId_idx" ON "BuffetSalePayment"("saleId");
CREATE INDEX "BuffetSalePayment_sessionId_idx" ON "BuffetSalePayment"("sessionId");
CREATE INDEX "BuffetSalePayment_createdAt_idx" ON "BuffetSalePayment"("createdAt");

ALTER TABLE "BuffetSale" ADD CONSTRAINT "BuffetSale_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuffetSalePayment" ADD CONSTRAINT "BuffetSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "BuffetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuffetSalePayment" ADD CONSTRAINT "BuffetSalePayment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuffetCashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las ventas que ya existen se cobraron de una sola vez: una línea de pago por venta.
INSERT INTO "BuffetSalePayment" ("id", "saleId", "sessionId", "method", "amount", "createdAt")
SELECT 'bsp_' || "id", "id", "sessionId", "paymentMethod", "total", "createdAt" FROM "BuffetSale";
