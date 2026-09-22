-- DaF ilovasi faollik normasi (dizayn 2026-09-20, 4-bo'lim).
-- Standart 10 daqiqa / 12 savol / haftada 4 kun (yashil) / 2 kun (sariq).
ALTER TABLE "Company"
  ADD COLUMN "dafKunlikDaqiqa" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "dafKunlikSavol" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "dafHaftalikKun" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "dafSariqKun" INTEGER NOT NULL DEFAULT 2;
