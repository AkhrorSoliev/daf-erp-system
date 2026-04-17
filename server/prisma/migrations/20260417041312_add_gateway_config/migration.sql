-- CreateTable
CREATE TABLE "PaymentGatewayConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "merchantId" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "secretKeyTest" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayConfig_companyId_provider_key" ON "PaymentGatewayConfig"("companyId", "provider");
