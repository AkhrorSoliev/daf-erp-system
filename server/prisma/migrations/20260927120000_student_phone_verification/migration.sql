-- O'quvchi telefonini SMS orqali tasdiqlash (ADR-0039).
-- `verifiedPhone` — tasdiqlangan raqamning O'ZI: raqam faqat u `phone` ga
-- teng bo'lganda tasdiqlangan hisoblanadi.
ALTER TABLE "Student"
  ADD COLUMN "verifiedPhone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Parolini SMS orqali tiklagan o'quvchi raqamini allaqachon isbotlagan —
-- undan yana SMS so'ralmaydi. Tiklash jurnalda `parol: 'SMS orqali tiklandi'`
-- bo'lib yozilgan, lekin kod qaysi raqamga ketgani yozilmagan. Shuning uchun
-- faqat javob aniq bo'lgan o'quvchi belgilanadi:
--   * hisobning 9 xonali kirish raqamlari (login, phone) faqat karta raqami —
--     kod boshqa raqamga ketgan bo'lishi mumkin emas;
--   * tiklashdan keyin kartaning raqami o'zgarmagan.
-- Qolganlar ilovada bir marta SMS kod bilan tasdiqlaydi — bu xato emas,
-- shunchaki bitta SMS.
WITH last_sms_reset AS (
  SELECT "entityId", MAX("createdAt") AS "at"
  FROM "EntityHistory"
  WHERE "entityType" = 'Student'
    AND "newValues" ->> 'parol' = 'SMS orqali tiklandi'
  GROUP BY "entityId"
)
UPDATE "Student" s
SET "verifiedPhone" = s."phone",
    "phoneVerifiedAt" = r."at"
FROM last_sms_reset r, "User" u
WHERE r."entityId" = s."id"::text
  AND u."id" = s."userId"
  AND s."deletedAt" IS NULL
  AND s."phone" ~ '^[0-9]{9}$'
  AND (u."login" = s."phone" OR u."phone" = s."phone")
  AND (u."login" IS NULL OR u."login" !~ '^[0-9]{9}$' OR u."login" = s."phone")
  AND (u."phone" IS NULL OR u."phone" !~ '^[0-9]{9}$' OR u."phone" = s."phone")
  AND NOT EXISTS (
    SELECT 1
    FROM "EntityHistory" h
    WHERE h."entityType" = 'Student'
      AND h."entityId" = s."id"::text
      AND h."createdAt" > r."at"
      AND h."newValues" ? 'phone'
  );
