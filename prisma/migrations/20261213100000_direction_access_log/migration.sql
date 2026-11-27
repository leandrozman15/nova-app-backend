-- "in" | "out": detectada sola según el último fichaje del atleta ese día.
ALTER TABLE "AccessLog" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'in';
