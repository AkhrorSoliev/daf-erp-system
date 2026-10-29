ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'BANK_FEES';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_cashAccountId_idx" ON "Expense"("cashAccountId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashAccountId_fkey"
  FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
