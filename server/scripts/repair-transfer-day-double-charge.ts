/**
 * One-off (ADR-0137): give back the lesson day that a group change billed in
 * two groups. Logic and tests: `scripts/lib/transfer-day-repair.ts`.
 *
 * Only the students named in `--students=` are looked at, so a case nobody
 * has judged (several days in two groups, contract 6.2) is never touched.
 *
 * Dry run (default): the connection is READ-ONLY, nothing is written.
 *   cd server && railway run npx ts-node --transpile-only \
 *     scripts/repair-transfer-day-double-charge.ts --students=11198,11196
 *
 * Apply, with the count the dry run printed:
 *   ... --students=11198,11196 --apply --expect=2
 *
 * Each day: the later group's charge loses the day (`frozenOutDates`,
 * `coveredLessons`, `chargedAmount`) and the student gets one ADJUSTMENT row
 * (`monthly-release`, the price of one lesson). Teacher accruals are not
 * touched: the day stays in the group that has the attendance.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { cancelledLessonRelease } from '../src/billing/departure-release';
import { tashkentDateStr } from '../src/attendance/shared/date-utils';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import {
  planRepair,
  RepairCharge,
  RepairDrop,
} from './lib/transfer-day-repair';

const USAGE =
  'Usage: --students=<id,id,…> [--apply --expect=<number of days the dry run printed>]';
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
      `Guruh almashgan kun ikki marta hisoblangan — ${apply ? 'APPLY' : 'DRY RUN (faqat o‘qiydi)'}`,
    );

    const rows = await prisma.enrollmentMonthlyCharge.findMany({
      where: { studentId: { in: studentIds }, status: 'CHARGED' },
      select: {
        id: true,
        enrollmentId: true,
        studentId: true,
        groupId: true,
        branchId: true,
        periodYear: true,
        periodMonth: true,
        coveredDates: true,
        frozenOutDates: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        group: { select: { name: true } },
        enrollment: { select: { createdAt: true } },
      },
    });
    const charges: RepairCharge[] = rows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      enrollmentCreatedAt: r.enrollment.createdAt,
      studentId: r.studentId,
      groupId: r.groupId,
      groupName: r.group.name,
      branchId: r.branchId,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      coveredDates: r.coveredDates ?? [],
      frozenOutDates: r.frozenOutDates ?? [],
      perLessonCost: r.perLessonCost,
      discountPercent: r.discountPercent,
      chargedAmount: r.chargedAmount,
    }));

    const attendance = await prisma.attendance.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, groupId: true, date: true },
    });
    const attendanceGroups = new Map<string, Set<string>>();
    for (const a of attendance) {
      const k = `${a.studentId}|${tashkentDateStr(a.date)}`;
      attendanceGroups.set(
        k,
        (attendanceGroups.get(k) ?? new Set()).add(a.groupId),
      );
    }

    const { drops, ambiguous } = planRepair(charges, attendanceGroups);
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
      const mine = drops.filter((d) => d.studentId === id);
      const sum = mine.reduce((s, d) => s + d.amount, 0);
      total += sum;
      console.log(
        `\n#${id}  balans ${fmt(balances.get(id) ?? 0)}  ->  ${fmt((balances.get(id) ?? 0) + sum)}`,
      );
      if (mine.length === 0) console.log('    olinadigan kun yo‘q');
      for (const d of mine) {
        console.log(
          `    ${d.groupName} ${d.period}: ${d.day} olinadi (+${fmt(d.amount)}), kun ${d.keptIn} da qoladi [${d.keptBecause}]`,
        );
      }
    }
    for (const a of ambiguous) {
      console.log(
        `\n  QO'LDA: #${a.studentId} ${a.day} — ${a.groups.join(' + ')} ikkalasida davomat bor, tegilmaydi`,
      );
    }
    console.log(`\nJAMI: ${drops.length} kun, +${fmt(total)} so'm`);

    if (!apply) {
      console.log(
        `\nDRY RUN — bazaga hech narsa yozilmadi. Yozish uchun: --apply --expect=${drops.length}`,
      );
      return;
    }
    if (expect !== drops.length) {
      throw new UsageError(
        `--expect=${expect} but the plan has ${drops.length} days: nothing written. Run the dry run again.`,
      );
    }

    const writer = new TransactionsWriteService(
      prisma,
      new CashMovementsService(prisma),
    );
    const byCharge = new Map<string, RepairDrop[]>();
    for (const d of drops) {
      byCharge.set(d.chargeId, [...(byCharge.get(d.chargeId) ?? []), d]);
    }
    let applied = 0;
    for (const [chargeId, list] of byCharge) {
      await prisma.$transaction(
        async (tx) => {
          const live = await tx.enrollmentMonthlyCharge.findUniqueOrThrow({
            where: { id: chargeId },
          });
          let frozenOut = live.frozenOutDates ?? [];
          let charged = live.chargedAmount;
          for (const d of list) {
            // Re-read inside the transaction: a day already given back is skipped.
            const release = cancelledLessonRelease(
              {
                coveredDates: live.coveredDates ?? [],
                frozenOutDates: frozenOut,
                perLessonCost: live.perLessonCost,
                discountPercent: live.discountPercent,
                chargedAmount: charged,
              },
              d.day,
            );
            if (!release) continue;
            await writer.createAdjustment(
              {
                studentId: d.studentId,
                amount: release.amount,
                companyId: live.companyId,
                branchId: live.branchId,
                description: `Guruh almashganda ${d.day} kuni ikki guruhda hisoblangan edi — 1 dars puli qaytarildi (ADR-0137)`,
                actor: { kind: 'system' },
                metadata: {
                  kind: 'monthly-release',
                  enrollmentId: d.enrollmentId,
                  period: d.period,
                  lessons: 1,
                  dates: [d.day],
                  transferDayRepair: true,
                },
              },
              tx,
            );
            frozenOut = release.frozenOutAfter ?? frozenOut;
            charged -= release.amount;
            applied++;
          }
          await tx.enrollmentMonthlyCharge.update({
            where: { id: chargeId },
            data: {
              frozenOutDates: frozenOut,
              coveredLessons:
                (live.coveredDates ?? []).length - frozenOut.length,
              chargedAmount: charged,
            },
          });
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 30_000 },
      );
    }
    console.log(`\nYozildi: ${applied} kun.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
