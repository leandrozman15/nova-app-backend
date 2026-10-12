-- Revierte 20261015000000_bookings_mercadopago. Borra reservas y cuentas conectadas.
DROP TABLE IF EXISTS "ClubPaymentAccount";
DROP TABLE IF EXISTS "Booking";
DROP TYPE IF EXISTS "BookingStatus";
ALTER TABLE "Facility" DROP COLUMN IF EXISTS "hourlyPrice", DROP COLUMN IF EXISTS "bookable";
ALTER TABLE "Club" DROP COLUMN IF EXISTS "depositPercent", DROP COLUMN IF EXISTS "timezone";
