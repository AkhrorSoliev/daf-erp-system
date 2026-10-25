-- Sayt lidlari bo'limi: tizim bo'limi o'chirilmaydi (LeadSection.systemKey).
ALTER TABLE "LeadSection" ADD COLUMN IF NOT EXISTS "systemKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "LeadSection_columnId_systemKey_key" ON "LeadSection"("columnId", "systemKey");
