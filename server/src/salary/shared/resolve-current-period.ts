import { PrismaService } from '../../prisma/prisma.service';

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
  prisma: PrismaService,
  companyId: number,
  now: Date,
): Promise<{ periodStart: Date; periodEnd: Date; cycleStartDay: number }> {
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
 * Pure function (no DB) — exposed for unit tests and the cron's
 * "is today the cycle start day for this company?" check.
 */
export function computePeriodBounds(
  now: Date,
  cycleStartDay: number,
): { periodStart: Date; periodEnd: Date } {
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
  const periodStart = new Date(periodStartTashkent.getTime() - TASHKENT_OFFSET_MS);
  // periodEnd is inclusive (used with `lte`). Subtract 1ms from the next-period start.
  const periodEnd = new Date(
    periodEndTashkentExclusive.getTime() - TASHKENT_OFFSET_MS - 1,
  );

  return { periodStart, periodEnd };
}

/**
 * Returns true iff `now` is the cycle start day for the active setting.
 * Used by the daily cron to decide whether to run the calculation today.
 */
export async function isCycleStartDayForCompany(
  prisma: PrismaService,
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
