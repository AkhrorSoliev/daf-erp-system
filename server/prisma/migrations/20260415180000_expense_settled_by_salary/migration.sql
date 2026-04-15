-- Add Expense.settledBySalaryPaymentId so TEACHER_ADVANCE rows can be netted
-- out of the next salary run without being picked up twice.
-- Legacy rows stay NULL (unsettled). Salary calculation sets this when an
-- advance is absorbed.

ALTER TABLE "Expense" ADD COLUMN "settledBySalaryPaymentId" TEXT;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_settledBySalaryPaymentId_fkey"
  FOREIGN KEY ("settledBySalaryPaymentId")
  REFERENCES "SalaryPayment"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "Expense_settledBySalaryPaymentId_idx"
  ON "Expense"("settledBySalaryPaymentId");
