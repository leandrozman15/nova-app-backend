-- Perfil del usuario libre: teléfono, ciudad y deportes que juega.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "sports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
