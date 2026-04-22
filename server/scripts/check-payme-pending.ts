import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const studentId = 10045;
  const txns = await prisma.paymeTransaction.findMany({
    where: { studentId, state: 1 },
    orderBy: { createTime: 'desc' },
  });

  console.log(`Student ${studentId} uchun pending (state=1) tranzaksiyalar: ${txns.length}`);
  for (const t of txns) {
    const createMs = Number(t.createTime);
    const ageMin = Math.floor((Date.now() - createMs) / 60000);
    console.log(
      `  id=${t.id} paymeId=${t.paymeId} amount=${t.amount} companyId=${t.companyId} createdAt=${new Date(createMs).toISOString()} (${ageMin} min oldin)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
