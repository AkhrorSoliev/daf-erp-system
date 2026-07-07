/**
 * READ-ONLY — what did today's May backfill actually write to prod, so we can
 * decide cleanup. Counts SalaryAccrual + SALARY_ACCRUAL balance transactions
 * created today (2026-06-29), and lists the config versions backdated to May.
 * Mutates nothing.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY = 1001;
const TODAY = new Date('2026-06-29T00:00:00.000Z');
const f = (n: number) => n.toLocaleString('en-US');

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host, '\n');

  // Accruals created today (the backfill writes), grouped by teacher.
  const accs = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY, createdAt: { gte: TODAY }, reversedAt: null },
    select: { userId: true, amount: true, attendanceId: true, salaryPaymentId: true },
  });
  const byUser = new Map<number, { count: number; amount: number; linked: number }>();
  for (const a of accs) {
    const e = byUser.get(a.userId) ?? { count: 0, amount: 0, linked: 0 };
    e.count++;
    e.amount += a.amount;
    if (a.salaryPaymentId) e.linked++;
    byUser.set(a.userId, e);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nm = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  console.log('================ SalaryAccrual rows created TODAY (backfill) ================');
  let total = 0;
  for (const [uid, e] of [...byUser.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`#${uid} ${nm.get(uid)}: ${e.count} accrual(s), ${f(e.amount)} so'm${e.linked ? ` (${e.linked} linked to a payment)` : ''}`);
    total += e.amount;
  }
  console.log(`TOTAL accruals written today: ${accs.length} rows, ${f(total)} so'm`);

  // Balance-mirror transactions created today.
  const txs = await prisma.transaction.aggregate({
    where: { companyId: COMPANY, type: 'SALARY_ACCRUAL', createdAt: { gte: TODAY }, reversedAt: null },
    _count: true,
    _sum: { amount: true },
  });
  console.log(`\nSALARY_ACCRUAL balance txns today: ${txs._count} rows, ${f(txs._sum.amount ?? 0)} so'm (added to teacher balances)`);

  // Config versions backdated to May (created today).
  const vers = await prisma.employeeSalaryConfigVersion.findMany({
    where: { companyId: COMPANY, createdAt: { gte: TODAY } },
    select: { id: true, value: true, salaryType: true, effectiveFrom: true, config: { select: { userId: true } } },
  });
  console.log(`\nConfig versions inserted today (May backdate): ${vers.length}`);
  for (const v of vers) {
    console.log(`   #${v.config.userId}: ${v.salaryType}:${v.value} from ${v.effectiveFrom.toISOString()}`);
  }

  // Existing May SalaryPayments (pre-existing + any new).
  const pays = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY, periodStart: { gte: new Date('2026-04-30T00:00:00Z'), lte: new Date('2026-05-02T00:00:00Z') } },
    select: { userId: true, amount: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nMay-period SalaryPayments: ${pays.length}`);
  for (const p of pays) {
    console.log(`   #${p.userId}: ${f(p.amount)} ${p.status} (created ${p.createdAt.toISOString().slice(0, 10)})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
