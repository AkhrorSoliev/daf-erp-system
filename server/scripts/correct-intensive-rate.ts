/**
 * Correct the Intensive-course (690,000) over-charge from the 12 -> 20
 * lessonPaymentCount change (07.05.2026).
 *
 * LESSON_DEDUCTION batches written while the course was 12 lessons billed at
 * 57,500/lesson (= 690,000 / 12). The course is now 20 lessons -> 34,500/lesson
 * (= 690,000 / 20), so those lessons were over-charged by 23,000 each.
 *
 * Fix (append-only, same pattern as refund-april-lessons.ts): for each affected
 * student credit ONE ADJUSTMENT = (57,500 - 34,500) x lessonsCovered, discount
 * aware. Brings the effective per-lesson charge to 34,500. Deductions /
 * consumptions / payments are NOT touched. Composes correctly with the April
 * refund (for April lessons: 34,500 refund + 23,000 correction = full 57,500 ->
 * fully free).
 *
 * Idempotent: skips a student who already has an intensive-rate-correction
 * ADJUSTMENT. Reversible by batchId.
 *
 * Usage (from server/):
 *   railway run -- bash -c 'npx ts-node scripts/correct-intensive-rate.ts --dry-run'
 *   railway run -- bash -c 'npx ts-node scripts/correct-intensive-rate.ts --by=10456 --batch-id=intensive-rate-20260606'
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
const BATCH_ID = arg('--batch-id') ?? 'intensive-rate-20260606';

const COURSE_PRICE = 690000;
const OLD_PER_LESSON = 57500; // 690,000 / 12
const NEW_PER_LESSON = 34500; // 690,000 / 20
const MARKER = 'intensive-rate-correction';

class DryRunAbort extends Error {
  constructor() {
    super('DRY_RUN_ABORT');
  }
}

async function main() {
  console.log('======= INTENSIVE RATE CORRECTION (57,500 -> 34,500) =======');
  console.log('DB host :', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode    :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('company :', COMPANY_ID, '| performedBy:', PERFORMED_BY ?? '—', '| batch:', BATCH_ID);
  console.log('------------------------------------------------------------');

  // Affected: active LESSON_DEDUCTION at the old 57,500 rate on the 690,000
  // Intensive course. Aggregate lessonsCovered per student.
  const rows = await prisma.$queryRaw<
    { studentId: number; lessons: number; deds: number }[]
  >`
    SELECT t."studentId"                              AS "studentId",
           SUM((t.metadata->>'lessonsCovered')::int)::int AS lessons,
           COUNT(*)::int                              AS deds
    FROM "Transaction" t
    JOIN "Enrollment" e ON e.id = t."enrollmentId"
    JOIN "Group" g      ON g.id = e."groupId"
    JOIN "Course" c     ON c.id = g."courseId"
    WHERE t.type = 'LESSON_DEDUCTION'
      AND t."reversedAt" IS NULL
      AND t."companyId" = ${COMPANY_ID}
      AND (t.metadata->>'perLessonCost')::int = ${OLD_PER_LESSON}
      AND c.price = ${COURSE_PRICE}
    GROUP BY t."studentId"
    ORDER BY t."studentId" ASC
  `;

  console.log(`Affected students: ${rows.length}`);
  const totalLessons = rows.reduce((s, r) => s + r.lessons, 0);
  console.log(`Over-charged lessons: ${totalLessons} | gross over-charge: ${(totalLessons * (OLD_PER_LESSON - NEW_PER_LESSON)).toLocaleString('en-US')}`);
  console.log('------------------------------------------------------------');

  let applied = 0, skipped = 0, errors = 0, credited = 0;

  for (const r of rows) {
    const cap: { before?: number; after?: number; name?: string; credit?: number; skip?: boolean } = {};
    try {
      const run = async (tx: Prisma.TransactionClient) => {
        const existing = await tx.transaction.findFirst({
          where: {
            studentId: r.studentId,
            type: 'ADJUSTMENT',
            reversedAt: null,
            metadata: { path: ['marker'], equals: MARKER },
          },
          select: { id: true },
        });
        if (existing) {
          cap.skip = true;
          return;
        }

        const locked = await tx.$queryRaw<
          { balance: number; firstName: string; lastName: string; discountPercent: number }[]
        >`
          SELECT balance, "firstName", "lastName", "discountPercent"
          FROM "Student" WHERE id = ${r.studentId} AND "companyId" = ${COMPANY_ID} FOR UPDATE
        `;
        if (!locked.length) {
          cap.skip = true;
          return;
        }
        const disc = locked[0].discountPercent ?? 0;
        const credit = Math.round(
          (OLD_PER_LESSON - NEW_PER_LESSON) * r.lessons * (100 - disc) / 100,
        );
        const before = locked[0].balance;
        const after = before + credit;
        cap.before = before;
        cap.after = after;
        cap.credit = credit;
        cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();

        await tx.transaction.create({
          data: {
            type: 'ADJUSTMENT',
            amount: credit,
            balanceBefore: before,
            balanceAfter: after,
            studentId: r.studentId,
            companyId: COMPANY_ID,
            performedById: PERFORMED_BY ?? undefined,
            description: 'Intensive kurs stavka tuzatishi (57,500 -> 34,500, dars soni 12 -> 20)',
            metadata: {
              marker: MARKER,
              batchId: BATCH_ID,
              lessons: r.lessons,
              oldPerLesson: OLD_PER_LESSON,
              newPerLesson: NEW_PER_LESSON,
              discountPercent: disc,
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
        console.log(`  #${r.studentId}: SKIP (allaqachon tuzatilgan yoki topilmadi)`);
        continue;
      }
      applied++;
      credited += cap.credit ?? 0;
      console.log(
        `  #${r.studentId} ${(cap.name ?? '').padEnd(24).slice(0, 24)} | ${r.lessons} dars × 23,000 = +${cap.credit?.toLocaleString('en-US')} | bal ${cap.before?.toLocaleString('en-US')} -> ${cap.after?.toLocaleString('en-US')}`,
      );
    } catch (e) {
      errors++;
      console.error(`  #${r.studentId} FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('------------------------------------------------------------');
  console.log(`Applied : ${applied} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`Total credited: ${credited.toLocaleString('en-US')} so'm`);
  console.log(DRY_RUN ? 'DRY RUN — all changes rolled back.' : 'APPLY — committed.');
  console.log('============================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
