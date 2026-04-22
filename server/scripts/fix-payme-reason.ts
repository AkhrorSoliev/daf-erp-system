import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const paymeId = '69e58e755e5e8dad8f3b7ac4';

  const before = await prisma.paymeTransaction.findFirst({
    where: { paymeId },
    select: { id: true, paymeId: true, state: true, reason: true },
  });
  console.log('Oldin:', before);

  const result = await prisma.paymeTransaction.updateMany({
    where: { paymeId, state: -1, reason: 4 },
    data: { reason: 3 },
  });
  console.log(`Yangilangan yozuvlar: ${result.count}`);

  const after = await prisma.paymeTransaction.findFirst({
    where: { paymeId },
    select: { id: true, paymeId: true, state: true, reason: true },
  });
  console.log('Keyin:', after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
