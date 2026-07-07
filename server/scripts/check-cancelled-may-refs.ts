/**
 * READ-ONLY — what references the 2 CANCELLED May payments, so they can be
 * hard-deleted safely (FK: accruals, transactions, settled expenses).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const f = (n: number) => n.toLocaleString('en-US');

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host, '\n');
  const cancelled = await prisma.salaryPayment.findMany({
    where: {
      companyId: 1001,
      status: 'CANCELLED',
      periodStart: { gte: new Date('2026-04-29T00:00:00Z'), lte: new Date('2026-05-02T00:00:00Z') },
    },
    select: { id: true, userId: true, amount: true },
  });
  for (const p of cancelled) {
    const accr = await prisma.salaryAccrual.findMany({
      where: { salaryPaymentId: p.id },
      select: { reversedAt: true, amount: true },
    });
    const tx = await prisma.transaction.count({ where: { salaryPaymentId: p.id } });
    const exp = await prisma.expense.count({ where: { settledBySalaryPaymentId: p.id } });
    const accrReversed = accr.filter((a) => a.reversedAt).length;
    const accrLive = accr.filter((a) => !a.reversedAt);
    console.log(`Payment ${p.id} (#${p.userId}, ${f(p.amount)}):`);
    console.log(`   accruals: ${accr.length} total | ${accrReversed} reversed | ${accrLive.length} live (Σ live ${f(accrLive.reduce((s, a) => s + a.amount, 0))})`);
    console.log(`   SALARY_PAYMENT/other txns linked: ${tx} | settled expenses: ${exp}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
