-- Tesorería de reservas online: una sola fila por pago de Mercado Pago
-- (ingreso mp:<pago>, comisión mp-fee:<pago>, devolución mp-refund:<pago>).
CREATE UNIQUE INDEX "FinancialTransaction_mp_reference_key"
  ON "FinancialTransaction"("reference")
  WHERE "reference" LIKE 'mp%:%';

-- Señas ya cobradas antes de este cambio (sin comisión: no la teníamos guardada).
INSERT INTO "FinancialTransaction"
  ("id", "companyId", "clubId", "type", "category", "amount", "currency", "occurredAt", "description", "reference", "updatedAt")
SELECT 'bkfill_in_' || b."id", b."companyId", b."clubId", 'income', 'Reservas online', b."depositAmount", b."currency",
       COALESCE(b."paidAt", b."createdAt"),
       'Seña de reserva · ' || f."name" || ' · ' || b."date" || ' ' || lpad(b."hour"::text, 2, '0') || ':00' || COALESCE(' · ' || b."contactName", ''),
       'mp:' || b."mpPaymentId", now()
FROM "Booking" b JOIN "Facility" f ON f."id" = b."facilityId"
WHERE b."mpPaymentId" IS NOT NULL AND (b."paidAt" IS NOT NULL OR b."refundedAt" IS NOT NULL)
ON CONFLICT DO NOTHING;

INSERT INTO "FinancialTransaction"
  ("id", "companyId", "clubId", "type", "category", "amount", "currency", "occurredAt", "description", "reference", "updatedAt")
SELECT 'bkfill_rf_' || b."id", b."companyId", b."clubId", 'expense', 'Devolución de señas', b."depositAmount", b."currency",
       b."refundedAt",
       'Devolución de seña · ' || f."name" || ' · ' || b."date" || ' ' || lpad(b."hour"::text, 2, '0') || ':00' || COALESCE(' · ' || b."contactName", ''),
       'mp-refund:' || b."mpPaymentId", now()
FROM "Booking" b JOIN "Facility" f ON f."id" = b."facilityId"
WHERE b."mpPaymentId" IS NOT NULL AND b."refundedAt" IS NOT NULL
ON CONFLICT DO NOTHING;
