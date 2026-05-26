-- Add DEBT_WRITE_OFF enum value used by the "yo'qolgan o'quvchi" write-off flow.
-- New TransactionType written by DebtWriteOffService when an admin clears the
-- current-cycle debt of a student who never attended any lesson in this cycle.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DEBT_WRITE_OFF';
