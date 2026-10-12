-- Fotos de la vidriera: portada del club y galería por instalación.
ALTER TABLE "Club" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "Facility" ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
