/**
 * One-off cleanup for teacher-salary accruals that LEAKED into an
 * already-settled month. Companion to the carry-over fix in
 * `salary-accrual.service.ts` (which only fixes NEW accruals going forward —
 * `creditPeriodDate` is write-once).
 *
 * A leaked accrual = a late-payment earning that arrived AFTER its month was
 * calculated, bucketed back into that (closed) month, and stranded unpaid:
 *   creditPeriodDate IS NULL  (never carried)
 *   salaryPaymentId  IS NULL  (not linked to any payment)
 *   reversedAt       IS NULL  (still live)
 *   lessonDate       falls inside a period that ALREADY has a SalaryPayment
 *   createdAt        > that period's SalaryPayment.createdAt  (arrived post-calc)
 *
 * Fix = set creditPeriodDate = current open period start (exactly what
 * createAccrual would now do), so the next payroll run sweeps and pays it.
 * Balance was already credited when the accrual was first written, so this
 * is a pure re-bucket — NOT a new accrual.
 *
 *   Dry-run: railway run npx ts-node --transpile-only scripts/backfill-leaked-accruals.ts
 *   Apply:   railway run npx ts-node --transpile-only scripts/backfill-leaked-accruals.ts --apply
 */
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { resolveCurrentPeriod } from '../src/salary/shared/resolve-current-period';

const APPLY = process.argv.includes('--apply');

function monthKey(d: Date): string {
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000); // Tashkent
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('Company topilmadi');
  const companyId = company.id;

  const current = await resolveCurrentPeriod(prisma as any, companyId, new Date());
  const target = current.periodStart; // creditPeriodDate to set

  // 1. All non-cancelled SalaryPayments per teacher (period bounds + when calculated).
  const payments = await prisma.salaryPayment.findMany({
    where: { companyId, status: { not: 'CANCELLED' } },
    select: { userId: true, periodStart: true, periodEnd: true, createdAt: true },
  });
  const payByUser = new Map<number, { periodStart: Date; periodEnd: Date; createdAt: Date }[]>();
  for (const p of payments) {
    const arr = payByUser.get(p.userId) ?? [];
    arr.push(p);
    payByUser.set(p.userId, arr);
  }

  // 2. Candidate accruals (unlinked, un-carried, live). NOTE: do NOT select
  //    isCenterTopUp — that column may not exist on prod yet.
  const candidates = await prisma.salaryAccrual.findMany({
    where: { companyId, creditPeriodDate: null, salaryPaymentId: null, reversedAt: null },
    select: { id: true, userId: true, lessonDate: true, amount: true, createdAt: true },
  });

  // 3. Keep only those that arrived AFTER their month was calculated.
  const leaked = candidates.filter((a) => {
    const pays = payByUser.get(a.userId) ?? [];
    const pay = pays.find(
      (p) => a.lessonDate >= p.periodStart && a.lessonDate <= p.periodEnd && p.periodStart < target,
    );
    return pay ? a.createdAt > pay.createdAt : false;
  });

  // 4. Report (per teacher, per lesson-month).
  const userIds = [...new Set(leaked.map((l) => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  const byUser = new Map<number, { count: number; sum: number; months: Map<string, number> }>();
  for (const a of leaked) {
    const u = byUser.get(a.userId) ?? { count: 0, sum: 0, months: new Map() };
    u.count += 1;
    u.sum += a.amount;
    const mk = monthKey(a.lessonDate);
    u.months.set(mk, (u.months.get(mk) ?? 0) + a.amount);
    byUser.set(a.userId, u);
  }

  console.log('==================================================');
  console.log(`Kompaniya: ${company.name} (#${companyId})`);
  console.log(`Joriy ochiq davr (target creditPeriodDate): ${target.toISOString()} [${monthKey(target)}]`);
  console.log(`Rejim: ${APPLY ? 'APPLY (yoziladi)' : 'DRY-RUN (yozilmaydi)'}`);
  console.log(`Sizib ketgan accruallar: ${leaked.length} ta, ${userIds.length} ustozda`);
  console.log('--------------------------------------------------');
  for (const uid of userIds) {
    const u = byUser.get(uid)!;
    const months = [...u.months.entries()].map(([m, s]) => `${m}: ${s.toLocaleString()}`).join(', ');
    console.log(`  ${nameOf.get(uid) ?? uid} (#${uid}) — ${u.count} ta, jami ${u.sum.toLocaleString()} so'm  [${months} → ${monthKey(target)}]`);
  }
  console.log('==================================================');

  if (!APPLY) {
    console.log("DRY-RUN — hech narsa yozilmadi. Qo'llash uchun: --apply");
    await prisma.$disconnect();
    return;
  }

  // 5. Apply — re-bucket to the current open period, in batches.
  const ids = leaked.map((l) => l.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await prisma.salaryAccrual.updateMany({
      where: { id: { in: chunk } },
      data: { creditPeriodDate: target },
    });
    done += res.count;
  }
  console.log(`APPLIED: ${done} ta accrual → creditPeriodDate = ${target.toISOString()}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
