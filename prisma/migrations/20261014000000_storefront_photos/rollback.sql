-- Revierte 20261014000000_storefront_photos (los archivos en Storage no se borran).
ALTER TABLE "Facility" DROP COLUMN IF EXISTS "photos";
ALTER TABLE "Club" DROP COLUMN IF EXISTS "coverUrl";
