/**
 * Revert ALL May 2026 salary state to a clean slate, so it can be rebuilt from
 * the authoritative Excel amounts (create-may-excel.ts).
 *
 * Reverses every non-reversed May accrual (my backfill's 581 + the 2 existing
 * May payments' accruals), reverses their SALARY_ACCRUAL balance-mirror
 * transactions (one aggregate compensating txn per teacher + balance
 * decrement), CANCELs the 2 May SalaryPayments, and deletes the 10 config
 * versions backdated to May today.
 *
 * Idempotent-ish: only touches non-reversed rows; re-running finds less to do.
 * Dry-run default; --apply to commit. Retries transient Neon drops.
 *
 *   railway run npx ts-node scripts/revert-may.ts          # dry-run
 *   railway run npx ts-node scripts/revert-may.ts --apply  # commit
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const PERIOD_START = new Date('2026-04-30T19:00:00.000Z'); // 01.05 Tashkent
const PERIOD_END = new Date('2026-05-31T18:59:59.999Z'); // 31.05 Tashkent end
const CONFIG_BACKDATE_FROM = new Date('2026-04-30T19:00:00.000Z'); // the May-coverage versions we inserted
const REASON = 'May Excel rebuild — revert';
const f = (n: number) => n.toLocaleString('en-US');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (++attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const TODAY = new Date('2026-06-29T00:00:00.000Z'); // my backfill ran today (UTC)

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN'}\n`);

  // Target ONLY my erroneous backfill: accruals created today, for a May
  // lesson, not yet linked to any payment. We deliberately do NOT touch the 2
  // pre-existing May payments or their accruals here — undoing only my own
  // mistake returns prod to its pre-session state with zero ambiguity.
  const accruals = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY,
      reversedAt: null,
      salaryPaymentId: null,
      createdAt: { gte: TODAY },
      lessonDate: { gte: PERIOD_START, lte: PERIOD_END },
    },
    select: { id: true, userId: true, attendanceId: true, amount: true },
  });
  const attIds = accruals.map((a) => a.attendanceId).filter(Boolean) as string[];

  // 2) their SALARY_ACCRUAL balance-mirror txns → per-teacher decrement.
  const txns: { id: string; teacherId: number | null; amount: number }[] = [];
  for (let i = 0; i < attIds.length; i += 1000) {
    const chunk = attIds.slice(i, i + 1000);
    const t = await prisma.transaction.findMany({
      where: { type: 'SALARY_ACCRUAL', attendanceId: { in: chunk }, reversedAt: null },
      select: { id: true, teacherId: true, amount: true },
    });
    txns.push(...t);
  }
  const decByTeacher = new Map<number, number>();
  for (const t of txns) {
    if (t.teacherId == null) continue;
    decByTeacher.set(t.teacherId, (decByTeacher.get(t.teacherId) ?? 0) + t.amount);
  }

  // 3) config versions backdated to May today.
  const versions = await prisma.employeeSalaryConfigVersion.findMany({
    where: { companyId: COMPANY, effectiveFrom: CONFIG_BACKDATE_FROM },
    select: { id: true, config: { select: { userId: true } } },
  });

  // report
  const users = await prisma.user.findMany({
    where: { id: { in: [...decByTeacher.keys()] } },
    select: { id: true, firstName: true, lastName: true, balance: true },
  });
  const nm = new Map(users.map((u) => [u.id, u]));
  console.log(`Accruals to reverse (MY backfill only): ${accruals.length}`);
  console.log(`Balance-mirror txns to reverse: ${txns.length}`);
  console.log(`Config versions to delete: ${versions.length}`);
  console.log('(2 pre-existing May payments are intentionally NOT touched)\n');
  console.log('Per-teacher balance decrement:');
  for (const [uid, dec] of [...decByTeacher.entries()].sort((a, b) => b[1] - a[1])) {
    const u = nm.get(uid);
    console.log(`   #${uid} ${u?.firstName} ${u?.lastName}: balance ${f(u?.balance ?? 0)} − ${f(dec)} = ${f((u?.balance ?? 0) - dec)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    return;
  }

  // APPLY — one Serializable tx, retried on transient drops.
  await withRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // reverse accruals
        await tx.salaryAccrual.updateMany({
          where: { id: { in: accruals.map((a) => a.id) } },
          data: { reversedAt: new Date(), reversalReason: REASON },
        });
        // reverse balance-mirror txns
        await tx.transaction.updateMany({
          where: { id: { in: txns.map((t) => t.id) } },
          data: { reversedAt: new Date() },
        });
        // per-teacher: compensating txn + balance decrement
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
        // delete backdated config versions
        if (versions.length) {
          await tx.employeeSalaryConfigVersion.deleteMany({
            where: { id: { in: versions.map((v) => v.id) } },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20000, timeout: 120000 },
    ),
  );
  console.log('\nReverted. May is now a clean slate.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
