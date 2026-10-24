ALTER TABLE "Lead" ADD COLUMN "metaLeadId" TEXT;
CREATE UNIQUE INDEX "Lead_metaLeadId_key" ON "Lead"("metaLeadId");
