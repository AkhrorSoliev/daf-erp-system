-- Xodimning dizayn uslubi (ADR-0101). null = «daftar» (boshlang'ich).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uiSkin" TEXT;
