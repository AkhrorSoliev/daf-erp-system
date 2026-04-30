/**
 * Migrate existing cycle-boundary deductions to the new prepaid model.
 *
 * Faza 3 introduces a new billing model: instead of deducting at cycle
 * boundaries (every N attended lessons), the system now tracks a counter
 * `Enrollment.prepaidLessonsRemaining` decremented at each attended
 * lesson. This script translates pre-existing data so the new flow can
 * pick up where the old one left off:
 *
 *   coveredLessonsRaw = sum(|amount|) of LESSON_DEDUCTION rows for this
 *                       enrollment that are not reversed (and are not the
 *                       reversal entry of another row)
 *   coveredLessons    = floor(coveredLessonsRaw / perLessonCost)
 *   attendedLessons   = count of PRESENT/LATE attendance rows for this enrollment
 *   prepaidLessonsRemaining = max(0, coveredLessons - attendedLessons)
 *
 * Idempotent: by default skips enrollments where prepaidLessonsRemaining
 * is already non-zero. Use --force to recompute everyone.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/migrate-cycle-to-prepaid.ts --dry-run
 *   npx ts-node scripts/migrate-cycle-to-prepaid.ts
 *   npx ts-node scripts/migrate-cycle-to-prepaid.ts --force
 */
import { PrismaClient, EnrollmentStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

interface Row {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  status: EnrollmentStatus;
  perLessonCost: number;
  coveredLessonsRaw: number;
  coveredLessons: number;
  attendedLessons: number;
  oldPrepaid: number;
  newPrepaid: number;
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}${FORCE ? ' --force' : ''}\n`);

  // Only ACTIVE / FROZEN enrollments need a non-zero prepaid count —
  // DROPPED/TRANSFERRED/COMPLETED ones are already settled (refundPrepaidToBalance
  // would have zeroed them out under the new system, and pre-system rows
  // never had a prepaid counter to start with).
  const enrollments = await prisma.enrollment.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'FROZEN'] },
    },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      status: true,
      createdAt: true,
      prepaidLessonsRemaining: true,
      student: { select: { firstName: true, lastName: true } },
      group: {
        select: {
          name: true,
          course: { select: { price: true, lessonPaymentCount: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Inspecting ${enrollments.length} enrollment(s)...\n`);

  const rows: Row[] = [];
  for (const e of enrollments) {
    if (!FORCE && e.prepaidLessonsRemaining > 0) {
      // Already migrated — skip
      continue;
    }

    const lessonPaymentCount = e.group.course.lessonPaymentCount || 12;
    const perLessonCost = Math.round(
      e.group.course.price / lessonPaymentCount,
    );
    if (perLessonCost <= 0) continue;

    // Sum of non-reversed LESSON_DEDUCTION amounts for THIS enrollment
    // (LESSON_DEDUCTION rows carry enrollmentId since C.1, so this is
    // already enrollment-scoped — no leak across re-enroll/transfer).
    const ledgerAgg = await prisma.transaction.aggregate({
      where: {
        enrollmentId: e.id,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
        reversedAt: null,
      },
      _sum: { amount: true },
    });
    const coveredLessonsRaw = Math.abs(ledgerAgg._sum.amount ?? 0);
    const coveredLessons = Math.floor(coveredLessonsRaw / perLessonCost);

    // Attendance has no direct enrollmentId — scope by date range against
    // the enrollment's lifetime so transfer/re-enroll history doesn't
    // double-count a lesson against the wrong enrollment.
    const nextEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: e.studentId,
        groupId: e.groupId,
        deletedAt: null,
        createdAt: { gt: e.createdAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const attendedLessons = await prisma.attendance.count({
      where: {
        groupId: e.groupId,
        studentId: e.studentId,
        status: { in: ['PRESENT', 'LATE'] },
        date: {
          gte: e.createdAt,
          ...(nextEnrollment && { lt: nextEnrollment.createdAt }),
        },
      },
    });

    const newPrepaid = Math.max(0, coveredLessons - attendedLessons);

    rows.push({
      enrollmentId: e.id,
      studentId: e.studentId,
      studentName: `${e.student.firstName} ${e.student.lastName}`,
      groupId: e.groupId,
      groupName: e.group.name,
      status: e.status,
      perLessonCost,
      coveredLessonsRaw,
      coveredLessons,
      attendedLessons,
      oldPrepaid: e.prepaidLessonsRemaining,
      newPrepaid,
    });
  }

  if (rows.length === 0) {
    console.log('Nothing to do (use --force to recompute already-migrated rows).');
    return;
  }

  // Print preview table
  console.log(
    'enrollmentId | student | group | status | perLesson | covered (raw → /N) | attended | prepaid (old → new)',
  );
  console.log('-'.repeat(120));
  for (const r of rows) {
    console.log(
      `${r.enrollmentId.slice(0, 8)} | ${r.studentName} (#${r.studentId}) | ${r.groupName} | ${r.status} | ` +
        `${r.perLessonCost.toLocaleString()} | ` +
        `${r.coveredLessonsRaw.toLocaleString()} → ${r.coveredLessons} | ` +
        `${r.attendedLessons} | ${r.oldPrepaid} → ${r.newPrepaid}`,
    );
  }
  console.log(
    `\nTotal: ${rows.length} enrollment(s). ` +
      `Of those, ${rows.filter((r) => r.newPrepaid > 0).length} will have prepaid > 0.`,
  );

  if (DRY_RUN) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  let written = 0;
  for (const r of rows) {
    if (r.oldPrepaid === r.newPrepaid) continue; // no-op
    await prisma.enrollment.update({
      where: { id: r.enrollmentId },
      data: { prepaidLessonsRemaining: r.newPrepaid },
    });
    written++;
  }
  console.log(`\nUpdated ${written} enrollment(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
