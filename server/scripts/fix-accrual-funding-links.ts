/**
 * Repoint salary accruals at the payment that actually funded their lesson.
 *
 * WHAT WAS WRONG: the substitute-teacher sync looked for the funding
 * `LESSON_DEDUCTION` with `createdAt <= p.date`, where `p.date` is UTC MIDNIGHT
 * of the lesson day. Deductions are written when attendance is marked — during
 * the day, at 09:30, 10:05 — so the funding deduction was excluded by
 * definition and the query fell back to an older batch.
 *
 * WHY IT MATTERS: `reverseLessonDeduction` reverses EVERY accrual pointing at a
 * deduction. Left as is, cancelling one payment would erase a teacher's pay for
 * a lesson that payment never funded, with no error and no trace.
 *
 * WHAT THIS TOUCHES: one column, `SalaryAccrual.deductionTransactionId`. No
 * amount, no teacher, no lesson, no balance. Nobody is paid a som more or less.
 *
 * The code fix is deployed (PR #454); this only repairs rows written before it.
 *
 * Usage:
 *   railway run npx ts-node scripts/fix-accrual-funding-links.ts            # dry run
 *   railway run npx ts-node scripts/fix-accrual-funding-links.ts --apply    # write
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');
const f = (n: number) => Math.round(n).toLocaleString('uz-UZ');
const d = (x: Date) => x.toISOString().slice(0, 16).replace('T', ' ');

interface Repair {
  accrualId: string;
  teacher: string;
  student: number;
  amount: number;
  reversed: boolean;
  from: string;
  to: string;
  toId: string;
  lesson: string;
}

async function collect(): Promise<Repair[]> {
  const overrides = await prisma.lessonTeacherOverride.findMany({
    where: { deletedAt: null },
    select: { groupId: true, date: true },
  });

  const out: Repair[] = [];

  for (const o of overrides) {
    const accruals = await prisma.salaryAccrual.findMany({
      where: {
        groupId: o.groupId,
        lessonDate: o.date,
        deductionTransactionId: { not: null },
      },
      select: {
        id: true,
        userId: true,
        studentId: true,
        attendanceId: true,
        amount: true,
        reversedAt: true,
        deductionTransactionId: true,
      },
    });

    for (const a of accruals) {
      if (!a.attendanceId) continue;

      // The consumption row carries BOTH the moment the lesson was consumed
      // and the enrollment it was charged to. Both come from it.
      //
      // An earlier draft of this script looked the enrollment up by
      // (studentId, groupId) — the very guess the code fix removed. Student
      // #10331 holds three enrollments, two of them in the same group, and the
      // guess picked the dropped one; the script then reported a CORRECT link
      // as wrong and would have repointed live payroll at another
      // enrollment's batch. The dry run is why that did not happen.
      const consumption = await prisma.transaction.findFirst({
        where: {
          attendanceId: a.attendanceId,
          type: 'LESSON_CONSUMPTION',
          reversedAt: null,
        },
        select: { createdAt: true, enrollmentId: true },
      });
      if (!consumption?.enrollmentId) continue;

      const correct = await prisma.transaction.findFirst({
        where: {
          enrollmentId: consumption.enrollmentId,
          type: 'LESSON_DEDUCTION',
          reversedAt: null,
          createdAt: { lte: consumption.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      });
      if (!correct || correct.id === a.deductionTransactionId) continue;

      const current = await prisma.transaction.findUnique({
        where: { id: a.deductionTransactionId! },
        select: { createdAt: true },
      });
      const teacher = await prisma.user.findUnique({
        where: { id: a.userId },
        select: { firstName: true, lastName: true },
      });

      out.push({
        accrualId: a.id,
        teacher:
          `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim(),
        student: a.studentId,
        amount: a.amount,
        reversed: a.reversedAt !== null,
        from: current ? d(current.createdAt) : '(topilmadi)',
        to: d(correct.createdAt),
        toId: correct.id,
        lesson: d(consumption.createdAt),
      });
    }
  }

  return out;
}

async function main() {
  const repairs = await collect();

  console.log(
    `\n${APPLY ? 'YOZISH REJIMI' : 'SINOV REJIMI — hech narsa yozilmaydi'}\n`,
  );
  console.log(`To'g'rilanadigan yorliqlar: ${repairs.length}\n`);

  if (repairs.length === 0) {
    console.log("Hammasi joyida — tuzatiladigan qator yo'q.");
    return;
  }

  for (const r of repairs) {
    console.log(
      `  o'quvchi #${r.student} · ${r.teacher} · ${f(r.amount)} so'm${
        r.reversed ? ' (bekor qilingan)' : ''
      }`,
    );
    console.log(`     dars o'tilgan : ${r.lesson}`);
    console.log(`     yorliq hozir  : ${r.from}`);
    console.log(`     yorliq bo'ladi: ${r.to}`);
  }

  const total = repairs.reduce((s, r) => s + r.amount, 0);
  console.log(`\n  Tegilgan summa (o'zgarmaydi): ${f(total)} so'm`);
  console.log(
    "  O'zgaradigan ustun: deductionTransactionId — boshqa hech nima.",
  );

  if (!APPLY) {
    console.log('\nYozish uchun: --apply bilan qayta ishga tushiring.\n');
    return;
  }

  let written = 0;
  for (const r of repairs) {
    await prisma.salaryAccrual.update({
      where: { id: r.accrualId },
      data: { deductionTransactionId: r.toId },
    });
    written++;
  }
  console.log(`\n✅ ${written} ta yorliq to'g'rilandi.\n`);

  // Re-run the same detection against the written state. If the repair is
  // sound this must come back empty; anything left means the rule and the
  // write disagree, which is worth knowing immediately.
  const left = await collect();
  console.log(
    left.length === 0
      ? "✅ Qayta tekshiruv: noto'g'ri yorliq qolmadi."
      : `⚠️  Qayta tekshiruv: hali ${left.length} ta qoldi.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
