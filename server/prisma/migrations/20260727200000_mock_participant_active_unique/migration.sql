-- ================================================================================
-- MockExamParticipant: plain (examId, publicId) unique → PARTIAL unique scoped
-- to deletedAt IS NULL.
--
-- Ishtirokchini o'chirish soft-delete (`deletedAt` qo'yiladi, qator qoladi).
-- Oddiy unikal indeks o'chirilgan qatorlarni ham sanaydi, shuning uchun admin
-- ishtirokchini o'chirgach, o'sha odam O'SHA imtihonga boshqa hech qachon
-- ro'yxatdan o'ta olmasdi — bot "Siz allaqachon ro'yxatga olingansiz" deb
-- qaytaraverardi. O'chirish odamning o'rnini haqiqatan bo'shatishi kerak.
--
-- Xuddi shu naqsh loyihada allaqachon ishlatilgan:
-- `lesson_cancellation_active_unique` (20260428010035).
-- ================================================================================

-- Eski oddiy unikal cheklovni olib tashlash (constraint yoki index ko'rinishida
-- bo'lishi mumkin — ikkalasini ham urinib ko'ramiz).
ALTER TABLE "MockExamParticipant"
  DROP CONSTRAINT IF EXISTS "MockExamParticipant_examId_publicId_key";
DROP INDEX IF EXISTS "MockExamParticipant_examId_publicId_key";

-- Faol (o'chirilmagan) ishtirokchilar orasida yagonalik.
CREATE UNIQUE INDEX IF NOT EXISTS "mock_participant_active_unique"
  ON "MockExamParticipant" ("examId", "publicId")
  WHERE "deletedAt" IS NULL;

-- O'qish yo'li tez qolishi uchun oddiy indeks (o'chirilganlarni ham qamraydi —
-- masalan admin arxivni ko'rganda).
CREATE INDEX IF NOT EXISTS "MockExamParticipant_examId_publicId_idx"
  ON "MockExamParticipant" ("examId", "publicId");
