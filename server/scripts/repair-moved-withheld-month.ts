/**
 * One-off (follows ADR-0137): four students were taken out of a group with the
 * note «ko'chdi» (moved to another group) through the plain removal, which
 * defaults to contract 6.2 («student's own decision»): the old group kept the
 * rest of the month's money while the new group charged the same days again.
 * A move is not a cancellation — a transfer returns the unheld lessons — so the
 * old group gives back the days after the day he left.
 *
 * Only the cases below, each judged by hand. `leftOn` is the Tashkent day he
 * left the old group; `alsoDay` is a day billed in the new group as well (he
 * attended there), so the old group gives that one back too.
 *
 * Dry run (default): read-only connection, nothing is written.
 *   cd server && railway run npx ts-node --transpile-only scripts/repair-moved-withheld-month.ts
 * Apply, with the count the dry run printed:
 *   ... --apply --expect=<lessons>
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import {
  cancelledLessonRelease,
  departureRelease,
} from '../src/billing/departure-release';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs } from './lib/apply-expect-args';

interface Case {
  studentId: number;
  group: string;
  leftOn: string;
  alsoDay?: string;
  /** Tells two charges of one group apart (a student who rejoined). */
  chargedAmount?: number;
}

// #11225 is left out on purpose: he never attended the new group (#064) and was
// dropped there as unreachable, so he left the centre and 6.2 stands.
const CASES: Case[] = [
  { studentId: 10783, group: '#057', leftOn: '2026-10-20' },
  {
    studentId: 10152,
    group: '#005',
    leftOn: '2026-10-21',
    chargedAmount: 311538,
  },
  {
    studentId: 11160,
    group: '#076',
    leftOn: '2026-10-21',
    alsoDay: '2026-10-21',
  },
];
const PERIOD = { year: 2026, month: 10 };
const fmt = (n: number) => n.toLocaleString('ru-RU');

async function main() {
  const { apply, expect } = parseApplyExpectArgs(
    process.argv.slice(2),
    'Usage: [--apply --expect=<lessons the dry run printed>]',
  );
  if (!apply) {
    const u = new URL(process.env.DATABASE_URL!);
    u.searchParams.set('options', '-c default_transaction_read_only=on');
    process.env.DATABASE_URL = u.toString();
  }
  const prisma = new PrismaService();
  try {
    printHeader(
      `Ko'chganda ushlab qolingan oy puli — ${apply ? 'APPLY' : 'DRY RUN (faqat o‘qiydi)'}`,
    );

    interface Plan {
      c: Case;
      chargeId: string;
      enrollmentId: string;
      companyId: number;
      branchId: number;
      days: string[];
      amount: number;
      frozenOutAfter: string[];
    }
    const plans: Plan[] = [];
    for (const c of CASES) {
      const charges = await prisma.enrollmentMonthlyCharge.findMany({
        where: {
          studentId: c.studentId,
          status: 'CHARGED',
          periodYear: PERIOD.year,
          periodMonth: PERIOD.month,
          group: { name: c.group },
          ...(c.chargedAmount ? { chargedAmount: c.chargedAmount } : {}),
          enrollment: { status: { not: 'ACTIVE' } },
        },
      });
      if (charges.length !== 1) {
        throw new Error(
          `#${c.studentId} ${c.group}: expected 1 charge, found ${charges.length}`,
        );
      }
      const ch = charges[0];
      const base = {
        coveredDates: ch.coveredDates ?? [],
        perLessonCost: ch.perLessonCost,
        discountPercent: ch.discountPercent,
      };
      let frozen = ch.frozenOutDates ?? [];
      let charged = ch.chargedAmount;
      let amount = 0;
      const days: string[] = [];
      const rest = departureRelease({
        ...base,
        departureDay: c.leftOn,
        frozenOutDates: frozen,
        coveredLessons: ch.coveredLessons,
        chargedAmount: charged,
        lessonsThroughDeparture: 0,
      });
      if (rest) {
        amount += rest.amount;
        charged -= rest.amount;
        const before = new Set(frozen);
        for (const d of rest.frozenOutAfter ?? [])
          if (!before.has(d)) days.push(d);
        frozen = rest.frozenOutAfter ?? frozen;
      }
      if (c.alsoDay) {
        const one = cancelledLessonRelease(
          { ...base, frozenOutDates: frozen, chargedAmount: charged },
          c.alsoDay,
        );
        if (one) {
          amount += one.amount;
          days.push(c.alsoDay);
          frozen = one.frozenOutAfter ?? frozen;
        }
      }
      plans.push({
        c,
        chargeId: ch.id,
        enrollmentId: ch.enrollmentId,
        companyId: ch.companyId,
        branchId: ch.branchId,
        days: days.sort(),
        amount,
        frozenOutAfter: frozen,
      });
    }

    let lessons = 0;
    let total = 0;
    for (const p of plans) {
      const bal = (
        await prisma.student.findUniqueOrThrow({
          where: { id: p.c.studentId },
          select: { balance: true },
        })
      ).balance;
      lessons += p.days.length;
      total += p.amount;
      console.log(
        `\n#${p.c.studentId}  ${p.c.group}: ketgan kun ${p.c.leftOn}; balans ${fmt(bal)} -> ${fmt(bal + p.amount)}`,
      );
      console.log(
        `    qaytariladi: ${p.days.map((d) => d.slice(8)).join(', ') || '—'} (${p.days.length} dars, +${fmt(p.amount)})`,
      );
    }
    console.log(`\nJAMI: ${lessons} dars, +${fmt(total)} so'm`);
    if (!apply) {
      console.log(
        `\nDRY RUN — bazaga hech narsa yozilmadi. Yozish uchun: --apply --expect=${lessons}`,
      );
      return;
    }
    if (expect !== lessons) {
      throw new Error(
        `--expect=${expect} but the plan has ${lessons} lessons: nothing written. Run the dry run again.`,
      );
    }

    const writer = new TransactionsWriteService(
      prisma,
      new CashMovementsService(prisma),
    );
    let applied = 0;
    for (const p of plans) {
      if (p.days.length === 0) continue;
      await prisma.$transaction(
        async (tx) => {
          const live = await tx.enrollmentMonthlyCharge.findUniqueOrThrow({
            where: { id: p.chargeId },
          });
          // A repeat run finds days already out and writes nothing.
          if (p.days.some((d) => (live.frozenOutDates ?? []).includes(d))) {
            console.log(`  #${p.c.studentId}: already repaired, skipped`);
            return;
          }
          await writer.createAdjustment(
            {
              studentId: p.c.studentId,
              amount: p.amount,
              companyId: p.companyId,
              branchId: p.branchId,
              description: `Boshqa guruhga ko'chganda ${p.c.group} da ushlab qolingan ${p.days.length} dars puli qaytarildi (ADR-0137)`,
              actor: { kind: 'system' },
              metadata: {
                kind: 'monthly-release',
                enrollmentId: p.enrollmentId,
                period: '2026-10',
                lessons: p.days.length,
                dates: p.days,
                movedWithheldRepair: true,
              },
            },
            tx,
          );
          await tx.enrollmentMonthlyCharge.update({
            where: { id: p.chargeId },
            data: {
              frozenOutDates: p.frozenOutAfter,
              coveredLessons:
                (live.coveredDates ?? []).length - p.frozenOutAfter.length,
              chargedAmount: live.chargedAmount - p.amount,
            },
          });
          applied += p.days.length;
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 30_000 },
      );
    }
    console.log(`\nYozildi: ${applied} dars.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
