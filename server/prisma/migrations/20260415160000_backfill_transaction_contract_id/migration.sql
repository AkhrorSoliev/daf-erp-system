-- Backfill Transaction.contractId for rows written before Phase C.1 wired
-- contractId through recordPayment / deductLessonFee / recordRefund.
--
-- Strategy:
--   * LESSON_DEDUCTION: link by enrollment → active contract on same group
--     (studentId + groupId). Uses the enrollment row referenced by the
--     transaction's enrollmentId; falls back to the student's active
--     contract if the enrollment is gone.
--   * REFUND: link via refundId → Refund.contractId (always present).
--   * PAYMENT: link via paymentId → Payment.contractId when set.
--
-- Safe to run more than once — only updates rows where contractId IS NULL.

-- REFUND transactions: Refund always has contractId.
UPDATE "Transaction" t
SET "contractId" = r."contractId"
FROM "Refund" r
WHERE t."refundId" = r."id"
  AND t."contractId" IS NULL;

-- PAYMENT transactions: Payment may or may not have contractId.
UPDATE "Transaction" t
SET "contractId" = p."contractId"
FROM "Payment" p
WHERE t."paymentId" = p."id"
  AND p."contractId" IS NOT NULL
  AND t."contractId" IS NULL;

-- LESSON_DEDUCTION via enrollment → contract (same student + group, ACTIVE).
UPDATE "Transaction" t
SET "contractId" = c."id"
FROM "Enrollment" e
JOIN "Contract" c
  ON c."studentId" = e."studentId"
 AND c."groupId" = e."groupId"
 AND c."status" = 'ACTIVE'
 AND c."deletedAt" IS NULL
WHERE t."enrollmentId" = e."id"
  AND t."type" = 'LESSON_DEDUCTION'
  AND t."contractId" IS NULL;

-- Fallback for LESSON_DEDUCTION rows whose enrollment was hard-deleted:
-- match by studentId + whatever ACTIVE contract exists.
UPDATE "Transaction" t
SET "contractId" = c."id"
FROM "Contract" c
WHERE c."studentId" = t."studentId"
  AND c."status" = 'ACTIVE'
  AND c."deletedAt" IS NULL
  AND t."type" = 'LESSON_DEDUCTION'
  AND t."contractId" IS NULL;
