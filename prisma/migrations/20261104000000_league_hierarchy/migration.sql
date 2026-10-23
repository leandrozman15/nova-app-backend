ALTER TABLE "League" ADD COLUMN "parentId" TEXT;
CREATE INDEX "League_parentId_idx" ON "League"("parentId");
ALTER TABLE "League" ADD CONSTRAINT "League_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
