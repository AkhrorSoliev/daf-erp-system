-- Lidning ikkinchi aloqa raqami. Nullable: mavjud lidlarga tegmaydi va
-- o'quvchiga aylantirilganda Student.extraPhone ga ko'chadi.
ALTER TABLE "Lead" ADD COLUMN "extraPhone" TEXT;
