-- Add REVERSED status to PaymentStatus enum.
-- This allows marking payments that have been reversed via the append-only ledger.
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';
