-- Per-student discount system.
--
-- discountPercent is a 0–100 integer stored on Student. It is applied at
-- lesson-billing time: the LESSON_DEDUCTION amount charged from the student's
-- balance is reduced by `discountPercent`%, but the metadata still records the
-- full perLessonCost so SalaryAccrual continues to pay the teacher at the
-- un-discounted rate. The discount eats into the center's margin only.
--
-- DISCOUNT_ADJUSTMENT is a new TransactionType used to retroactively credit
-- (or debit) a student's balance when the discount is changed: the difference
-- between what was actually deducted historically and what should have been
-- deducted under the new discount is written as a single signed adjustment.
ALTER TABLE "Student"
  ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "TransactionType" ADD VALUE 'DISCOUNT_ADJUSTMENT';
