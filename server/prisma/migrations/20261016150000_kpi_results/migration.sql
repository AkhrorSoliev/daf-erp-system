-- KPI results (ADR-0095): stage 2 of the admin KPI, no money. Idempotent,
-- like the other hand-written migrations here.
DO $$
BEGIN
  CREATE TYPE "LeadConversionKind" AS ENUM ('NEW_STUDENT', 'RETURNING', 'ALREADY_STUDYING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiResultType" AS ENUM ('LEAD_PAID', 'PROMISE_KEPT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiResultStatus" AS ENUM ('ACTIVE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiRuleMode" AS ENUM ('FIXED', 'PERCENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "conversionKind" "LeadConversionKind";

ALTER TABLE "PaymentPromise" ADD COLUMN IF NOT EXISTS "resolvedPaymentId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymentPromise_resolvedPaymentId_idx" ON "PaymentPromise"("resolvedPaymentId");

CREATE TABLE IF NOT EXISTS "KpiResult" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "userId" INTEGER NOT NULL,
  "type" "KpiResultType" NOT NULL,
  "leadId" TEXT,
  "promiseId" TEXT,
  "studentId" INTEGER NOT NULL,
  "paymentId" TEXT NOT NULL,
  "paymentAmount" INTEGER NOT NULL,
  "baseAmount" INTEGER NOT NULL,
  "ruleMode" "KpiRuleMode" NOT NULL,
  "ruleValue" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" "KpiResultStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "replacesResultId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KpiResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KpiResult_companyId_month_idx" ON "KpiResult"("companyId", "month");
CREATE INDEX IF NOT EXISTS "KpiResult_userId_month_idx" ON "KpiResult"("userId", "month");
CREATE INDEX IF NOT EXISTS "KpiResult_paymentId_idx" ON "KpiResult"("paymentId");

-- One ACTIVE result per lead, per payment (LEAD_PAID) and per promise
-- (PROMISE_KEPT). A second concurrent insert fails with P2002 and is skipped.
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_lead_key"
  ON "KpiResult"("leadId") WHERE "status" = 'ACTIVE' AND "type" = 'LEAD_PAID';
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_lead_payment_key"
  ON "KpiResult"("paymentId") WHERE "status" = 'ACTIVE' AND "type" = 'LEAD_PAID';
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_promise_key"
  ON "KpiResult"("promiseId") WHERE "status" = 'ACTIVE' AND "type" = 'PROMISE_KEPT';
