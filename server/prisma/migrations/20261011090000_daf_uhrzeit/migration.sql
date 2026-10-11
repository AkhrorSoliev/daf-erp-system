-- Soat mashqi (u05-s1 «Wie spät ist es?»): bo'lim o'rgatadigan vaqtlar.
-- Nemischa matn kodda hisoblanadi (`uhrzeit-text.ts`), bu yerda faqat vaqt.
CREATE TABLE IF NOT EXISTS "DafUhrzeit" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "zeit" TEXT NOT NULL,
    "audioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafUhrzeit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DafUhrzeit_sectionId_zeit_key" ON "DafUhrzeit"("sectionId", "zeit");

DO $$
BEGIN
  ALTER TABLE "DafUhrzeit" ADD CONSTRAINT "DafUhrzeit_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
