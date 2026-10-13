-- Etapa 2 de la salida de Firestore: documentos por ruta.
CREATE TABLE "StoreDocument" (
  "id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "parentPath" TEXT NOT NULL,
  "collection" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "clubId" TEXT,
  "companyId" TEXT,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreDocument_path_key" ON "StoreDocument"("path");
CREATE INDEX "StoreDocument_parentPath_idx" ON "StoreDocument"("parentPath");
CREATE INDEX "StoreDocument_clubId_collection_idx" ON "StoreDocument"("clubId", "collection");
CREATE INDEX "StoreDocument_collection_idx" ON "StoreDocument"("collection");
