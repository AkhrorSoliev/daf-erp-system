-- Bitta studentda bir nechta ACTIVE enrollment bo'lsa, faqat eng yangisini qoldirish
-- Qolganlarini TRANSFERRED ga o'tkazish
UPDATE "Enrollment" e
SET "status" = 'TRANSFERRED',
    "statusChangedAt" = NOW(),
    "statusChangeReason" = 'Tizim tomonidan tozalandi: faqat bitta guruhda bo''lish qoidasi'
FROM (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "studentId" ORDER BY "createdAt" DESC) AS rn
    FROM "Enrollment"
    WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL
  ) ranked
  WHERE rn > 1
) duplicates
WHERE e.id = duplicates.id;

-- Bitta studentda faqat bitta ACTIVE enrollment bo'lishi mumkin
CREATE UNIQUE INDEX "unique_active_enrollment_per_student"
ON "Enrollment" ("studentId")
WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
