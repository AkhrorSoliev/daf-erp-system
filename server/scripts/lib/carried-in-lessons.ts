/**
 * Lessons of the migrated month that a lesson pack bought BEFORE the month
 * already paid for.
 *
 * The monthly migration reverses the month's own pack deductions and bills
 * the whole month as one charge. A pack bought earlier (say in August) that
 * was still being consumed in September has already paid for those September
 * lessons, so the monthly charge bills them a second time. This module finds
 * them in the ledger coverage and prices them at the pack's own cycle
 * pricing, so the migration can credit them back exactly once.
 */
import { Prisma, TransactionType } from '@prisma/client';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
  type CoverageResult,
} from '../../src/billing/lesson-coverage.helper';
import { cycleCostFor } from '../../src/billing/lesson-price';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthRangeUtc,
} from '../../src/common/date/tashkent';

export interface CarriedInBatch {
  deductionId: string;
  lessons: number;
  value: number;
}

export interface CarriedIn {
  lessons: number;
  value: number;
  batches: CarriedInBatch[];
}

export function emptyCarriedIn(): CarriedIn {
  return { lessons: 0, value: 0, batches: [] };
}

export interface CarriedInPeriod {
  /** First day of the month, Tashkent calendar, 'YYYY-MM-DD'. */
  firstDay: string;
  /** Last day of the month, Tashkent calendar, 'YYYY-MM-DD'. */
  lastDay: string;
  /** 00:00 Tashkent on the first day, as a UTC instant. */
  startUtc: Date;
}

/** `period` is a 'YYYY-MM' month key. */
export function carriedInPeriodFor(period: string): CarriedInPeriod {
  return {
    firstDay: `${period}-01`,
    lastDay: addDaysToDateStr(`${addMonthsToMonthKey(period, 1)}-01`, -1),
    startUtc: tashkentMonthRangeUtc(period).gte,
  };
}

export function carriedInForEnrollment(params: {
  enrollmentId: string;
  /**
   * The enrollment's start day ('YYYY-MM-DD'). The monthly charge bills the
   * month's lessons from that day on only (`lessonDatesInMonth({ fromDate })`),
   * so a lesson before it is not billed twice and is not credited.
   */
  fromDay?: string | null;
  coverage: CoverageResult;
  deductions: ReadonlyMap<string, { createdAt: Date; amount: number }>;
  period: CarriedInPeriod;
}): CarriedIn {
  const { firstDay, lastDay, startUtc } = params.period;
  const windowStart =
    params.fromDay && params.fromDay > firstDay ? params.fromDay : firstDay;
  const result = emptyCarriedIn();
  for (const [deductionId, cov] of params.coverage.byDeduction) {
    if (cov.enrollmentId !== params.enrollmentId) continue;
    const facts = params.deductions.get(deductionId);
    // Only packs bought before the month; the month's own packs are reversed
    // by the migration and hand their money back through the reversal.
    if (!facts || facts.createdAt >= startUtc) continue;

    const days = cov.consumedDates.map((d) => tashkentDateStr(d));
    const before = days.filter((d) => d < windowStart).length;
    const inWindow = days.filter(
      (d) => d >= windowStart && d <= lastDay,
    ).length;
    if (inWindow === 0) continue;

    // The pack amount is already discounted and puts the cycle's rounding
    // remainder on its last lesson, so price positions (before, before +
    // inWindow] of THIS pack. Positions past the capacity are overflow —
    // lessons the pack never paid for — and cycleCostFor clamps them away.
    const packCost = -facts.amount; // a deduction is negative (ADR-0004: no Math.abs)
    const value =
      cycleCostFor(packCost, cov.capacity, before + inWindow) -
      cycleCostFor(packCost, cov.capacity, before);
    if (value <= 0) continue;
    const lessons =
      Math.min(before + inWindow, cov.capacity) -
      Math.min(before, cov.capacity);

    result.batches.push({ deductionId, lessons, value });
    result.lessons += lessons;
    result.value += value;
  }
  return result;
}

export async function loadCarriedIn(
  db: Prisma.TransactionClient,
  enrollments: ReadonlyArray<{ id: string; startDate: Date | null }>,
  period: CarriedInPeriod,
): Promise<Map<string, CarriedIn>> {
  const out = new Map<string, CarriedIn>();
  if (enrollments.length === 0) return out;
  const ids = enrollments.map((e) => e.id);

  const coverage = await computeEnrollmentCoverage(
    db as unknown as CoveragePrismaLike,
    ids,
  );
  // Same filter as the coverage engine: a reversal counter-row also carries
  // reversedAt = null, so both halves of a reversed pair are left out.
  const rows = await db.transaction.findMany({
    where: {
      enrollmentId: { in: ids },
      type: TransactionType.LESSON_DEDUCTION,
      reversedAt: null,
      reversedTransactionId: null,
    },
    select: { id: true, createdAt: true, amount: true },
  });
  const deductions = new Map(
    rows.map((r) => [r.id, { createdAt: r.createdAt, amount: r.amount }]),
  );

  for (const e of enrollments) {
    out.set(
      e.id,
      carriedInForEnrollment({
        enrollmentId: e.id,
        fromDay: e.startDate ? tashkentDateStr(e.startDate) : null,
        coverage,
        deductions,
        period,
      }),
    );
  }
  return out;
}
