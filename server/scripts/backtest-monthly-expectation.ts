/**
 * READ-ONLY: how good is «Oy oxiriga kutilyapti»?
 *
 * Replays a month as it looked on selected days (`asOf`) and compares each
 * replay to the month's real closing figure. For a CLOSED month the day-31
 * replay must equal the actual value exactly — there are no remaining lessons,
 * so `expectedValue` collapses onto `heldValue`. That equality is the
 * self-check; if it fails, the calendar walk or the held/remaining seam is
 * wrong and nothing downstream should be trusted.
 *
 * Caveat worth reading before trusting the early rows: the roster is TODAY's,
 * not that day's, so an early replay has hindsight about who is enrolled. It
 * measures the calendar math, not the roster.
 *
 * Usage: railway run npx ts-node scripts/backtest-monthly-expectation.ts 2026-07
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
import { buildHolidayDateSetsByBranch } from '../src/holidays/holiday-date-set';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

/**
 * `HolidaysService` drags in the status/history/cascade graph, none of which
 * the holiday read touches. A script has no Nest container, so the one method
 * the expectation service calls goes straight to `holiday-date-set.ts`, the
 * function the service itself delegates to.
 */
const holidayStub = {
  buildHolidayDateSetsByBranch: (rangeStart: Date, rangeEnd: Date) =>
    buildHolidayDateSetsByBranch(prisma, rangeStart, rangeEnd),
};

async function main() {
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  });
  if (!company) throw new Error('no company');
  const month =
    process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-07';

  // No Redis in a script — the cache helper degrades to computing.
  const service = new ReportsExpectationService(
    prisma as any,
    holidayStub as any,
    undefined as any,
  );

  const actual = await service.getMonthlyExpectation(company.id, {
    month,
    branchIds: null,
  });

  console.log(`\n${company.name} — ${month}\n`);
  console.log(`O'tilgan va qoplangan : ${fmt(actual.heldValue)} (${fmt(actual.heldLessons)} dars)`);
  console.log(`Qolgan kutilayotgan   : ${fmt(actual.remainingValue)} (${fmt(actual.remainingLessons)} dars)`);
  console.log(`KUTILAYOTGAN (jami)   : ${fmt(actual.expectedValue)}\n`);

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  console.log("  Kun   Bashorat            Farq              Xato   Fakt ulushi");
  console.log('  ────  ──────────────────  ────────────────  ─────  ───────────');
  for (const day of [1, 5, 10, 15, 20, 25, lastDay]) {
    const asOf = `${month}-${String(day).padStart(2, '0')}`;
    const r = await service.getMonthlyExpectation(company.id, {
      month,
      branchIds: null,
      asOf,
    });
    const diff = r.expectedValue - actual.expectedValue;
    const errPct =
      actual.expectedValue > 0
        ? (Math.abs(diff) / actual.expectedValue) * 100
        : 0;
    const factShare =
      actual.heldLessons > 0 ? (r.heldLessons / actual.heldLessons) * 100 : 0;
    console.log(
      `  ${String(day).padStart(4)}  ${fmt(r.expectedValue).padStart(18)}  ` +
        `${((diff >= 0 ? '+' : '') + fmt(diff)).padStart(16)}  ` +
        `${errPct.toFixed(1).padStart(4)}%  ${factShare.toFixed(0).padStart(10)}%`,
    );
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
