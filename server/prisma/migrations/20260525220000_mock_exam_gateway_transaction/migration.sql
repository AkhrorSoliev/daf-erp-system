-- CreateTable
CREATE TABLE "MockExamGatewayTransaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "mockParticipantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountInSom" INTEGER NOT NULL,
    "state" INTEGER NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "clickPaydocId" BIGINT,
    "paymeTime" BIGINT,
    "error" INTEGER,
    "errorNote" TEXT,
    "reason" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "MockExamGatewayTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockExamGatewayTransaction_mockParticipantId_idx" ON "MockExamGatewayTransaction"("mockParticipantId");

-- CreateIndex
CREATE INDEX "MockExamGatewayTransaction_state_idx" ON "MockExamGatewayTransaction"("state");

-- CreateIndex
CREATE INDEX "MockExamGatewayTransaction_createdAt_idx" ON "MockExamGatewayTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "MockExamGatewayTransaction_companyId_idx" ON "MockExamGatewayTransaction"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamGatewayTransaction_provider_externalId_companyId_key" ON "MockExamGatewayTransaction"("provider", "externalId", "companyId");

-- AddForeignKey
ALTER TABLE "MockExamGatewayTransaction" ADD CONSTRAINT "MockExamGatewayTransaction_mockParticipantId_fkey" FOREIGN KEY ("mockParticipantId") REFERENCES "MockExamParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamGatewayTransaction" ADD CONSTRAINT "MockExamGatewayTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
