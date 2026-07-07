/**
 * Remove the 2 CANCELLED May payments so the salary table shows each teacher
 * once (like the others). They're referenced only by their accruals (223 + 10,
 * all live). To delete safely + keep all 10 teachers uniform (one Excel payment,
 * no May accruals): reverse those accruals (+ compensating balance txn +
 * decrement), unlink them, then hard-delete the 2 CANCELLED SalaryPayment rows.
 *
 *   railway run npx ts-node scripts/delete-cancelled-may.ts          # dry-run
 *   railway run npx ts-node scripts/delete-cancelled-may.ts --apply  # commit
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const REASON = 'May Excel rebuild — drop stale cancelled payment';
const f = (n: number) => n.toLocaleString('en-US');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN'}\n`);

  const cancelled = await prisma.salaryPayment.findMany({
    where: {
      companyId: COMPANY,
      status: 'CANCELLED',
      periodStart: { gte: new Date('2026-04-29T00:00:00Z'), lte: new Date('2026-05-02T00:00:00Z') },
    },
    select: { id: true, userId: true, amount: true },
  });
  const paymentIds = cancelled.map((p) => p.id);
  console.log(`Cancelled May payments to delete: ${cancelled.length} (${cancelled.map((p) => `#${p.userId}:${f(p.amount)}`).join(', ')})`);

  const accruals = await prisma.salaryAccrual.findMany({
    where: { salaryPaymentId: { in: paymentIds }, reversedAt: null },
    select: { id: true, userId: true, attendanceId: true, amount: true },
  });
  const attIds = accruals.map((a) => a.attendanceId).filter(Boolean) as string[];
  const txns = await prisma.transaction.findMany({
    where: { type: 'SALARY_ACCRUAL', attendanceId: { in: attIds }, reversedAt: null },
    select: { id: true, teacherId: true, amount: true },
  });
  const decByTeacher = new Map<number, number>();
  for (const t of txns) {
    if (t.teacherId == null) continue;
    decByTeacher.set(t.teacherId, (decByTeacher.get(t.teacherId) ?? 0) + t.amount);
  }
  console.log(`Accruals to reverse+unlink: ${accruals.length} | balance-mirror txns: ${txns.length}`);
  for (const [uid, dec] of decByTeacher) console.log(`   #${uid}: balance − ${f(dec)}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // reverse accruals + unlink from the payment
      await tx.salaryAccrual.updateMany({
        where: { id: { in: accruals.map((a) => a.id) } },
        data: { reversedAt: new Date(), reversalReason: REASON, salaryPaymentId: null },
      });
      // reverse balance-mirror txns
      await tx.transaction.updateMany({
        where: { id: { in: txns.map((t) => t.id) } },
        data: { reversedAt: new Date() },
      });
      // per-teacher compensating txn + balance decrement
      for (const [uid, dec] of decByTeacher) {
        const u = await tx.user.findUnique({ where: { id: uid }, select: { balance: true } });
        const before = u?.balance ?? 0;
        const after = before - dec;
        await tx.transaction.create({
          data: {
            type: 'SALARY_ACCRUAL',
            amount: -dec,
            balanceBefore: before,
            balanceAfter: after,
            teacherId: uid,
            companyId: COMPANY,
            description: REASON,
          },
        });
        await tx.user.update({ where: { id: uid }, data: { balance: after } });
      }
      // now the payments have no live accrual references — delete them
      await tx.salaryPayment.deleteMany({ where: { id: { in: paymentIds } } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20000, timeout: 60000 },
  );
  console.log('\nDeleted 2 cancelled payments; their accruals reversed + balances decremented.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
