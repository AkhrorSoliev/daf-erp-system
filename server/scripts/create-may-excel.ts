/**
 * Create May 2026 SalaryPayments at the authoritative Excel amounts (the figures
 * the CEO confirmed: salary = paid-lesson-revenue × teacher%). This replaces the
 * accrual-reconstruction approach, which under-counted because many May lessons
 * were paid via the old system (no new-system LESSON_DEDUCTION).
 *
 * Low-risk by design: only CANCELs the 2 stale May payments and INSERTs 10
 * CALCULATED SalaryPayment rows with a note. It does NOT touch SalaryAccrual or
 * User.balance (the teacher-balance ledger is pre-existing-ly complex and prod
 * is live — balance/pay-time handling is a separate, deliberate follow-up).
 *
 *   railway run npx ts-node scripts/create-may-excel.ts          # dry-run
 *   railway run npx ts-node scripts/create-may-excel.ts --apply  # commit
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const PERIOD_START = new Date('2026-04-30T19:00:00.000Z'); // 01.05 Tashkent
const PERIOD_END = new Date('2026-05-31T18:59:59.999Z'); // 31.05 Tashkent end
const NOTE = 'May 2026 — Excel asosida (o\'tilgan to\'langan darslar × foiz)';
const f = (n: number) => n.toLocaleString('en-US');

// Confirmed Excel "Ustozga to'lash uchun summa" (K column).
const EXCEL: Record<number, number> = {
  10010: 20_840_343, // Jamsher
  10008: 7_566_591, // Eldor
  10006: 6_566_601, // Sohibaxon
  10005: 6_133_272, // Gulnozaxon
  10007: 5_433_279, // Ibrohimjon
  10003: 3_483_299, // Saidaxon
  10014: 3_039_970, // Islomiddin
  10473: 2_039_980, // Malikaxon
  10002: 1_716_650, // Hojiali
  10505: 359_996, // Muzzammila
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN'}\n`);

  // stale May payments to cancel
  const stale = await prisma.salaryPayment.findMany({
    where: {
      companyId: COMPANY,
      periodStart: { gte: new Date('2026-04-29T00:00:00Z'), lte: new Date('2026-05-02T00:00:00Z') },
      status: { in: ['CALCULATED', 'APPROVED'] },
    },
    select: { id: true, userId: true, amount: true },
  });
  console.log(`Stale May payments to CANCEL: ${stale.length}`);
  for (const s of stale) console.log(`   #${s.userId}: ${f(s.amount)}`);

  const users = await prisma.user.findMany({
    where: { id: { in: Object.keys(EXCEL).map(Number) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nm = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  console.log('\nMay SalaryPayments to CREATE (CALCULATED, Excel amounts):');
  let total = 0;
  for (const [uid, amt] of Object.entries(EXCEL)) {
    console.log(`   #${uid} ${nm.get(Number(uid))}: ${f(amt)}`);
    total += amt;
  }
  console.log(`   TOTAL: ${f(total)}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      if (stale.length) {
        await tx.salaryPayment.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: { status: 'CANCELLED' },
        });
      }
      for (const [uid, amt] of Object.entries(EXCEL)) {
        await tx.salaryPayment.create({
          data: {
            userId: Number(uid),
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            amount: amt,
            status: 'CALCULATED',
            companyId: COMPANY,
            note: NOTE,
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20000, timeout: 60000 },
  );
  console.log('\nDone — 10 May SalaryPayments created at Excel amounts; 2 stale cancelled.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
