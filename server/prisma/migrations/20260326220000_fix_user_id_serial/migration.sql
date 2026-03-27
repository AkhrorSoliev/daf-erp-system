-- User id column ni SERIAL ga o'zgartirish (autoincrement ishlashi uchun)
CREATE SEQUENCE IF NOT EXISTS "User_id_seq" OWNED BY "User"."id";
SELECT setval('"User_id_seq"', COALESCE((SELECT MAX(id) FROM "User"), 0) + 1, false);
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT nextval('"User_id_seq"');
