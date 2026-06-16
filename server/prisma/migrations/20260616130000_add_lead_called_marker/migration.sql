-- Lightweight "call made" marker on a lead. Set when an admin logs a call from
-- the lead detail drawer; drives the phone icon on the board card.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "calledAt" TIMESTAMP(3),
ADD COLUMN     "calledById" INTEGER;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
