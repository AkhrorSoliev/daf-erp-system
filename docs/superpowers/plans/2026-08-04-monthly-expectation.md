# «Oy oxiriga kutilyapti» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `exactDays × 4` revenue forecast with a lesson-value figure — held-and-covered lessons plus the remaining scheduled ones — computed from the real calendar and shown identically on every surface.

**Architecture:** A pure math module (`expectation-math.ts`) walks each group's month with the historical schedule resolver, holidays and cancellations, and splits every student-lesson into *covered* (has a live `LESSON_CONSUMPTION`) or *remaining*. A thin service (`reports-expectation.service.ts`) loads the data in bulk and calls it, cached once a Tashkent day. Part B adds branch-scoped daily snapshot columns and moves the snapshot write off the Telegram send path.

**Tech Stack:** NestJS, Prisma 7 (PostgreSQL/Neon), Jest, Redis (ioredis), Next.js client.

**Spec:** `docs/superpowers/specs/2026-08-04-monthly-expectation-design.md`

**Branch:** `feat/monthly-expectation` (already created, spec committed as `7f7ed25`)

## Global Constraints

- All UI strings are **Latin Uzbek**. Never mix Cyrillic.
- `CLAUDE.md` is English-only; other docs and this plan are Uzbek.
- Money is stored and returned as **integer so'm**. Round with `Math.round`.
- `Attendance.date` and `Expense.date` are `@db.Date` — compare against **unshifted UTC date bounds with an exclusive upper bound** (`gte Date.UTC(y,m-1,1)`, `lt Date.UTC(y,m,1)`). Never a Tashkent-shifted timestamp.
- `Payment.createdAt` is a real TIMESTAMP — Tashkent-shifted bounds are correct there.
- Every money query must carry a branch predicate when the scope is set. `null` = every branch, `[]` = **nothing** (fail closed, `isEmptyScope`).
- Branch scope type is `ReportBranchIds` from `src/common/finance/report-branch-scope.ts`. No report may accept a bare `branchId`.
- Run `npm test` (server) and `npm run build` (client) before declaring any task done.
- `prisma migrate dev` is broken in this repo — use `prisma migrate diff` + `db execute` + `migrate resolve`.

---

# PART A — hisob va ko'rsatish (migratsiyasiz)

---

### Task 1: Shared per-lesson price helper

The contract → discounted course price → course price chain is copy-pasted in `reports-financial.service.ts` and `telegram-group-daily-report.service.ts`. Both copies die in Task 7; this is the one that survives.

**Files:**
- Create: `server/src/common/finance/per-lesson-price.ts`
- Test: `server/src/common/finance/per-lesson-price.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `perLessonPrice(input: PerLessonPriceInput): number`, `type PerLessonPriceInput`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/common/finance/per-lesson-price.spec.ts
import { perLessonPrice } from './per-lesson-price';

describe('perLessonPrice', () => {
  const course = { price: 1_200_000, lessonPaymentCount: 12 };

  it('uses the active contract before anything else', () => {
    expect(
      perLessonPrice({
        course,
        discountPercent: 50,
        contractTotalAmount: 600_000,
      }),
    ).toBe(50_000);
  });

  it('applies the student discount to the course price when there is no contract', () => {
    expect(
      perLessonPrice({ course, discountPercent: 25, contractTotalAmount: null }),
    ).toBe(75_000);
  });

  it('falls back to the bare course price when discount is missing', () => {
    expect(
      perLessonPrice({ course, discountPercent: null, contractTotalAmount: null }),
    ).toBe(100_000);
  });

  it('clamps a nonsense discount into 0..100', () => {
    expect(
      perLessonPrice({ course, discountPercent: 140, contractTotalAmount: null }),
    ).toBe(0);
    expect(
      perLessonPrice({ course, discountPercent: -30, contractTotalAmount: null }),
    ).toBe(100_000);
  });

  it('treats a zero/absent lessonPaymentCount as 12', () => {
    expect(
      perLessonPrice({
        course: { price: 1_200_000, lessonPaymentCount: 0 },
        discountPercent: null,
        contractTotalAmount: null,
      }),
    ).toBe(100_000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/common/finance/per-lesson-price.spec.ts`
Expected: FAIL — `Cannot find module './per-lesson-price'`

- [ ] **Step 3: Write the implementation**

```ts
// server/src/common/finance/per-lesson-price.ts

/**
 * One student's price for ONE lesson.
 *
 * The three-step fallback is the centre's actual pricing policy and was
 * copy-pasted in the revenue forecast and the Telegram daily report. Both
 * copies are gone; this is the only implementation.
 *
 *   1. an ACTIVE Contract's negotiated total, so a chegirmali shartnoma is
 *      priced exactly as agreed;
 *   2. course price with the student's `discountPercent` applied — the modern
 *      discount lever, honoured whenever no contract is on file;
 *   3. bare course price, defensive fallback for a missing discount.
 */
export interface PerLessonPriceInput {
  course: { price: number; lessonPaymentCount: number };
  /** `Student.discountPercent`; null/undefined means no discount. */
  discountPercent: number | null | undefined;
  /** ACTIVE `Contract.totalAmount` for this student+group, else null. */
  contractTotalAmount: number | null | undefined;
}

export function perLessonPrice({
  course,
  discountPercent,
  contractTotalAmount,
}: PerLessonPriceInput): number {
  const lpc = course.lessonPaymentCount || 12;
  if (contractTotalAmount != null) {
    return Math.round(contractTotalAmount / lpc);
  }
  const full = Math.round(course.price / lpc);
  const clamped = Math.max(0, Math.min(100, discountPercent ?? 0));
  return Math.round((full * (100 - clamped)) / 100);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd server && npx jest src/common/finance/per-lesson-price.spec.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/common/finance/per-lesson-price.ts server/src/common/finance/per-lesson-price.spec.ts
git commit -m "Extract the one per-lesson pricing rule from two copies"
```

---

### Task 2: Pure expectation math

All calendar reasoning lives here as a pure function so it is testable without Prisma. Mirrors the existing `salary/shared/deserved-math.ts` pattern.

**Files:**
- Create: `server/src/reports/expectation-math.ts`
- Test: `server/src/reports/expectation-math.spec.ts`

**Interfaces:**
- Consumes: `buildScheduleDayResolver`, `ScheduleSnapshotRow` from `../attendance/shared/schedule-resolver`; `dayOfWeekForDateStr`, `addDaysToDateStr` from `../attendance/shared/date-utils`
- Produces: `splitMonthLessons(groups: ExpectationGroup[], opts: SplitOptions): LessonSplit`, and the types `ExpectationGroup`, `SplitOptions`, `LessonSplit`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/reports/expectation-math.spec.ts
import { splitMonthLessons, type ExpectationGroup } from './expectation-math';

// Avgust 2026: 1-avgust — shanba. Dushanba/chorshanba/juma darslari:
// 3,5,7,10,12,14,17,19,21,24,26,28,31 = 13 ta.
const MON_WED_FRI = ['monday', 'wednesday', 'friday'];

const group = (over: Partial<ExpectationGroup> = {}): ExpectationGroup => ({
  groupId: 'g1',
  exactDays: MON_WED_FRI,
  startDateStr: null,
  endDateStr: null,
  scheduleSnapshots: [],
  roster: [
    { studentId: 1, perLesson: 100_000 },
    { studentId: 2, perLesson: 100_000 },
  ],
  datesWithAttendance: new Set<string>(),
  cancelledDates: new Set<string>(),
  coveredAttendances: [],
  uncoveredAttendances: [],
  ...over,
});

const opts = (holidays: string[] = []) => ({
  monthStartStr: '2026-08-01',
  monthEndStr: '2026-08-31',
  holidayDates: new Set(holidays),
});

describe('splitMonthLessons', () => {
  it('counts every scheduled student-lesson in the month', () => {
    const r = splitMonthLessons([group()], opts());
    expect(r.remainingLessons).toBe(26); // 13 sana × 2 o'quvchi
    expect(r.remainingValue).toBe(2_600_000);
    expect(r.heldValue).toBe(0);
  });

  it('drops holidays', () => {
    const r = splitMonthLessons([group()], opts(['2026-08-03', '2026-08-05']));
    expect(r.remainingLessons).toBe(22); // 11 sana × 2
  });

  it('drops cancelled lessons', () => {
    const r = splitMonthLessons(
      [group({ cancelledDates: new Set(['2026-08-07']) })],
      opts(),
    );
    expect(r.remainingLessons).toBe(24);
  });

  it('drops dates outside the group lifecycle', () => {
    const r = splitMonthLessons(
      [group({ startDateStr: '2026-08-17', endDateStr: '2026-08-21' })],
      opts(),
    );
    expect(r.remainingLessons).toBe(6); // 17,19,21 × 2
  });

  it('honours a past schedule change instead of projecting today backwards', () => {
    // Guruh 15-avgustda Du/Chor/Ju dan Se/Pay ga o'tgan.
    const r = splitMonthLessons(
      [
        group({
          exactDays: ['tuesday', 'thursday'],
          scheduleSnapshots: [
            {
              exactDays: MON_WED_FRI,
              validFrom: new Date('2026-07-01T00:00:00Z'),
              validTo: new Date('2026-08-15T00:00:00Z'),
            },
            {
              exactDays: ['tuesday', 'thursday'],
              validFrom: new Date('2026-08-15T00:00:00Z'),
              validTo: null,
            },
          ],
        }),
      ],
      opts(),
    );
    // 1–14: Du/Chor/Ju → 3,5,7,10,12,14 = 6
    // 15–31: Se/Pay    → 18,20,25,27 = 4  (+ 8/18? see below)
    // Avgust 2026: seshanba 4,11,18,25; payshanba 6,13,20,27.
    // 15-dan keyin: 18,20,25,27 = 4
    expect(r.remainingLessons).toBe((6 + 4) * 2);
  });

  it('puts a taught-but-unpaid lesson on the remaining side', () => {
    const r = splitMonthLessons(
      [
        group({
          datesWithAttendance: new Set(['2026-08-03']),
          uncoveredAttendances: [{ perLesson: 100_000 }, { perLesson: 100_000 }],
        }),
      ],
      opts(),
    );
    // 03.08 rosterdan chiqdi (12 sana × 2 = 24), o'rniga 2 ta qoplanmagan dars.
    expect(r.remainingLessons).toBe(26);
    expect(r.remainingValue).toBe(2_600_000);
    expect(r.heldValue).toBe(0);
  });

  it('puts a covered lesson on the held side and never double-counts it', () => {
    const r = splitMonthLessons(
      [
        group({
          datesWithAttendance: new Set(['2026-08-03']),
          coveredAttendances: [{ perLesson: 90_000 }, { perLesson: 110_000 }],
        }),
      ],
      opts(),
    );
    expect(r.heldValue).toBe(200_000);
    expect(r.heldLessons).toBe(2);
    expect(r.remainingLessons).toBe(24); // 12 qolgan sana × 2
    expect(r.remainingLessons + r.heldLessons).toBe(26); // jami o'zgarmadi
  });

  it('does not project into an unknown pre-snapshot period', () => {
    // Snapshot faqat 20-avgustdan boshlanadi — undan oldingi jadval noma'lum.
    const r = splitMonthLessons(
      [
        group({
          scheduleSnapshots: [
            {
              exactDays: MON_WED_FRI,
              validFrom: new Date('2026-08-20T00:00:00Z'),
              validTo: null,
            },
          ],
        }),
      ],
      opts(),
    );
    expect(r.remainingLessons).toBe(6); // faqat 21,24,26,28,31 dan 20-dan keyingilari
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/reports/expectation-math.spec.ts`
Expected: FAIL — `Cannot find module './expectation-math'`

- [ ] **Step 3: Write the implementation**

```ts
// server/src/reports/expectation-math.ts
import {
  buildScheduleDayResolver,
  type ScheduleSnapshotRow,
} from '../attendance/shared/schedule-resolver';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
} from '../attendance/shared/date-utils';

/** One already-priced student-lesson that has an attendance row. */
export interface PricedAttendance {
  perLesson: number;
}

export interface ExpectationGroup {
  groupId: string;
  /** Current weekdays; the resolver falls back to these. */
  exactDays: string[];
  /** Tashkent `YYYY-MM-DD`; null = unbounded. */
  startDateStr: string | null;
  endDateStr: string | null;
  scheduleSnapshots: ScheduleSnapshotRow[];
  /** Today's ACTIVE enrollments — the roster for dates with no attendance. */
  roster: { studentId: number; perLesson: number }[];
  /** Tashkent dates that already carry at least one attendance row. */
  datesWithAttendance: Set<string>;
  /** Tashkent dates with an active LessonCancellation. */
  cancelledDates: Set<string>;
  /** Attendances WITH a live LESSON_CONSUMPTION — already paid. */
  coveredAttendances: PricedAttendance[];
  /** Attendances WITHOUT one — taught, not yet paid. */
  uncoveredAttendances: PricedAttendance[];
}

export interface SplitOptions {
  monthStartStr: string;
  monthEndStr: string;
  holidayDates: Set<string>;
}

export interface LessonSplit {
  heldValue: number;
  heldLessons: number;
  remainingValue: number;
  remainingLessons: number;
}

/**
 * Splits a month's student-lessons into what has been PAID FOR and what is
 * still expected.
 *
 * The seam is the `LESSON_CONSUMPTION` row, not the attendance row: a debtor's
 * lesson has been taught but no money arrived, so it belongs on the expected
 * side and crosses over by itself once the student pays. Because a date either
 * has attendance (then its rows are classified individually) or does not (then
 * today's roster stands in), every student-lesson is counted exactly once.
 *
 * A date that has already passed with no attendance stays on the REMAINING
 * side on purpose. Teachers routinely enter attendance late — an attendance
 * reminder cron exists for exactly that — and dropping those dates would make
 * the figure lurch on data-entry lag rather than on anything real. A lesson
 * that genuinely did not happen is recorded as a `LessonCancellation` and is
 * excluded above.
 *
 * Units are student-lessons, not group-lessons: one lesson of a 15-student
 * group is 15. That keeps counts and money in the same unit.
 */
export function splitMonthLessons(
  groups: ExpectationGroup[],
  { monthStartStr, monthEndStr, holidayDates }: SplitOptions,
): LessonSplit {
  let heldValue = 0;
  let heldLessons = 0;
  let remainingValue = 0;
  let remainingLessons = 0;

  for (const g of groups) {
    for (const a of g.coveredAttendances) {
      heldValue += a.perLesson;
      heldLessons += 1;
    }
    for (const a of g.uncoveredAttendances) {
      remainingValue += a.perLesson;
      remainingLessons += 1;
    }

    if (g.roster.length === 0) continue;
    const rosterValue = g.roster.reduce((s, r) => s + r.perLesson, 0);
    const resolveDays = buildScheduleDayResolver(
      g.scheduleSnapshots,
      g.exactDays,
    );

    const from =
      g.startDateStr && g.startDateStr > monthStartStr
        ? g.startDateStr
        : monthStartStr;
    const to =
      g.endDateStr && g.endDateStr < monthEndStr ? g.endDateStr : monthEndStr;

    for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) {
      if (holidayDates.has(d)) continue;
      if (g.cancelledDates.has(d)) continue;
      if (g.datesWithAttendance.has(d)) continue;
      const days = resolveDays(d);
      // `null` = the date predates every snapshot, so the weekdays of that
      // period are unknown. Never project today's schedule backwards.
      if (!days) continue;
      if (!days.includes(dayOfWeekForDateStr(d))) continue;
      remainingValue += rosterValue;
      remainingLessons += g.roster.length;
    }
  }

  return { heldValue, heldLessons, remainingValue, remainingLessons };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd server && npx jest src/reports/expectation-math.spec.ts`
Expected: PASS, 8 tests. If a weekday count is off, print the dates the walk produced and correct the **expectation in the test** only after verifying the calendar by hand — the walk is the thing under test.

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/expectation-math.ts server/src/reports/expectation-math.spec.ts
git commit -m "Split a month's student-lessons at the payment row, not the attendance row"
```

---

### Task 3: The expectation service

**Files:**
- Create: `server/src/reports/reports-expectation.service.ts`
- Create: `server/src/reports/expectation-cache.ts`
- Modify: `server/src/reports/reports.module.ts` (register + export the provider)
- Test: `server/src/reports/reports-expectation.service.spec.ts`

**Interfaces:**
- Consumes: `perLessonPrice` (Task 1), `splitMonthLessons` (Task 2), `HolidaysService.buildHolidayDateSet`, `isEmptyScope` + `ReportBranchIds` from `common/finance/report-branch-scope`, `secondsUntilTashkentMidnight` from `./net-profit-cache`
- Produces: `ReportsExpectationService.getMonthlyExpectation(companyId: number, opts: { month: string; branchIds: ReportBranchIds }): Promise<MonthlyExpectation>` where

```ts
interface MonthlyExpectation {
  month: string;
  heldValue: number;
  heldLessons: number;
  remainingValue: number;
  remainingLessons: number;
  expectedValue: number;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// server/src/reports/reports-expectation.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsExpectationService } from './reports-expectation.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { RedisService } from '../redis/redis.service';

describe('ReportsExpectationService', () => {
  let service: ReportsExpectationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      group: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsExpectationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: HolidaysService,
          useValue: { buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()) },
        },
        { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() } },
      ],
    }).compile();
    service = module.get(ReportsExpectationService);
  });

  it('returns zeros for an empty scope without touching the database', async () => {
    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: [],
    });
    expect(r.expectedValue).toBe(0);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('confines groups to the caller scope', async () => {
    await service.getMonthlyExpectation(1, { month: '2026-08', branchIds: [7] });
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: { in: [7] } }),
      }),
    );
  });

  it('queries Attendance.date with unshifted UTC bounds, upper exclusive', async () => {
    await service.getMonthlyExpectation(1, { month: '2026-08', branchIds: null });
    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toEqual(new Date(Date.UTC(2026, 7, 1)));
    expect(where.date.lt).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(where.date.lte).toBeUndefined();
  });

  it('sums held + remaining into expectedValue', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: ['monday'],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 0 } }],
      },
    ]);

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    // Avgust 2026 dushanbalari: 3,10,17,24,31 = 5 dars × 1 o'quvchi × 100 000
    expect(r.remainingLessons).toBe(5);
    expect(r.remainingValue).toBe(500_000);
    expect(r.heldValue).toBe(0);
    expect(r.expectedValue).toBe(500_000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/reports/reports-expectation.service.spec.ts`
Expected: FAIL — `Cannot find module './reports-expectation.service'`

- [ ] **Step 3: Write the cache helper**

```ts
// server/src/reports/expectation-cache.ts
import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import { secondsUntilTashkentMidnight } from './net-profit-cache';

/**
 * Daily cache for the monthly expectation, same shape as `net-profit-cache`.
 *
 * Safe to hold for a whole Tashkent day because the figure barely moves within
 * one: when a student pays, a lesson crosses from remaining to held and the
 * TOTAL is unchanged. The collection ratio is deliberately NOT cached — that
 * one must react to a payment immediately.
 *
 * A Redis outage degrades to computing, never to failing.
 */
const logger = new Logger('ExpectationCache');

export function expectationCacheKey(
  companyId: number,
  branchIds: number[] | null,
  monthKey: string,
  asOf?: string,
): string {
  const branch = branchIds === null ? 'all' : branchIds.join('.') || 'none';
  // `asOf` MUST be in the key: a replay and the live figure are different
  // answers for the same month and would otherwise poison each other.
  return `rpt:exp:${companyId}:${branch}:${monthKey}${asOf ? `:${asOf}` : ''}`;
}

export async function cachedExpectation<T>(
  redis: RedisService | undefined,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (e) {
      logger.warn(`Cache read failed for ${key}: ${e}`);
    }
  }
  const value = await compute();
  if (redis) {
    try {
      await redis.setex(key, secondsUntilTashkentMidnight(), JSON.stringify(value));
    } catch (e) {
      logger.warn(`Cache write failed for ${key}: ${e}`);
    }
  }
  return value;
}
```

- [ ] **Step 4: Write the service**

```ts
// server/src/reports/reports-expectation.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { RedisService } from '../redis/redis.service';
import { perLessonPrice } from '../common/finance/per-lesson-price';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import {
  splitMonthLessons,
  type ExpectationGroup,
  type PricedAttendance,
} from './expectation-math';
import { cachedExpectation, expectationCacheKey } from './expectation-cache';

export interface MonthlyExpectation {
  month: string;
  heldValue: number;
  heldLessons: number;
  remainingValue: number;
  remainingLessons: number;
  expectedValue: number;
}

/**
 * «Oy oxiriga kutilyapti» — what this month's lessons are worth by the time it
 * closes, on the SAME accrual basis as «Sof foyda» and the collection ratio.
 *
 * It replaces `recognizedRevenueForecast`, which assumed every month was four
 * weeks (8–13% short on a five-week month) and was rebuilt from whoever was
 * ACTIVE at request time, so a student leaving on the 25th was erased from the
 * whole month.
 */
@Injectable()
export class ReportsExpectationService {
  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private redis: RedisService,
  ) {}

  /**
   * `asOf` (Tashkent `YYYY-MM-DD`, optional) treats every attendance AFTER that
   * date as if it had not happened yet, so the figure can be replayed as it
   * looked mid-month. Not a test hook — it is what makes the number auditable
   * ("was this projection any good?") and it is what the backtest script runs.
   */
  async getMonthlyExpectation(
    companyId: number,
    {
      month,
      branchIds,
      asOf,
    }: { month: string; branchIds: ReportBranchIds; asOf?: string },
  ): Promise<MonthlyExpectation> {
    const empty: MonthlyExpectation = {
      month,
      heldValue: 0,
      heldLessons: 0,
      remainingValue: 0,
      remainingLessons: 0,
      expectedValue: 0,
    };
    if (isEmptyScope(branchIds)) return empty;

    return cachedExpectation(
      this.redis,
      expectationCacheKey(companyId, branchIds, month, asOf),
      () => this.compute(companyId, month, branchIds, empty, asOf),
    );
  }

  private async compute(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
    empty: MonthlyExpectation,
    asOf?: string,
  ): Promise<MonthlyExpectation> {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return empty;

    // `Attendance.date` / `LessonCancellation.date` are @db.Date — unshifted UTC
    // bounds, upper EXCLUSIVE. A Tashkent-shifted start truncates onto the
    // previous month's last day and sweeps it in (the H3 defect).
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDateExcl = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStartStr = `${month}-01`;
    const monthEndStr = `${month}-${String(lastDay).padStart(2, '0')}`;

    const groupWhere = {
      companyId,
      deletedAt: null,
      statusEnum: 'ACTIVE' as const,
      ...(branchIds && { branchId: { in: branchIds } }),
    };

    const [groups, holidayDates, cancellations] = await Promise.all([
      this.prisma.group.findMany({
        where: groupWhere,
        select: {
          id: true,
          exactDays: true,
          startDate: true,
          endDate: true,
          scheduleSnapshots: {
            select: { exactDays: true, validFrom: true, validTo: true },
          },
          course: { select: { price: true, lessonPaymentCount: true } },
          contracts: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { studentId: true, totalAmount: true },
          },
          enrollments: {
            where: { deletedAt: null, status: 'ACTIVE' },
            select: {
              studentId: true,
              student: { select: { discountPercent: true } },
            },
          },
        },
      }),
      this.holidays.buildHolidayDateSet(
        startDate,
        new Date(endDateExcl.getTime() - 86_400_000),
      ),
      this.prisma.lessonCancellation.findMany({
        where: {
          deletedAt: null,
          date: { gte: startDate, lt: endDateExcl },
          group: groupWhere,
        },
        select: { groupId: true, date: true },
      }),
    ]);
    if (groups.length === 0) return empty;

    const groupIds = groups.map((g) => g.id);
    // `asOf` narrows the upper bound so a replay sees only what had happened by
    // then; the rest of the month falls back to the roster projection.
    const attendanceEnd =
      asOf && asOf < monthEndStr
        ? new Date(new Date(`${asOf}T00:00:00Z`).getTime() + 86_400_000)
        : endDateExcl;
    const attendances = await this.prisma.attendance.findMany({
      where: {
        companyId,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: startDate, lt: attendanceEnd },
        groupId: { in: groupIds },
      },
      select: { id: true, groupId: true, studentId: true, date: true },
    });

    // Live consumption per attendance → the seam between held and remaining.
    const consumed = new Map<string, number | null>();
    const attIds = attendances.map((a) => a.id);
    for (let i = 0; i < attIds.length; i += 1000) {
      const rows = await this.prisma.transaction.findMany({
        where: {
          companyId,
          type: 'LESSON_CONSUMPTION',
          reversedAt: null,
          attendanceId: { in: attIds.slice(i, i + 1000) },
        },
        select: { attendanceId: true, metadata: true },
      });
      for (const r of rows) {
        if (!r.attendanceId) continue;
        const meta = r.metadata as { perLessonCost?: number } | null;
        consumed.set(r.attendanceId, meta?.perLessonCost ?? null);
      }
    }

    const cancelledByGroup = new Map<string, Set<string>>();
    for (const c of cancellations) {
      const set = cancelledByGroup.get(c.groupId) ?? new Set<string>();
      set.add(tashkentDateStr(c.date));
      cancelledByGroup.set(c.groupId, set);
    }

    const attByGroup = new Map<string, typeof attendances>();
    for (const a of attendances) {
      const list = attByGroup.get(a.groupId);
      if (list) list.push(a);
      else attByGroup.set(a.groupId, [a]);
    }

    const inputs: ExpectationGroup[] = groups.map((g) => {
      const contractFor = (studentId: number) =>
        g.contracts.find((c) => c.studentId === studentId)?.totalAmount ?? null;
      const priceFor = (studentId: number, discount: number | null) =>
        perLessonPrice({
          course: g.course,
          discountPercent: discount,
          contractTotalAmount: contractFor(studentId),
        });

      const discountByStudent = new Map(
        g.enrollments.map((e) => [e.studentId, e.student?.discountPercent ?? 0]),
      );

      const covered: PricedAttendance[] = [];
      const uncovered: PricedAttendance[] = [];
      const datesWithAttendance = new Set<string>();
      for (const a of attByGroup.get(g.id) ?? []) {
        datesWithAttendance.add(tashkentDateStr(a.date));
        if (consumed.has(a.id)) {
          // Legacy rows carry no metadata: fall back to the bare course price,
          // byte-for-byte what `getRecognizedRevenue` does, so the two agree.
          const stored = consumed.get(a.id);
          covered.push({
            perLesson:
              stored ??
              Math.round(g.course.price / (g.course.lessonPaymentCount || 12)),
          });
        } else {
          uncovered.push({
            perLesson: priceFor(
              a.studentId,
              discountByStudent.get(a.studentId) ?? 0,
            ),
          });
        }
      }

      return {
        groupId: g.id,
        exactDays: g.exactDays ?? [],
        startDateStr: g.startDate ? tashkentDateStr(g.startDate) : null,
        endDateStr: g.endDate ? tashkentDateStr(g.endDate) : null,
        scheduleSnapshots: g.scheduleSnapshots,
        roster: g.enrollments.map((e) => ({
          studentId: e.studentId,
          perLesson: priceFor(e.studentId, e.student?.discountPercent ?? 0),
        })),
        datesWithAttendance,
        cancelledDates: cancelledByGroup.get(g.id) ?? new Set<string>(),
        coveredAttendances: covered,
        uncoveredAttendances: uncovered,
      };
    });

    const split = splitMonthLessons(inputs, {
      monthStartStr,
      monthEndStr,
      holidayDates,
    });

    return {
      month,
      ...split,
      expectedValue: split.heldValue + split.remainingValue,
    };
  }
}
```

- [ ] **Step 5: Register the provider**

In `server/src/reports/reports.module.ts` add the import, the provider and the export:

```ts
import { ReportsExpectationService } from './reports-expectation.service';
// providers: [ ... , ReportsExpectationService ]
// exports: [ReportsExcelService, ReportsFinancialService, ReportsService, ReportsExpectationService],
```

- [ ] **Step 6: Register the service in the branch-scope coverage guard**

`server/src/reports/reports-branch-scope-coverage.spec.ts` asserts that with a
scope set, EVERY query a money report issues carries a branch predicate. Add
the new service to the list it exercises, mirroring the existing entries:

```ts
    it('scopes every query the expectation service issues', async () => {
      await expectationService.getMonthlyExpectation(1, {
        month: '2026-08',
        branchIds: [7],
      });
      for (const call of prisma.group.findMany.mock.calls) {
        expect(call[0].where.branchId).toEqual({ in: [7] });
      }
      for (const call of prisma.lessonCancellation.findMany.mock.calls) {
        expect(call[0].where.group.branchId).toEqual({ in: [7] });
      }
    });
```

Attendance and transaction queries inherit the scope through `groupId: { in: groupIds }`,
where `groupIds` came from the scoped group query — assert that chain holds by
checking the attendance call's `groupId.in` equals the ids the group mock returned.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd server && npx jest src/reports/reports-expectation.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
Expected: PASS, 4 + 1 tests

- [ ] **Step 8: Commit**

```bash
git add server/src/reports/reports-expectation.service.ts server/src/reports/reports-expectation.service.spec.ts server/src/reports/expectation-cache.ts server/src/reports/reports.module.ts
git commit -m "Compute the month's expected lesson value from the real calendar"
```

---

### Task 4: Guard that held value equals recognized revenue

Two implementations of "value of covered lessons" now exist — `getRecognizedRevenue` (the collection-ratio denominator and Sof foyda leg) and the service's `heldValue`. They must not drift.

**Files:**
- Test: `server/src/reports/reports-expectation.service.spec.ts` (append)

**Interfaces:**
- Consumes: `MonthlyExpectation.heldValue` (Task 3), `ReportsFinancialService.getRecognizedRevenue`
- Produces: nothing

- [ ] **Step 1: Write the failing test**

Append to the existing describe block:

```ts
  it('prices covered lessons exactly like getRecognizedRevenue does', async () => {
    // Ikkalasi ham: metadata.perLessonCost, yo'q bo'lsa course.price / lpc
    // (chegirmasiz). Chegirma qo'llansa bu test yiqiladi.
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'g1',
        exactDays: [],
        startDate: null,
        endDate: null,
        scheduleSnapshots: [],
        course: { price: 1_200_000, lessonPaymentCount: 12 },
        contracts: [],
        enrollments: [{ studentId: 10001, student: { discountPercent: 40 } }],
      },
    ]);
    prisma.attendance.findMany.mockResolvedValueOnce([
      { id: 'a1', groupId: 'g1', studentId: 10001, date: new Date('2026-08-03') },
      { id: 'a2', groupId: 'g1', studentId: 10001, date: new Date('2026-08-05') },
    ]);
    prisma.transaction.findMany.mockResolvedValueOnce([
      { attendanceId: 'a1', metadata: { perLessonCost: 60_000 } },
      { attendanceId: 'a2', metadata: null }, // legacy → 1 200 000 / 12
    ]);

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    expect(r.heldValue).toBe(160_000); // 60 000 + 100 000, NOT 60 000 + 60 000
    expect(r.heldLessons).toBe(2);
  });
```

- [ ] **Step 2: Run it**

Run: `cd server && npx jest src/reports/reports-expectation.service.spec.ts`
Expected: PASS if Task 3 was written correctly. If it FAILS with `120000`, the legacy fallback wrongly applied the discount — fix the service, not the test.

- [ ] **Step 3: Commit**

```bash
git add server/src/reports/reports-expectation.service.spec.ts
git commit -m "Lock the held-value pricing to the recognized-revenue rule"
```

---

### Task 5: Serve it through the reports facade

**Files:**
- Modify: `server/src/reports/reports.service.ts` (constructor + facade method + fold into `getFinancialOverview`)
- Test: `server/src/reports/reports.service.spec.ts` if present, else `server/src/reports/reports.controller.spec.ts`

**Interfaces:**
- Consumes: `ReportsExpectationService.getMonthlyExpectation` (Task 3)
- Produces: `ReportsService.getMonthlyExpectation(...)` — same signature; and `getFinancialOverview` now returns `income.expected` and `forecast.expectedMonthEnd` sourced from it

- [ ] **Step 1: Add the dependency and the facade method**

In `server/src/reports/reports.service.ts`, add `private expectation: ReportsExpectationService,` to the constructor (after `private balanceSheet`), and:

```ts
  /**
   * «Oy oxiriga kutilyapti» — the replacement for `recognizedRevenueForecast`.
   * Lesson value, not cash: a cash projection would need an "about 82% gets
   * paid" coefficient drawn from two months, and that coefficient bundles
   * prepayment timing, debt and new-enrolment cycles into one number nobody
   * can decompose.
   */
  getMonthlyExpectation(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return this.expectation.getMonthlyExpectation(companyId, opts);
  }
```

- [ ] **Step 2: Fold it into the overview payload**

Replace the body of `getFinancialOverview` in `reports.service.ts`:

```ts
  async getFinancialOverview(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const overview = await this.financial.getFinancialOverview(companyId, query);
    // Month = the period's START month, the same derivation the salary fold and
    // the Excel `monthStr` use. Audit H22 (cards on different bases) is a known
    // separate item — do not diverge from the convention here.
    const month = (
      query.startDate ?? new Date().toISOString().slice(0, 10)
    ).slice(0, 7);
    const expectation = await this.getMonthlyExpectation(companyId, {
      month,
      branchIds: query.branchIds,
    });
    return {
      ...overview,
      income: { ...overview.income, expected: expectation.expectedValue },
      forecast: {
        ...overview.forecast,
        expectedMonthEnd: expectation.expectedValue,
        expectedHeld: expectation.heldValue,
        expectedRemaining: expectation.remainingValue,
      },
    };
  }
```

- [ ] **Step 3: Run the whole reports suite**

Run: `cd server && npx jest src/reports`
Expected: PASS. Existing specs that construct `ReportsService` directly must gain a `ReportsExpectationService` mock — add `{ provide: ReportsExpectationService, useValue: { getMonthlyExpectation: jest.fn().mockResolvedValue({ month: '2026-08', heldValue: 0, heldLessons: 0, remainingValue: 0, remainingLessons: 0, expectedValue: 0 }) } }` to each failing module.

- [ ] **Step 4: Commit**

```bash
git add server/src/reports/reports.service.ts server/src/reports/*.spec.ts
git commit -m "Serve the month-end expectation through the reports facade"
```

---

### Task 6: Replace the forecast on every surface

**Files:**
- Modify: `server/src/reports/reports-excel.sheets.ts:119` and `:314`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts`
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts:294`
- Modify: `client/src/components/payments/payments-overview.tsx`
- Test: `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getMonthlyExpectation` (Task 5); `overview.income.expected` (Task 5)
- Produces: nothing

- [ ] **Step 1: Write the failing Telegram test**

Replace the forecast assertions in the existing `prints the shared collection ratio and never a percentage on the forecast` test, and add:

```ts
  it('prints the month-end expectation instead of a four-week forecast', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue({
        lessonsValue: 1,
        currentMonth: 1,
        collectionPct: 100,
      }),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 170_000_000 }),
    });

    const { message: raw } = await service.build(1001);
    const message = raw.replace(/ /g, ' ');

    expect(message).toContain("• Oy oxiriga kutilyapti: <b>170 000 000 so'm</b>");
    expect(message).not.toContain('Oylik prognoz');
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts`
Expected: FAIL — the message still says `Oylik prognoz (taxminiy reja)`

- [ ] **Step 3: Change the Telegram daily report**

In `telegram-group-daily-report.service.ts`: delete the private `computeMonthlyForecast` method entirely, replace the `this.computeMonthlyForecast(companyId)` entry in the `Promise.all` with `this.computeExpectation(companyId, monthKey)`, rename the local from `forecastIncome` to `expectedValue`, and swap the render block:

```ts
    if (expectedValue !== null && expectedValue > 0) {
      lines.push(
        `• Oy oxiriga kutilyapti: <b>${formatSum(expectedValue)}</b>`,
      );
    }
```

Add the loader next to `computeCollection`:

```ts
  /**
   * «Oy oxiriga kutilyapti» from the ONE canonical source. The old line was a
   * local `exactDays × 4` walk — a second implementation of a figure the web
   * page also computed, and both were wrong the same way.
   */
  private async computeExpectation(
    companyId: number,
    month: string,
  ): Promise<number | null> {
    try {
      const e = await this.reports.getMonthlyExpectation(companyId, {
        month,
        branchIds: null,
      });
      return e.expectedValue;
    } catch (err) {
      this.logger.warn(`Expectation failed for company ${companyId}: ${err}`);
      return null;
    }
  }
```

- [ ] **Step 4: Change `rm:cfin`**

In `telegram-group-report-menu.service.ts:294` replace

```ts
        `• Kutilgan (prognoz): <b>${formatSum(o.forecast.recognizedRevenueForecast)}</b>`,
```

with

```ts
        `• Oy oxiriga kutilyapti: <b>${formatSum(o.income.expected)}</b>`,
```

- [ ] **Step 5: Change the Excel labels**

`reports-excel.sheets.ts:119`:

```ts
  kvRow(ws, 'Oy oxiriga kutilyapti', o.income?.expected ?? 0, 'Shu oy o‘tilgan darslar + kalendar bo‘yicha qolgan darslar qiymati. Kassa emas — dars qiymati.');
```

`reports-excel.sheets.ts:314`:

```ts
    ['Oy oxiriga kutilyapti', 'Shu oy o‘tilgan darslar qiymati + qolgan rejalangan darslar qiymati. Kassa bashorati emas.'],
```

- [ ] **Step 6: Change the client card**

In `client/src/components/payments/payments-overview.tsx`, change the `forecast` type block to

```ts
  forecast: {
    expectedMonthEnd: number;
    expectedHeld: number;
    expectedRemaining: number;
    outstandingReceivable: number;
    debtorExposure: { count: number; avgDebt: number };
  };
```

and the card line (currently `Prognoz (bashorat)` / `d.forecast.recognizedRevenueForecast`) to

```tsx
                    Oy oxiriga kutilyapti
                  </span>
                  <span className="font-medium">
                    {fmt(d.forecast.expectedMonthEnd)} so&apos;m
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                Shu oy o&apos;tilgan darslar qiymati + kalendar bo&apos;yicha
                qolgan darslar qiymati. Kassa bashorati emas — pul qachon
                kelishi bunga kirmaydi.
              </TooltipContent>
```

- [ ] **Step 7: Run both builds**

Run: `cd server && npm test` then `cd ../client && npm run build`
Expected: server 189+ suites PASS; client build clean.

- [ ] **Step 8: Commit**

```bash
git add server/src/telegram-groups server/src/reports/reports-excel.sheets.ts client/src/components/payments/payments-overview.tsx
git commit -m "Show one month-end expectation on every surface"
```

---

### Task 7: Delete the three forecast implementations

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts` (drop the walk, `expectedIncome`, `recognizedRevenueForecast`)
- Modify: `server/src/salary/salary-overview.service.ts:334` (`computeExpectedMonthly`)
- Test: `server/src/reports/reports-financial.service.spec.ts`, `server/src/salary/salary-overview.service.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `getFinancialOverview` no longer returns `forecast.recognizedRevenueForecast`; `income.expected` is now written by the facade (Task 5)

- [ ] **Step 1: Write the failing test**

In `reports-financial.service.spec.ts`:

```ts
  it('no longer computes a four-week forecast', async () => {
    const result = await service.getFinancialOverview(1, {
      branchIds: null,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    } as any);
    expect((result.forecast as any).recognizedRevenueForecast).toBeUndefined();
    // The enrollment walk that fed it is gone.
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts`
Expected: FAIL — the field is still a number and `enrollment.findMany` was called

- [ ] **Step 3: Delete the walk**

In `reports-financial.service.ts` remove: the `activeEnrollments` query, the `recognizedRevenueForecast` reduce, `const expectedIncome = recognizedRevenueForecast;`, the `expected: expectedIncome` line, and `recognizedRevenueForecast,` from the returned `forecast` object. Leave `outstandingReceivable` and `debtorExposure` untouched. Delete the long pricing-fallback comment block with it — the rule now lives in `common/finance/per-lesson-price.ts`.

- [ ] **Step 4: Replace the salary-overview sort key**

In `salary-overview.service.ts` delete `computeExpectedMonthly` and its call. The value only ordered the ⚙ Sozlamalar teacher list and was never displayed; order by active student count instead:

```ts
      total += activeStudents;
```

Rename the local and the method to `countActiveStudents` so the name stops promising money. Update its call site and any `expectedMonthly` field the caller passes on.

- [ ] **Step 5: Run the suites**

Run: `cd server && npm test`
Expected: PASS. Any spec asserting `recognizedRevenueForecast` or `expectedMonthly` must be updated to the new shape — those assertions encode the deleted behaviour.

- [ ] **Step 6: Verify no copies remain**

Run: `cd server && grep -rn "exactDays.length \* 4\|exactDays?.length ?? 0) \* 4\|recognizedRevenueForecast" src/`
Expected: no matches outside comments describing the removal.

- [ ] **Step 7: Commit**

```bash
git add server/src/reports server/src/salary
git commit -m "Delete the three four-week forecast implementations"
```

---

### Task 8: Backtest script

Proves the new figure converges. Read-only; nothing is written.

**Files:**
- Create: `server/scripts/backtest-monthly-expectation.ts`

**Interfaces:**
- Consumes: `ReportsExpectationService` (Task 3)
- Produces: nothing

- [ ] **Step 1: Write the script**

```ts
// server/scripts/backtest-monthly-expectation.ts
/**
 * READ-ONLY: how close was «Oy oxiriga kutilyapti» on each day of a closed
 * month? Reruns the expectation as it would have looked on day N (by ignoring
 * every attendance after day N) and compares it to the month's real total.
 *
 * Usage: railway run npx ts-node scripts/backtest-monthly-expectation.ts 2026-07
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
import { HolidaysService } from '../src/holidays/holidays.service';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('no company');
  const month = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-07';

  const holidays = new HolidaysService(prisma as any);
  // No Redis in a script: the cache degrades to computing.
  const service = new ReportsExpectationService(prisma as any, holidays, undefined as any);

  const actual = await service.getMonthlyExpectation(company.id, {
    month,
    branchIds: null,
  });
  console.log(`${company.name} — ${month}`);
  console.log(`Haqiqiy (oy yopilgan): ${fmt(actual.expectedValue)}\n`);
  console.log('  Kun   Bashorat          Farq            Xato   Fakt ulushi');
  console.log('  ────  ────────────────  ──────────────  ─────  ───────────');

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (const day of [1, 5, 10, 15, 20, 25, lastDay]) {
    const asOf = `${month}-${String(day).padStart(2, '0')}`;
    const asOfResult = await service.getMonthlyExpectation(company.id, {
      month,
      branchIds: null,
      asOf,
    });
    const diff = asOfResult.expectedValue - actual.expectedValue;
    const errPct =
      actual.expectedValue > 0
        ? (Math.abs(diff) / actual.expectedValue) * 100
        : 0;
    // Caveat worth reading before trusting the early rows: the roster is
    // TODAY's, not that day's, so an early figure is replayed with hindsight
    // about who is enrolled. It measures the calendar math, not the roster.
    const factShare =
      actual.heldLessons > 0
        ? (asOfResult.heldLessons / actual.heldLessons) * 100
        : 0;
    console.log(
      `  ${String(day).padStart(4)}  ${fmt(asOfResult.expectedValue).padStart(16)}  ${(diff >= 0 ? '+' : '') + fmt(diff).padStart(13)}  ${errPct.toFixed(1).padStart(4)}%  ${factShare.toFixed(0).padStart(10)}%`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run it against production**

Run: `cd server && railway run npx ts-node scripts/backtest-monthly-expectation.ts 2026-07`
Expected: prints July's figure. **The month total must equal 173 783 991** — July is closed, so `remainingValue` is 0 and `expectedValue` equals the measured lessons value. A different number means the walk or the seam is wrong; do not proceed until it matches.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/backtest-monthly-expectation.ts
git commit -m "Add a read-only convergence check for the month-end expectation"
```

---

# PART B — kunlik surat (migratsiya bilan)

---

### Task 9: Schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma` (`DailyFinancialSnapshot`)
- Create: `server/prisma/migrations/<timestamp>_daily_snapshot_branch_and_expectation/migration.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `DailyFinancialSnapshot.branchId`, `.expectedValue`, `.lessonsHeldValue`, `.collectedForMonth`

- [ ] **Step 1: Edit the model**

```prisma
model DailyFinancialSnapshot {
  id               Int      @id @default(autoincrement())
  companyId        Int
  /// NULL = the company-wide row. A branch row carries its branch id.
  branchId         Int?
  date             DateTime @db.Date
  totalDebt        Int      @default(0)
  debtorCount      Int      @default(0)
  activeStudents   Int      @default(0)
  mtdIncome        Int      @default(0)
  /// «Oy oxiriga kutilyapti» — NULL means it was not computed that day.
  expectedValue    Int?
  lessonsHeldValue Int?
  collectedForMonth Int?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([companyId, branchId, date])
  @@index([companyId, date])
}
```

- [ ] **Step 2: Generate the migration SQL**

```bash
cd server
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/expectation-migration.sql
cat /tmp/expectation-migration.sql
```

If the diff comes back empty because the datasource is already ahead, write the SQL by hand — it is short:

```sql
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN "expectedValue" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN "lessonsHeldValue" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN "collectedForMonth" INTEGER;

DROP INDEX IF EXISTS "DailyFinancialSnapshot_companyId_date_key";
CREATE UNIQUE INDEX "DailyFinancialSnapshot_companyId_branchId_date_key"
  ON "DailyFinancialSnapshot" ("companyId", "branchId", "date");

-- Postgres treats NULLs in a UNIQUE index as distinct, so the line above does
-- NOT stop a second company-wide row per day. This partial index does.
CREATE UNIQUE INDEX "daily_snapshot_company_row_unique"
  ON "DailyFinancialSnapshot" ("companyId", "date")
  WHERE "branchId" IS NULL;
```

- [ ] **Step 3: Apply it to the dev database**

```bash
cd server
npx prisma db execute --file /tmp/expectation-migration.sql --schema prisma/schema.prisma
mkdir -p prisma/migrations/20260805000000_daily_snapshot_branch_and_expectation
cp /tmp/expectation-migration.sql prisma/migrations/20260805000000_daily_snapshot_branch_and_expectation/migration.sql
npx prisma migrate resolve --applied 20260805000000_daily_snapshot_branch_and_expectation
npx prisma generate
```

`prisma migrate dev` is broken in this repo — this diff + execute + resolve sequence is the established workflow.

- [ ] **Step 4: Verify the guard actually holds**

```bash
cd server && npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const d = new Date(Date.UTC(2099,0,1));
  await p.dailyFinancialSnapshot.create({ data: { companyId: 1001, date: d } });
  try {
    await p.dailyFinancialSnapshot.create({ data: { companyId: 1001, date: d } });
    console.log('FAIL: duplicate company-wide row was accepted');
  } catch { console.log('OK: partial unique index rejected the duplicate'); }
  await p.dailyFinancialSnapshot.deleteMany({ where: { date: d } });
  await p.\$disconnect();
})();
"
```
Expected: `OK: partial unique index rejected the duplicate`

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "Give the daily snapshot a branch dimension and the expectation figures"
```

---

### Task 10: Write the snapshot per branch, off the Telegram path

**Files:**
- Create: `server/src/telegram-groups/daily-snapshot.service.ts`
- Create: `server/src/telegram-groups/daily-snapshot.cron.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts` (remove `persistSnapshot`)
- Modify: `server/src/telegram-groups/telegram-groups.module.ts`
- Test: `server/src/telegram-groups/daily-snapshot.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getMonthlyExpectation` (Task 5), `ReportsService.getIncomeMonthAttribution`
- Produces: `DailySnapshotService.persistForCompany(companyId: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/telegram-groups/daily-snapshot.service.spec.ts
import { Test } from '@nestjs/testing';
import { DailySnapshotService } from './daily-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

describe('DailySnapshotService', () => {
  let service: DailySnapshotService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
      student: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: -500 }, _count: 3 }),
        count: jest.fn().mockResolvedValue(400),
      },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 900 } }) },
      dailyFinancialSnapshot: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const module = await Test.createTestingModule({
      providers: [
        DailySnapshotService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ReportsService,
          useValue: {
            getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 170, heldValue: 13 }),
            getIncomeMonthAttribution: jest.fn().mockResolvedValue({ currentMonth: 6, lessonsValue: 13 }),
          },
        },
      ],
    }).compile();
    service = module.get(DailySnapshotService);
  });

  it('writes one row per branch plus the company-wide row', async () => {
    await service.persistForCompany(1001);
    expect(prisma.dailyFinancialSnapshot.upsert).toHaveBeenCalledTimes(3);
    const branchIds = prisma.dailyFinancialSnapshot.upsert.mock.calls.map(
      (c: any) => c[0].create.branchId,
    );
    expect(branchIds).toEqual(expect.arrayContaining([null, 1, 2]));
  });

  it('stores the components, never the percentage', async () => {
    await service.persistForCompany(1001);
    const data = prisma.dailyFinancialSnapshot.upsert.mock.calls[0][0].create;
    expect(data.lessonsHeldValue).toBe(13);
    expect(data.collectedForMonth).toBe(6);
    expect(data).not.toHaveProperty('collectionPct');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd server && npx jest src/telegram-groups/daily-snapshot.service.spec.ts`
Expected: FAIL — `Cannot find module './daily-snapshot.service'`

- [ ] **Step 3: Write the service**

```ts
// server/src/telegram-groups/daily-snapshot.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import {
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  tashkentTodayDate,
} from './utils/format.util';

/**
 * The centre's one immutable daily record.
 *
 * It used to be written by the 21:00 Telegram cron, and only after a confirmed
 * send — so Sundays and holidays (when that cron short-circuits) left holes.
 * A month whose last day fell on a Sunday therefore had NO closing figure, and
 * the debt ▲/▼ delta silently compared against a three-day-old row while the
 * message said "kechagi kundan" (audit H26). It now runs on its own, every day.
 *
 * A snapshot is the only thing here that cannot be recomputed later, which is
 * why it is written per branch from the start even though nothing reads the
 * branch rows yet.
 */
@Injectable()
export class DailySnapshotService {
  private readonly logger = new Logger(DailySnapshotService.name);

  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
  ) {}

  async persistForCompany(companyId: number): Promise<void> {
    const branches = await this.prisma.branch.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    });
    const scopes: (number | null)[] = [null, ...branches.map((b) => b.id)];
    for (const branchId of scopes) {
      try {
        await this.persistScope(companyId, branchId);
      } catch (e) {
        // One branch failing must not cost the others their row.
        this.logger.warn(
          `Snapshot failed for company ${companyId} branch ${branchId}: ${e}`,
        );
      }
    }
  }

  private async persistScope(companyId: number, branchId: number | null) {
    const date = tashkentTodayDate();
    const month = date.toISOString().slice(0, 7);
    const branchIds = branchId === null ? null : [branchId];
    const studentBranch =
      branchId === null ? {} : { branches: { some: { branchId } } };

    const [debtors, activeStudents, income, expectation, attribution] =
      await Promise.all([
        this.prisma.student.aggregate({
          where: { companyId, deletedAt: null, status: 'ACTIVE', balance: { lt: 0 }, ...studentBranch },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.student.count({
          where: { companyId, deletedAt: null, status: 'ACTIVE', ...studentBranch },
        }),
        this.prisma.payment.aggregate({
          where: {
            companyId,
            status: 'COMPLETED',
            createdAt: { gte: firstOfThisMonthUtc() },
            ...(branchId !== null && { branchId }),
          },
          _sum: { amount: true },
        }),
        this.reports.getMonthlyExpectation(companyId, { month, branchIds }),
        this.reports.getIncomeMonthAttribution(companyId, {
          branchIds,
          startDate: firstOfThisMonthDate().toISOString().slice(0, 10),
          endDate: date.toISOString().slice(0, 10),
        }),
      ]);

    const data = {
      companyId,
      branchId,
      date,
      totalDebt: Math.abs(debtors._sum.balance ?? 0),
      debtorCount: debtors._count,
      activeStudents,
      mtdIncome: income._sum.amount ?? 0,
      expectedValue: expectation.expectedValue,
      lessonsHeldValue: attribution.lessonsValue,
      collectedForMonth: attribution.currentMonth,
      // The percentage is deliberately NOT stored — it is derivable from the
      // two components above, and a stored copy can drift from them.
    };

    await this.prisma.dailyFinancialSnapshot.upsert({
      where: { companyId_branchId_date: { companyId, branchId, date } },
      create: data,
      update: data,
    });
  }
}
```

- [ ] **Step 4: Write the cron**

```ts
// server/src/telegram-groups/daily-snapshot.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DailySnapshotService } from './daily-snapshot.service';

/**
 * 23:40 Tashkent, EVERY day — Sundays and holidays included. The snapshot is
 * the month's closing record, so a missing day is unrecoverable; it must not
 * inherit the Telegram cron's day-off short-circuit.
 */
@Injectable()
export class DailySnapshotCron {
  private readonly logger = new Logger(DailySnapshotCron.name);

  constructor(
    private prisma: PrismaService,
    private snapshots: DailySnapshotService,
  ) {}

  @Cron('0 40 23 * * *', { timeZone: 'Asia/Tashkent' })
  async run() {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    for (const c of companies) {
      await this.snapshots.persistForCompany(c.id);
    }
    this.logger.log(`Daily snapshot written for ${companies.length} company(ies)`);
  }
}
```

- [ ] **Step 5: Remove the old write path**

In `telegram-group-daily-report.service.ts` delete the `persistSnapshot` method and every call to it (the daily cron calls it after a confirmed send). The debt ▲/▼ read of `dailyFinancialSnapshot.findFirst` stays — it now finds a row every day. Add both new classes to `providers` in `telegram-groups.module.ts`.

- [ ] **Step 6: Run the suites**

Run: `cd server && npm test`
Expected: PASS. Specs asserting `persistSnapshot` was called after a send must be deleted — that behaviour is intentionally gone.

- [ ] **Step 7: Commit**

```bash
git add server/src/telegram-groups
git commit -m "Write the daily snapshot every day, per branch, off the Telegram path"
```

---

### Task 11: Production verification and documentation

**Files:**
- Modify: `docs/report-consistency-audit.md` (mark P5 and H26 done)
- Modify: `server/CLAUDE.md` (forecast section + snapshot section)
- Modify: `client/CLAUDE.md` (overview card description)

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Verify on production data**

```bash
cd server
railway run npx ts-node scripts/backtest-monthly-expectation.ts 2026-07
railway run npx ts-node scripts/verify-collection-ratio.ts 2026-08 2026-07
```
Expected: July's `expectedValue` equals **173 783 991** exactly (closed month, no remaining). The collection figures must be unchanged from today's run — this work must not move them.

- [ ] **Step 2: Update the audit document**

In `docs/report-consistency-audit.md` section 11, strike P5 with the measured result. Add a line to section 0b recording that H26 closed with the snapshot decoupling.

- [ ] **Step 3: Update `server/CLAUDE.md`**

Replace the daily-report description of `Oylik prognoz` (recognized-revenue forecast, one `enrollment.findMany`) with the expectation, and document the snapshot's new cron + branch dimension in the same section. English only.

- [ ] **Step 4: Update `client/CLAUDE.md`**

Update the `/payments/overview` row in the Financial UI table to name the new card line. English only.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs server/CLAUDE.md client/CLAUDE.md
git commit -m "Record the expectation rework in the audit and the guides"
gh pr create --title "Replace the four-week forecast with a month-end lesson-value expectation" --body "$(cat <<'EOF'
## Muammo

«Oylik prognoz» ikki jihatdan yaroqsiz edi: `exactDays.length × 4` har oyni to'rt hafta deb olardi (besh haftalik oyda 8–13% kam), va u so'rov paytida `ACTIVE` bo'lganlardan qaytadan hisoblanardi — 25-kuni ketgan o'quvchi butun oydan o'chib ketardi. Natijada iyun va iyul ikkalasi ham bir xil raqam berardi.

## Yechim

«Oy oxiriga kutilyapti» — dars qiymati: o'tilgan va qoplangan darslar + kalendar bo'yicha qolgan darslar. Hamma kirish ma'lum (jadval, bayramlar, ro'yxat, narx), shuning uchun xato chiqsa sababini nomlash mumkin.

Kassa bashorati rad etildi: u «taxminan 82% to'lanadi» koeffitsiyentini talab qilardi, u esa atigi ikki oydan olingan va ichida oldindan to'lash, qarzdorlik va yangi tsikllar aralashgan.

O'tilgan va qolgan orasidagi chegara — `LESSON_CONSUMPTION` yozuvi, davomat emas. Qarzdorning darsi o'tilgan, lekin puli kelmagan — u kutilayotgan tarafda qoladi va to'lov kelganda o'zi ko'chadi. Shu tufayli har bir dars-o'rni aynan bir marta sanaladi.

## Tekshiruv

- Yopilgan oy uchun `expectedValue` haqiqiy raqamga **aynan** teng (iyul: 173 783 991)
- Uchala eski prognoz nusxasi o'chirildi
- Kunlik surat endi har kuni, filial kesimida yoziladi — auditdagi H26 ham shu bilan yopildi

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Bajarilgandan keyin

Part A o'z-o'zicha deploy qilinadi (migratsiyasiz). Part B migratsiya talab qiladi — prodga chiqarishdan oldin migratsiya qo'lda qo'llanadi, keyin `railway up`.

Qamrovdan tashqarida qolganlar, spec 7-bo'limiga muvofiq: muzlatilgan reja jadvali (qilinmaydi) va `getIncomeMonthAttribution` ning ledger chegarasi (~2000 o'quvchidan oshganda alohida ish).
