-- WhatsApp del club (botones con mensaje armado en la app pública)
ALTER TABLE "Club" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Club" ADD COLUMN "whatsappPublic" BOOLEAN NOT NULL DEFAULT true;
