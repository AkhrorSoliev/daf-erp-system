-- Add Refund.refundMethod so the channel used to return money (cash, Payme,
-- Click, Uzum, bank transfer) is auditable. Nullable — legacy rows stay as
-- NULL; the operator sets it when processing going forward.

ALTER TABLE "Refund" ADD COLUMN "refundMethod" "PaymentMethod";
