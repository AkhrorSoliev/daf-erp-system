/**
 * Faza 2 (revised) — REFUND APRIL LESSONS (append-only credit).
 *
 * Why a credit instead of unwind+replay: the prepaid LESSON_DEDUCTION batches
 * are cycle-based and often span the April→May boundary, and reversing a
 * LESSON_CONSUMPTION leaves an active inverse LESSON_CONSUMPTION row (same
 * attendanceId) that masks the lesson as "still billed" — so the system's
 * retroactive-billing path will NOT re-bill it. The system simply isn't built
 * to reverse-then-rebill the same attendance.
 *
 * Provable equivalence: balance = payments − deductions, and
 *   deductions = (April consumed value) + (May consumed value) + (prepaid held).
 * The correct post-reset balance is payments − (May consumed) − (prepaid held).
 * => correct balance = current balance + (April consumed value).
 * So crediting each student exactly their April consumed value (Σ perLessonCost
 * over active April LESSON_CONSUMPTION rows) restores the correct balance —
 * April lessons become free, May + future prepaid stay charged. Payments,
 * deductions and consumptions are never touched (append-only ledger preserved).
 *
 * One ADJUSTMENT (+aprilValue) per student, each in its own Serializable tx.
 * Idempotent: skips a student who already has an april-cutover ADJUSTMENT.
 *
 * Usage (from server/):
 *   # prod dry-run: railway run -- bash -c 'npx ts-node scripts/refund-april-lessons.ts --dry-run'
 *   # prod apply:   railway run -- bash -c 'npx ts-node scripts/refund-april-lessons.ts --by=<ceoUserId> --batch-id=<id>'
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const arg = (n: string): string | undefined =>
  argv.find((a) => a.startsWith(`${n}=`))?.split('=', 2)[1];
const COMPANY_ID = Number(arg('--company') ?? process.env.COMPANY_ID ?? 1001);
const PERFORMED_BY = arg('--by') ? Number(arg('--by')) : null;
const BATCH_ID = arg('--batch-id') ?? `april-refund-${new Date(process.env.NOW ?? Date.now()).toISOString?.() ?? 'manual'}`;
const ONLY_STUDENTS = arg('--students')
  ? arg('--students')!.split(',').map((s) => Number(s.trim())).filter(Boolean)
  : undefined;
const LIMIT = arg('--limit') ? Number(arg('--limit')) : undefined;
const CUTOFF = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01

const REFUND_MARKER = 'april-cutover-refund';

class DryRunAbort extends Error {
  constructor() {
    super('DRY_RUN_ABORT');
  }
}

async function main() {
  console.log('================ REFUND APRIL LESSONS ================');
  console.log('DB host :', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode    :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('company :', COMPANY_ID, '| performedBy:', PERFORMED_BY ?? '—', '| batch:', BATCH_ID);
  console.log('-----------------------------------------------------');

  // April consumed value per student (Σ perLessonCost over active April
  // LESSON_CONSUMPTION rows). This is exactly the amount to credit back.
  let rows = await prisma.$queryRaw<
    { studentId: number; aprilValue: number; cnt: number }[]
  >`
    SELECT a."studentId"                                              AS "studentId",
           COALESCE(SUM((t.metadata->>'perLessonCost')::int), 0)::int AS "aprilValue",
           COUNT(*)::int                                             AS cnt
    FROM "Transaction" t
    JOIN "Attendance" a ON a.id = t."attendanceId"
    WHERE t.type = 'LESSON_CONSUMPTION'
      AND t."reversedAt" IS NULL
      AND t."companyId" = ${COMPANY_ID}
      AND a.date < ${CUTOFF}
    GROUP BY a."studentId"
    HAVING COALESCE(SUM((t.metadata->>'perLessonCost')::int), 0) > 0
    ORDER BY a."studentId" ASC
  `;
  if (ONLY_STUDENTS) {
    const set = new Set(ONLY_STUDENTS);
    rows = rows.filter((r) => set.has(r.studentId));
  }
  if (LIMIT) rows = rows.slice(0, LIMIT);

  console.log(`Students to refund: ${rows.length}`);
  const totalRefund = rows.reduce((s, r) => s + r.aprilValue, 0);
  console.log(`Total refund value: ${totalRefund.toLocaleString('en-US')} so'm`);
  console.log('-----------------------------------------------------');

  let applied = 0, skipped = 0, errors = 0, refunded = 0;

  for (const r of rows) {
    // Captured BEFORE any DryRunAbort throw so dry-run still prints state.
    const cap: { before?: number; after?: number; name?: string; skip?: boolean } = {};
    try {
      const run = async (tx: Prisma.TransactionClient) => {
        // Idempotency: already refunded?
        const existing = await tx.transaction.findFirst({
          where: {
            studentId: r.studentId,
            type: 'ADJUSTMENT',
            reversedAt: null,
            metadata: { path: ['marker'], equals: REFUND_MARKER },
          },
          select: { id: true },
        });
        if (existing) {
          cap.skip = true;
          return;
        }

        const locked = await tx.$queryRaw<{ balance: number; firstName: string; lastName: string }[]>`
          SELECT balance, "firstName", "lastName" FROM "Student" WHERE id = ${r.studentId} AND "companyId" = ${COMPANY_ID} FOR UPDATE
        `;
        if (!locked.length) {
          cap.skip = true;
          return;
        }
        const before = locked[0].balance;
        const after = before + r.aprilValue;
        cap.before = before;
        cap.after = after;
        cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();

        await tx.transaction.create({
          data: {
            type: 'ADJUSTMENT',
            amount: r.aprilValue,
            balanceBefore: before,
            balanceAfter: after,
            studentId: r.studentId,
            companyId: COMPANY_ID,
            performedById: PERFORMED_BY ?? undefined,
            description: "Aprel darslari uchun qaytarma (eski tizimda to'langan — ERP cutover 01.05)",
            metadata: {
              marker: REFUND_MARKER,
              batchId: BATCH_ID,
              aprilLessons: r.cnt,
              aprilValue: r.aprilValue,
            },
          },
        });
        await tx.student.update({
          where: { id: r.studentId },
          data: { balance: after },
        });

        if (DRY_RUN) throw new DryRunAbort();
      };

      try {
        await prisma.$transaction(run, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 20_000,
          timeout: 60_000,
        });
      } catch (e) {
        if (!(e instanceof DryRunAbort)) throw e;
      }

      if (cap.skip) {
        skipped++;
        if (rows.length <= 30) console.log(`  #${r.studentId}: SKIP (already refunded or missing)`);
        continue;
      }
      applied++;
      refunded += r.aprilValue;
      if (rows.length <= 30) {
        console.log(
          `  #${r.studentId} ${(cap.name ?? '').padEnd(24).slice(0, 24)} | +${r.aprilValue.toLocaleString('en-US')} (${r.cnt} dars) | bal ${cap.before?.toLocaleString('en-US')} -> ${cap.after?.toLocaleString('en-US')}`,
        );
      }
    } catch (e) {
      errors++;
      console.error(`  #${r.studentId} FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('-----------------------------------------------------');
  console.log(`Applied refunds : ${applied}`);
  console.log(`Skipped         : ${skipped}`);
  console.log(`Errors          : ${errors}`);
  console.log(`Total refunded  : ${refunded.toLocaleString('en-US')} so'm`);
  console.log(DRY_RUN ? 'DRY RUN — all changes rolled back.' : 'APPLY — committed.');
  console.log('=====================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
