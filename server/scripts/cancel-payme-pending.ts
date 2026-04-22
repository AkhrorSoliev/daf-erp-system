import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const studentId = 10045;
  const now = BigInt(Date.now());

  const result = await prisma.paymeTransaction.updateMany({
    where: { studentId, state: 1 },
    data: { state: -1, cancelTime: now, reason: 3 },
  });

  console.log(`Bekor qilingan pending tranzaksiyalar: ${result.count}`);

  const remaining = await prisma.paymeTransaction.count({
    where: { studentId, state: 1 },
  });
  console.log(`Qolgan pending: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
