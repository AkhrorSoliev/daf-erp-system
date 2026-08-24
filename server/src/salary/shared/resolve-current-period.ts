import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Accept either the root client or a transaction client so callers running
// inside a `prisma.$transaction(...)` (e.g. createAccrual during retroactive
// billing) can resolve the period from the same Serializable snapshot. Both
// expose `.salaryPeriodSetting.findFirst`, which is all this module uses.
type PrismaLike = PrismaService | Prisma.TransactionClient;

const DEFAULT_CYCLE_START_DAY = 8;
// Asia/Tashkent has no DST and is fixed at +05:00. Conversion is a flat
// offset, no IANA TZ dance required.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Find the active SalaryPeriodSetting for `companyId` at `now` and compute
 * `[periodStart, periodEnd]` based on its `cycleStartDay`.
 *
 * cycleStartDay = 8 means: the period covers
 *   [previous month day 8 @ 00:00 Tashkent, current month day 8 @ 00:00 Tashkent - 1ms]
 * when `now` falls in current month and day-of-month >= 8. If today is
 * before the start day, the period spans [previous-1, previous].
 *
 * Returns the legacy 8th→7th window if no setting exists for the company.
 */
export async function resolveCurrentPeriod(
  prisma: PrismaLike,
  companyId: number,
  now: Date,
): Promise<PeriodBounds & { cycleStartDay: number }> {
  const setting = await prisma.salaryPeriodSetting.findFirst({
    where: {
      companyId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { cycleStartDay: true },
  });

  const cycleStartDay = setting?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY;
  return { ...computePeriodBounds(now, cycleStartDay), cycleStartDay };
}

/**
 * The salary period that has most recently FINISHED as of `now` — i.e. the
 * one payroll should settle. `resolveCurrentPeriod` returns the period `now`
 * is currently INSIDE (still in progress); this returns the one right before
 * it.
 *
 * Why payroll needs this: the cron fires on `cycleStartDay`, and on that day
 * the "current" period is the one just STARTING — settling it would pay an
 * almost-empty window and strand the month that just ended. Settling the
 * completed period instead means "pay for the cycle that just finished",
 * which is correct whether triggered by the cron on the start day or manually
 * a few days later. (A teacher's live "joriy davr" breakdown still uses
 * `resolveCurrentPeriod` — that view genuinely wants the in-progress period.)
 *
 * Resolves the previous period from the instant just before the current one
 * started, so a `cycleStartDay` cutover that just took effect still settles
 * the closed period on its OLD schedule.
 */
export async function resolveCompletedPeriod(
  prisma: PrismaLike,
  companyId: number,
  now: Date,
): Promise<PeriodBounds & { cycleStartDay: number }> {
  const current = await resolveCurrentPeriod(prisma, companyId, now);
  const lastInstantOfPreviousPeriod = new Date(
    current.periodStart.getTime() - 1,
  );
  return resolveCurrentPeriod(prisma, companyId, lastInstantOfPreviousPeriod);
}

/**
 * Pure function (no DB) — exposed for unit tests and the cron's
 * "is today the cycle start day for this company?" check.
 */
export interface PeriodBounds {
  /** Tashkent-shifted instants — for TIMESTAMP columns (`creditPeriodDate`, `SalaryPayment.periodStart`). */
  periodStart: Date;
  /** Inclusive, for use with `lte` on TIMESTAMP columns. */
  periodEnd: Date;
  /**
   * Unshifted UTC calendar dates — for `@db.Date` columns (`SalaryAccrual.lessonDate`,
   * `Attendance.date`, `Expense.date`).
   *
   * WHY A SECOND PAIR: Postgres compares a `date` column against a timestamp by
   * truncating the timestamp to its UTC calendar date. The Tashkent-shifted
   * start of July is `2026-06-30T19:00:00Z`, which truncates to **2026-06-30** —
   * so `lessonDate >= periodStart` silently pulled the last day of June into
   * July. That day therefore landed in BOTH periods, inflating the July salary
   * figure by 1 819 343 so'm in production and carrying that error into the
   * Foyda card, the Excel «Sof foyda» sheet and the Telegram daily report.
   *
   * The upper bound is EXCLUSIVE on purpose: `lte …T18:59:59.999Z` truncates to
   * the last day of the period and would include it twice over. Use
   * `{ gte: periodStartDate, lt: periodEndDateExclusive }`.
   */
  periodStartDate: Date;
  periodEndDateExclusive: Date;
}

export function computePeriodBounds(
  now: Date,
  cycleStartDay: number,
): PeriodBounds {
  // Convert `now` to a Tashkent-local date so day-of-month uses the user's wall clock.
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const tYear = tashkentNow.getUTCFullYear();
  const tMonth = tashkentNow.getUTCMonth();
  const tDay = tashkentNow.getUTCDate();

  let periodStartTashkent: Date;
  let periodEndTashkentExclusive: Date;

  if (tDay >= cycleStartDay) {
    // We're inside the period that started this month.
    periodStartTashkent = new Date(Date.UTC(tYear, tMonth, cycleStartDay));
    periodEndTashkentExclusive = new Date(
      Date.UTC(tYear, tMonth + 1, cycleStartDay),
    );
  } else {
    // Period started last month.
    periodStartTashkent = new Date(Date.UTC(tYear, tMonth - 1, cycleStartDay));
    periodEndTashkentExclusive = new Date(
      Date.UTC(tYear, tMonth, cycleStartDay),
    );
  }

  // Convert back to UTC by subtracting the offset.
  const periodStart = new Date(
    periodStartTashkent.getTime() - TASHKENT_OFFSET_MS,
  );
  // periodEnd is inclusive (used with `lte`). Subtract 1ms from the next-period start.
  const periodEnd = new Date(
    periodEndTashkentExclusive.getTime() - TASHKENT_OFFSET_MS - 1,
  );

  return {
    periodStart,
    periodEnd,
    // The Tashkent calendar dates BEFORE the offset is subtracted are exactly
    // the plain UTC-midnight values a `@db.Date` comparison needs.
    periodStartDate: periodStartTashkent,
    periodEndDateExclusive: periodEndTashkentExclusive,
  };
}

/**
 * Parse a 'YYYY-MM-DD' string as 00:00 Tashkent of that calendar date,
 * returned as a UTC Date. Mirrors the salary config/period parsers so a
 * manually-picked calculate date aligns exactly with the period boundaries
 * `computePeriodBounds` produces.
 */
export function parseTashkentDateStart(input: string): Date {
  const utc = new Date(`${input}T00:00:00.000Z`);
  return new Date(utc.getTime() - TASHKENT_OFFSET_MS);
}

/**
 * 00:00 Tashkent of the calendar day `now` falls on, as a UTC instant.
 *
 * Only `getUTC*` and arithmetic — so the answer does not depend on the
 * timezone of the machine running it. That is the whole point: the previous
 * version of this in `SalaryConfigService` went through
 * `toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })` and then
 * `setHours(0,0,0,0)`, and `setHours` works in the PROCESS's local zone. The
 * result was correct on a UTC host and five hours early on a Tashkent one:
 *
 *     TZ=UTC            → 2026-08-23T19:00:00Z   (correct)
 *     TZ=Asia/Tashkent  → 2026-08-23T14:00:00Z   (-5h)
 *     TZ=America/New_York → 2026-08-23T23:00:00Z (+4h)
 *
 * Five hours early means a rate version starts at 19:00 the previous evening,
 * so the evening lessons of the day before are paid at the NEW rate — which is
 * a money error at a school that teaches in the evening.
 *
 * `now` is a parameter so this is testable without touching the clock.
 */
export function tashkentStartOfToday(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnight - TASHKENT_OFFSET_MS);
}

/**
 * Returns true iff `now` is the cycle start day for the active setting.
 * Used by the daily cron to decide whether to run the calculation today.
 */
export async function isCycleStartDayForCompany(
  prisma: PrismaLike,
  companyId: number,
  now: Date,
): Promise<boolean> {
  const setting = await prisma.salaryPeriodSetting.findFirst({
    where: {
      companyId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { cycleStartDay: true },
  });
  const cycleStartDay = setting?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY;
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return tashkentNow.getUTCDate() === cycleStartDay;
}
