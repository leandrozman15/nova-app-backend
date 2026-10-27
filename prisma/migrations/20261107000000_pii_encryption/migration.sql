-- Cifrado de datos personales: columnas para el índice ciego del DNI y la fecha de nacimiento cifrada.
ALTER TABLE "Player" ADD COLUMN "dniHash" TEXT, ADD COLUMN "birthDateEnc" TEXT;
ALTER TABLE "Member" ADD COLUMN "dniHash" TEXT, ADD COLUMN "birthDateEnc" TEXT;

-- La unicidad pasa del DNI en claro al índice ciego (el DNI queda cifrado).
DROP INDEX IF EXISTS "Player_companyId_dni_key";
DROP INDEX IF EXISTS "Member_companyId_dni_key";
CREATE UNIQUE INDEX "Player_companyId_dniHash_key" ON "Player"("companyId", "dniHash");
CREATE UNIQUE INDEX "Member_companyId_dniHash_key" ON "Member"("companyId", "dniHash");
