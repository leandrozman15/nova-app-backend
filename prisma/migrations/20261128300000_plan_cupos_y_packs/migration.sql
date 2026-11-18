-- Cupo de atletas y packs (buffet, integraciones) en los planes y suscripciones de los clubes.
ALTER TABLE "SubscriptionPlan" ADD COLUMN "includedAthletes" INTEGER NOT NULL DEFAULT 250;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "extraBlockSize" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "extraBlockPrice" DECIMAL(12,2) NOT NULL DEFAULT 10000;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "buffetPackPrice" DECIMAL(12,2) NOT NULL DEFAULT 15000;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "integrationsPackPrice" DECIMAL(12,2) NOT NULL DEFAULT 15000;

ALTER TABLE "ClubSubscription" ADD COLUMN "extraBlocks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClubSubscription" ADD COLUMN "buffetPack" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClubSubscription" ADD COLUMN "integrationsPack" BOOLEAN NOT NULL DEFAULT false;

-- Las suscripciones que ya existían conservan lo que usaban: buffet e integraciones activos.
UPDATE "ClubSubscription" SET "buffetPack" = true, "integrationsPack" = true;
