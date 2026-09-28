-- Mock imtihon to'lovining usuli, izohi va uni qo'lda qabul qilgan xodim.
--
-- «To'lov qabul qilish» oynasi to'lov turi va izohni so'rardi, lekin ular hech
-- qayerga yozilmasdi: tarix yozuvi `{ paid: false }` → `{ paid: true,
-- paymentMethod, paymentNote }` bo'lib berilardi, `computeChangedFields` esa
-- eski qiymatlarda yo'q kalitni tashlab yuboradi. Endi ular qatorning o'zida,
-- shuning uchun qabul qilingan to'lovni tahrirlash mumkin.
ALTER TABLE "MockExamParticipant"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "paymentNote" TEXT,
  ADD COLUMN "paidById" INTEGER;

-- AddForeignKey
ALTER TABLE "MockExamParticipant" ADD CONSTRAINT "MockExamParticipant_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1) Payme/Click orqali to'langanlar: yakunlangan (state = 2) shlyuz
--    tranzaksiyasi provayderni aniq aytadi.
UPDATE "MockExamParticipant" p
SET "paymentMethod" = g."provider"::"PaymentMethod"
FROM "MockExamGatewayTransaction" g
WHERE g."mockParticipantId" = p."id"
  AND g."state" = 2
  AND g."provider" IN ('PAYME', 'CLICK')
  AND p."paid" = true;

-- 2) Admin qo'lda qabul qilganlar: `paid` ni true qilgan eng oxirgi tarix
--    yozuvining muallifi. Usul tiklanmaydi — u hech qachon saqlanmagan; admin
--    uni «To'lovni tahrirlash» oynasida belgilaydi. Shlyuz (muallifsiz) va eski
--    balans to'lovlari chetda qoladi.
WITH last_paid AS (
  SELECT DISTINCT ON ("entityId") "entityId", "changedById"
  FROM "EntityHistory"
  WHERE "entityType" = 'MockExamParticipant'
    AND "action" = 'UPDATE'
    AND "newValues" ->> 'paid' = 'true'
  ORDER BY "entityId", "createdAt" DESC
)
UPDATE "MockExamParticipant" p
SET "paidById" = l."changedById"
FROM last_paid l
WHERE l."entityId" = p."id"
  AND l."changedById" IS NOT NULL
  AND p."paid" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "MockExamGatewayTransaction" g
    WHERE g."mockParticipantId" = p."id"
      AND g."state" = 2
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Transaction" t
    WHERE t."type" = 'MOCK_EXAM_FEE'
      AND t."reversedAt" IS NULL
      AND t."amount" < 0
      AND t."metadata" ->> 'mockParticipantId' = p."id"
  );
