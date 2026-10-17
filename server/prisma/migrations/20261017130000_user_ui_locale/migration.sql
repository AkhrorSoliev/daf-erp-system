-- Xodimning interfeys tili (ADR-0098). null = «uz» (boshlang'ich).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uiLocale" TEXT;
