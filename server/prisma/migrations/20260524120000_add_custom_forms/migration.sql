-- CreateTable
CREATE TABLE "CustomForm" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "successMessage" TEXT,
    "sectionId" TEXT NOT NULL,
    "sourceId" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "CustomForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "leadId" TEXT,
    "data" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomForm_slug_key" ON "CustomForm"("slug");

-- CreateIndex
CREATE INDEX "CustomForm_slug_idx" ON "CustomForm"("slug");

-- CreateIndex
CREATE INDEX "CustomForm_companyId_idx" ON "CustomForm"("companyId");

-- CreateIndex
CREATE INDEX "CustomForm_sectionId_idx" ON "CustomForm"("sectionId");

-- CreateIndex
CREATE INDEX "CustomForm_deletedAt_idx" ON "CustomForm"("deletedAt");

-- CreateIndex
CREATE INDEX "CustomFormSubmission_formId_idx" ON "CustomFormSubmission"("formId");

-- CreateIndex
CREATE INDEX "CustomFormSubmission_leadId_idx" ON "CustomFormSubmission"("leadId");

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "LeadSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFormSubmission" ADD CONSTRAINT "CustomFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFormSubmission" ADD CONSTRAINT "CustomFormSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
