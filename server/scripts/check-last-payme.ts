import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('\n=== Oxirgi Payme to\'lovlar (eng yangisi birinchi) ===\n');

  const payments = await prisma.payment.findMany({
    where: { method: 'PAYME' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      studentId: true,
      amount: true,
      branchId: true,
      companyId: true,
      source: true,
      status: true,
      externalId: true,
      createdAt: true,
    },
  });

  for (const p of payments) {
    console.log(
      `  payment=${p.id.slice(0, 8)} student=${p.studentId} amount=${p.amount} branchId=${p.branchId ?? 'NULL ❌'} company=${p.companyId} source=${p.source} status=${p.status} createdAt=${p.createdAt.toISOString()}`,
    );
  }

  console.log('\n=== Oxirgi PaymeTransaction yozuvlar ===\n');

  const txns = await prisma.paymeTransaction.findMany({
    orderBy: { createTime: 'desc' },
    take: 5,
    select: {
      id: true,
      paymeId: true,
      studentId: true,
      amount: true,
      amountInSom: true,
      state: true,
      createTime: true,
      performTime: true,
      paymentId: true,
      companyId: true,
    },
  });

  for (const t of txns) {
    console.log(
      `  txn=${t.id.slice(0, 8)} paymeId=${t.paymeId} student=${t.studentId} amountInSom=${t.amountInSom} state=${t.state} paymentId=${t.paymentId?.slice(0, 8) ?? 'NULL'} createTime=${new Date(Number(t.createTime)).toISOString()}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
