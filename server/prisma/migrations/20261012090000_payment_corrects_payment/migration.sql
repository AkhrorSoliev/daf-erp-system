-- B4: a correction's new payment points at the payment it corrects; the To'lovlar page reads a payment's ledger rows by paymentId.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "correctsPaymentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_correctsPaymentId_key" ON "Payment"("correctsPaymentId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctsPaymentId_fkey" FOREIGN KEY ("correctsPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Transaction_paymentId_idx" ON "Transaction"("paymentId");
