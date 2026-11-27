-- Entrenador a cargo de cada sesión de entrenamiento (puede diferir del DT del plantel).
ALTER TABLE "TrainingSession" ADD COLUMN "coachName" TEXT;
