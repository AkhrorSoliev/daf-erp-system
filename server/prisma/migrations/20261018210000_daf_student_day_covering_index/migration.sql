-- DafStudentDay: haftalik reyting uchun qamrab oluvchi indeks (ADR-0111).
-- Prisma INCLUDE'ni ifodalay olmaydi, shuning uchun qo'lda yozilgan. Sxemadagi
-- (companyId, day) indeksi o'zgarmaydi; bu qo'shimcha. Reja Index Only Scan
-- ishlatadi: jadvalga (heap) tegmasdan studentId va points o'qiladi.
CREATE INDEX IF NOT EXISTS "DafStudentDay_companyId_day_cover_idx"
  ON "DafStudentDay" ("companyId", "day") INCLUDE ("studentId", "points");
