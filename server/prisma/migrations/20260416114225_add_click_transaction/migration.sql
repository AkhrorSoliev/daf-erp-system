-- CreateTable
CREATE TABLE "ClickTransaction" (
    "id" TEXT NOT NULL,
    "clickTransId" BIGINT NOT NULL,
    "clickPaydocId" BIGINT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountInSom" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "error" INTEGER NOT NULL DEFAULT 0,
    "errorNote" TEXT,
    "studentId" INTEGER NOT NULL,
    "prepareTime" TIMESTAMP(3),
    "completeTime" TIMESTAMP(3),
    "paymentId" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClickTransaction_paymentId_key" ON "ClickTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "ClickTransaction_companyId_createdAt_idx" ON "ClickTransaction"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ClickTransaction_studentId_idx" ON "ClickTransaction"("studentId");

-- CreateIndex
CREATE INDEX "ClickTransaction_status_idx" ON "ClickTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClickTransaction_clickTransId_companyId_key" ON "ClickTransaction"("clickTransId", "companyId");
