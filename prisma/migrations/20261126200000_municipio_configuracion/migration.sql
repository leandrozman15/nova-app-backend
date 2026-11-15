-- Configuración del municipio: identidad y contacto de la secretaría.
ALTER TABLE "Municipality"
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "secretariaName" TEXT,
  ADD COLUMN "responsibleName" TEXT,
  ADD COLUMN "responsibleRole" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "facebook" TEXT,
  ADD COLUMN "instagram" TEXT;
