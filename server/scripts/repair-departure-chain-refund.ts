/**
 * One-off (ADR-0140): give back the month money that a departure of a
 * re-joined enrollment never refunded. Logic and tests:
 * `scripts/lib/departure-chain-repair.ts`.
 *
 * Only the students named in `--students=` are looked at: whoever lists a
 * student has decided that contract 6.2 does not keep his money (the dry run
 * prints the 6.2 outcome beside each refund).
 *
 * Dry run (default): the connection is READ-ONLY, nothing is written.
 *   cd server && railway run npx ts-node --transpile-only \
 *     scripts/repair-departure-chain-refund.ts --students=11323,10353
 *
 * Apply, with the count the dry run printed:
 *   ... --students=11323,10353 --apply --expect=2
 *
 * Each refund: the holder charge loses the days (`frozenOutDates`,
 * `coveredLessons`, `chargedAmount`) and the student gets one ADJUSTMENT row
 * (`monthly-release`, `chargeEnrollmentId`). Teacher accruals are not touched.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { tashkentDateStr } from '../src/attendance/shared/date-utils';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import {
  ChainCharge,
  ChainEnrollment,
  chainRelease,
  planChainRefunds,
} from './lib/departure-chain-repair';

const USAGE =
  'Usage: --students=<id,id,…> [--apply --expect=<number of refunds the dry run printed>]';
const fmt = (n: number) => n.toLocaleString('ru-RU');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function main() {
  const rest = process.argv.slice(2);
  const studentsArg = rest.find((a) => a.startsWith('--students='));
  const { apply, expect } = parseApplyExpectArgs(
    rest.filter((a) => !a.startsWith('--students=')),
    USAGE,
  );
  const studentIds = (studentsArg ?? '')
    .slice('--students='.length)
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (studentIds.length === 0 || studentIds.some((n) => !Number.isInteger(n))) {
    throw new UsageError(USAGE);
  }
  if (!apply) process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL!);

  const prisma = new PrismaService();
  try {
    printHeader(
      `Qayta qo'shilgan yozilish ketganda pul qaytmagan — ${apply ? 'APPLY' : "DRY RUN (faqat o'qiydi)"}`,
    );

    const enrollmentRows = await prisma.enrollment.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        createdAt: true,
        statusChangedAt: true,
        group: { select: { name: true } },
      },
    });
    const enrollments: ChainEnrollment[] = enrollmentRows
      .filter((e) => e.statusChangedAt)
      .map((e) => ({
        id: e.id,
        studentId: e.studentId,
        groupId: e.groupId,
        groupName: e.group.name,
        status: e.status,
        createdAt: e.createdAt,
        departureDay: tashkentDateStr(e.statusChangedAt!),
      }));

    const chargeRows = await prisma.enrollmentMonthlyCharge.findMany({
      where: { studentId: { in: studentIds }, status: 'CHARGED' },
      select: {
        id: true,
        enrollmentId: true,
        studentId: true,
        groupId: true,
        branchId: true,
        companyId: true,
        periodYear: true,
        periodMonth: true,
        coveredDates: true,
        frozenOutDates: true,
        coveredLessons: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        enrollment: { select: { createdAt: true } },
      },
    });
    const charges: ChainCharge[] = chargeRows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      enrollmentCreatedAt: r.enrollment.createdAt,
      studentId: r.studentId,
      groupId: r.groupId,
      branchId: r.branchId,
      companyId: r.companyId,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      coveredDates: r.coveredDates ?? [],
      frozenOutDates: r.frozenOutDates ?? [],
      coveredLessons: r.coveredLessons,
      perLessonCost: r.perLessonCost,
      discountPercent: r.discountPercent ?? 0,
      chargedAmount: r.chargedAmount,
    }));

    const plan = planChainRefunds(enrollments, charges);
    const balances = new Map(
      (
        await prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, balance: true },
        })
      ).map((s) => [s.id, s.balance]),
    );

    let total = 0;
    for (const id of studentIds) {
      const mine = plan.filter((p) => p.studentId === id);
      const sum = mine.reduce((s, p) => s + p.amount, 0);
      total += sum;
      const bal = balances.get(id) ?? 0;
      console.log(`\n#${id}  balans ${fmt(bal)}  ->  ${fmt(bal + sum)}`);
      if (mine.length === 0) console.log("    qaytariladigan pul yo'q");
      for (const p of mine) {
        console.log(
          `    ${p.groupName} ${p.period}: ${p.departureDay} dan keyin ${p.dates.join(', ')} (${p.lessons} dars) +${fmt(p.amount)}` +
            ` — hisob ${p.chargeEnrollmentId.slice(0, 8)} yozilishida` +
            (p.withheldUnder62 ? ' [6.2 bo‘yicha ushlanardi]' : ''),
        );
      }
    }
    console.log(`\nJAMI: ${plan.length} qaytarish, +${fmt(total)} so'm`);

    if (!apply) {
      console.log(
        `\nDRY RUN — bazaga hech narsa yozilmadi. Yozish uchun: --apply --expect=${plan.length}`,
      );
      return;
    }
    if (expect !== plan.length) {
      throw new UsageError(
        `--expect=${expect} but the plan has ${plan.length} refunds: nothing written. Run the dry run again.`,
      );
    }

    const writer = new TransactionsWriteService(
      prisma,
      new CashMovementsService(prisma),
    );
    let applied = 0;
    for (const p of plan) {
      await prisma.$transaction(
        async (tx) => {
          const live = await tx.enrollmentMonthlyCharge.findUniqueOrThrow({
            where: { id: p.chargeId },
          });
          // Re-read inside the transaction: days already given back are skipped.
          const r = chainRelease(
            {
              id: live.id,
              enrollmentId: live.enrollmentId,
              enrollmentCreatedAt: new Date(0),
              studentId: live.studentId,
              groupId: live.groupId,
              branchId: live.branchId,
              companyId: live.companyId,
              periodYear: live.periodYear,
              periodMonth: live.periodMonth,
              coveredDates: live.coveredDates ?? [],
              frozenOutDates: live.frozenOutDates ?? [],
              coveredLessons: live.coveredLessons,
              perLessonCost: live.perLessonCost,
              discountPercent: live.discountPercent ?? 0,
              chargedAmount: live.chargedAmount,
            },
            p.departureDay,
          );
          if (!r || r.amount <= 0) return;
          await writer.createAdjustment(
            {
              studentId: p.studentId,
              amount: r.amount,
              companyId: live.companyId,
              branchId: live.branchId,
              description: `Guruhdan chiqqanda oy puli qaytmagan edi — o'tmagan ${r.lessons} dars puli qaytarildi (ADR-0140)`,
              actor: { kind: 'system' },
              metadata: {
                kind: 'monthly-release',
                enrollmentId: p.enrollmentId,
                chargeEnrollmentId: p.chargeEnrollmentId,
                period: p.period,
                lessons: r.lessons,
                policy: 'CENTER_INITIATIVE',
                dates: r.dates,
                departureChainRepair: true,
              },
            },
            tx,
          );
          await tx.enrollmentMonthlyCharge.update({
            where: { id: p.chargeId },
            data: {
              frozenOutDates: r.frozenOutAfter,
              coveredLessons:
                (live.coveredDates ?? []).length - r.frozenOutAfter.length,
              chargedAmount: live.chargedAmount - r.amount,
            },
          });
          applied++;
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 30_000 },
      );
    }
    console.log(`\nYozildi: ${applied} qaytarish.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
