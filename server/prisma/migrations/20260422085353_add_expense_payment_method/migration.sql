-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'CARD');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH';
