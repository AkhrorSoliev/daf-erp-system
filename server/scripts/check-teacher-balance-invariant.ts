/**
 * READ-ONLY — verify whether teacher User.balance == Σ(non-reversed Transaction
 * amounts with that teacherId). If the invariant holds, the May revert can
 * simply reverse the May accrual txns and recompute balance from the ledger
 * (self-correcting, robust to the messy interrupted-run state).
 *
 * Also shows, per affected teacher, the 694-target accrual sum vs matched
 * balance-mirror txn sum, to explain the decrement mismatch. Mutates nothing.
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
const PERIOD_START = new Date('2026-04-30T19:00:00.000Z');
const PERIOD_END = new Date('2026-05-31T18:59:59.999Z');
const f = (n: number) => n.toLocaleString('en-US');

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host, '\n');

  const teacherIds = [10001, 10002, 10003, 10005, 10006, 10007, 10008, 10010, 10014, 10473, 10505];

  console.log('=========== BALANCE INVARIANT: User.balance vs Σ(non-reversed txns) ===========');
  for (const tid of teacherIds) {
    const u = await prisma.user.findUnique({ where: { id: tid }, select: { firstName: true, lastName: true, balance: true } });
    if (!u) continue;
    const agg = await prisma.transaction.aggregate({
      where: { teacherId: tid, reversedAt: null },
      _sum: { amount: true },
    });
    const ledger = agg._sum.amount ?? 0;
    const match = ledger === u.balance ? 'OK' : `MISMATCH (Δ ${f(u.balance - ledger)})`;
    console.log(`#${tid} ${u.firstName} ${u.lastName}: balance=${f(u.balance)} ledgerΣ=${f(ledger)} → ${match}`);
  }

  console.log('\n=========== 694-TARGET: accrual sum vs matched balance-txn sum per teacher ===========');
  const payments = await prisma.salaryPayment.findMany({
    where: {
      companyId: COMPANY,
      periodStart: { gte: new Date('2026-04-29T00:00:00Z'), lte: new Date('2026-05-02T00:00:00Z') },
      status: { in: ['CALCULATED', 'APPROVED'] },
    },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  const accruals = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY,
      reversedAt: null,
      OR: [
        { salaryPaymentId: { in: paymentIds } },
        { salaryPaymentId: null, createdAt: { gte: TODAY }, lessonDate: { gte: PERIOD_START, lte: PERIOD_END } },
      ],
    },
    select: { userId: true, attendanceId: true, amount: true },
  });
  const accSum = new Map<number, { n: number; amt: number; nullAtt: number }>();
  for (const a of accruals) {
    const e = accSum.get(a.userId) ?? { n: 0, amt: 0, nullAtt: 0 };
    e.n++; e.amt += a.amount; if (!a.attendanceId) e.nullAtt++;
    accSum.set(a.userId, e);
  }
  const attIds = accruals.map((a) => a.attendanceId).filter(Boolean) as string[];
  const txns = await prisma.transaction.findMany({
    where: { type: 'SALARY_ACCRUAL', attendanceId: { in: attIds }, reversedAt: null },
    select: { teacherId: true, amount: true },
  });
  const txSum = new Map<number, { n: number; amt: number }>();
  for (const t of txns) {
    if (t.teacherId == null) continue;
    const e = txSum.get(t.teacherId) ?? { n: 0, amt: 0 };
    e.n++; e.amt += t.amount;
    txSum.set(t.teacherId, e);
  }
  for (const tid of teacherIds) {
    const a = accSum.get(tid);
    const t = txSum.get(tid);
    if (!a && !t) continue;
    console.log(`#${tid}: accruals ${a?.n ?? 0} (${f(a?.amt ?? 0)}${a?.nullAtt ? `, ${a.nullAtt} null-att` : ''})  | balance-txns ${t?.n ?? 0} (${f(t?.amt ?? 0)})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
