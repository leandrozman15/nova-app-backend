-- CreateTable
CREATE TABLE "MunicipalProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MunicipalProjectAttachment_projectId_createdAt_idx" ON "MunicipalProjectAttachment"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "MunicipalProjectAttachment" ADD CONSTRAINT "MunicipalProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MunicipalProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
