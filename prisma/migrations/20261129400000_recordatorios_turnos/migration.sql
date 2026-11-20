-- Recordatorios de turnos: push automático (3 h antes) y WhatsApp desde la consola
ALTER TABLE "Booking" ADD COLUMN "reminderPushAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "whatsappRemindedAt" TIMESTAMP(3);
CREATE INDEX "Booking_startsAt_idx" ON "Booking"("startsAt");
