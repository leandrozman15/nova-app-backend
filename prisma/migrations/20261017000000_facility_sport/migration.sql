-- Deporte de cada cancha/espacio (catálogo de la app), para los filtros de la vidriera.
ALTER TABLE "Facility" ADD COLUMN "sport" TEXT;
CREATE INDEX "Facility_sport_idx" ON "Facility"("sport");
