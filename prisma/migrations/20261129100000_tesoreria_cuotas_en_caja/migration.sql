-- Tesorería: cada cuota cobrada a mano deja un solo ingreso en caja (referencia fee:<cuota>).
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialTransaction_fee_reference_key"
  ON "FinancialTransaction"("reference")
  WHERE "reference" LIKE 'fee:%';
