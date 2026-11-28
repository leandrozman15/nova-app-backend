-- Historial de ELO de pádel: un punto por cada cambio, para poder graficar la evolución.
CREATE TABLE "PadelEloHistory" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "elo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelEloHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PadelEloHistory_profileId_createdAt_idx" ON "PadelEloHistory"("profileId", "createdAt");

ALTER TABLE "PadelEloHistory" ADD CONSTRAINT "PadelEloHistory_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "PadelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: un punto "histórico" por cada perfil ya existente, con su ELO actual,
-- para que el gráfico no arranque vacío (no había historial de partidos anteriores).
INSERT INTO "PadelEloHistory" ("id", "profileId", "elo", "reason", "createdAt")
SELECT gen_random_uuid()::text, "id", "elo", 'historico', "updatedAt"
FROM "PadelProfile";
