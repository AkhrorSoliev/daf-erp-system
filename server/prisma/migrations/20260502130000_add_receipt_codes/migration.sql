-- Add unique receipt-code columns to Payment + Refund. Codes are
-- lazily allocated on first PDF render via the Contract pattern
-- (max + 1 within company + year), so existing rows stay NULL until
-- someone opens their receipt.

ALTER TABLE "Payment" ADD COLUMN "receiptCode" TEXT;
CREATE UNIQUE INDEX "Payment_receiptCode_key" ON "Payment"("receiptCode");

ALTER TABLE "Refund" ADD COLUMN "receiptCode" TEXT;
CREATE UNIQUE INDEX "Refund_receiptCode_key" ON "Refund"("receiptCode");
