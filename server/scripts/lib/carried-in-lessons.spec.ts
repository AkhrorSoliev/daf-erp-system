import { TransactionType } from '@prisma/client';
import type {
  CoverageResult,
  CycleCoverage,
} from '../../src/billing/lesson-coverage.helper';
import {
  carriedInForEnrollment,
  carriedInPeriodFor,
  emptyCarriedIn,
  loadCarriedIn,
} from './carried-in-lessons';

const SEPTEMBER = carriedInPeriodFor('2026-09');
const AUG_10 = new Date('2026-08-10T06:00:00.000Z');

// Mon/Wed/Fri lessons. 31.08.2026 is a Monday, 01.09 a Tuesday.
const AUGUST_7 = [
  '2026-08-17',
  '2026-08-19',
  '2026-08-21',
  '2026-08-24',
  '2026-08-26',
  '2026-08-28',
  '2026-08-31',
];
const AUGUST_9 = [
  '2026-08-10',
  '2026-08-12',
  '2026-08-14',
  ...AUGUST_7.slice(0, 6),
];
const AUGUST_10 = ['2026-08-07', ...AUGUST_9];
const AUGUST_12 = ['2026-08-03', '2026-08-05', ...AUGUST_10];
const SEPTEMBER_5 = [
  '2026-09-02',
  '2026-09-04',
  '2026-09-07',
  '2026-09-09',
  '2026-09-11',
];

function cov(
  enrollmentId: string,
  capacity: number,
  days: string[],
): CycleCoverage {
  const consumedDates = days.map((d) => new Date(`${d}T00:00:00.000Z`));
  return {
    enrollmentId,
    cycleSequenceNumber: 1,
    capacity,
    coveredCount: consumedDates.length,
    firstCoveredDate: consumedDates[0] ?? null,
    lastCoveredDate: consumedDates[consumedDates.length - 1] ?? null,
    consumedDates,
  };
}

function coverage(entries: Array<[string, CycleCoverage]>): CoverageResult {
  return { byDeduction: new Map(entries), cycleByAttendanceId: new Map() };
}

/** One pack ('ded-1', 12 lessons, 450 000 by default) of enrollment 'enr-1'. */
function run(opts: {
  days: string[];
  capacity?: number;
  amount?: number;
  createdAt?: Date;
  covEnrollmentId?: string;
  fromDay?: string | null;
}) {
  return carriedInForEnrollment({
    enrollmentId: 'enr-1',
    fromDay: opts.fromDay ?? null,
    coverage: coverage([
      [
        'ded-1',
        cov(opts.covEnrollmentId ?? 'enr-1', opts.capacity ?? 12, opts.days),
      ],
    ]),
    deductions: new Map([
      [
        'ded-1',
        {
          createdAt: opts.createdAt ?? AUG_10,
          amount: opts.amount ?? -450_000,
        },
      ],
    ]),
    period: SEPTEMBER,
  });
}

describe('carriedInPeriodFor', () => {
  it('spans the Tashkent calendar month and starts at 00:00 Tashkent', () => {
    expect(SEPTEMBER).toEqual({
      firstDay: '2026-09-01',
      lastDay: '2026-09-30',
      startUtc: new Date('2026-08-31T19:00:00.000Z'),
    });
  });
});

describe('carriedInForEnrollment', () => {
  it('credits the September lessons an August pack paid for, at the pack price', () => {
    // 7 lessons in August, the last 5 in September: 450 000 - 7 x 37 500.
    expect(run({ days: [...AUGUST_7, ...SEPTEMBER_5] })).toEqual({
      lessons: 5,
      value: 187_500,
      batches: [{ deductionId: 'ded-1', lessons: 5, value: 187_500 }],
    });
  });

  it("prices the cycle remainder onto the pack's last lesson", () => {
    // 500 000 / 12: base 41 667, the 12th lesson 41 663 -> 41 667 + 41 667 + 41 663.
    expect(
      run({
        days: [...AUGUST_9, ...SEPTEMBER_5.slice(0, 3)],
        amount: -500_000,
      }).value,
    ).toBe(124_997);
  });

  it('uses the discount already inside the pack amount', () => {
    // 50% off: deducted as 225 000 for 12 lessons -> 2 x 18 750.
    expect(
      run({
        days: [...AUGUST_10, ...SEPTEMBER_5.slice(0, 2)],
        amount: -225_000,
      }).value,
    ).toBe(37_500);
  });

  it('credits only the September part of a pack bought at the end of August', () => {
    // 1 lesson on 31.08, 4 in September -> 5 x 37 500 - 1 x 37 500.
    const res = run({
      days: ['2026-08-31', ...SEPTEMBER_5.slice(0, 4)],
      createdAt: new Date('2026-08-28T06:00:00.000Z'),
    });
    expect(res.lessons).toBe(4);
    expect(res.value).toBe(150_000);
  });

  it("pays nothing for lessons past the pack's capacity (they were never paid)", () => {
    expect(run({ days: [...AUGUST_12, ...SEPTEMBER_5.slice(0, 2)] })).toEqual(
      emptyCarriedIn(),
    );
  });

  it('ignores a pack bought inside the month (the migration reverses it)', () => {
    expect(
      run({
        days: SEPTEMBER_5,
        createdAt: new Date('2026-09-05T06:00:00.000Z'),
      }).value,
    ).toBe(0);
  });

  it('ignores packs of other enrollments', () => {
    expect(
      run({ days: [...AUGUST_7, ...SEPTEMBER_5], covEnrollmentId: 'enr-2' })
        .value,
    ).toBe(0);
  });

  it('credits only lessons the monthly charge bills, from the enrollment start', () => {
    // Start 04.09: the 02.09 lesson is not billed by the monthly charge, so
    // it stays on the pack. Positions 9..12 -> 450 000 - 8 x 37 500.
    const res = run({
      days: [...AUGUST_7, ...SEPTEMBER_5],
      fromDay: '2026-09-04',
    });
    expect(res.lessons).toBe(4);
    expect(res.value).toBe(150_000);
  });

  it('ignores a start day before the month', () => {
    expect(
      run({ days: [...AUGUST_7, ...SEPTEMBER_5], fromDay: '2026-05-10' }).value,
    ).toBe(187_500);
  });
});

describe('loadCarriedIn', () => {
  it('reads the ledger through the shared coverage engine', async () => {
    const days = [...AUGUST_7, ...SEPTEMBER_5];
    const attendance = days.map((d, i) => ({
      id: `att-${i}`,
      date: new Date(`${d}T00:00:00.000Z`),
    }));
    const deduction = {
      id: 'ded-aug',
      type: TransactionType.LESSON_DEDUCTION,
      amount: -450_000,
      enrollmentId: 'enr-1',
      attendanceId: null,
      metadata: { lessonsCovered: 12, perLessonCost: 37_500 },
      createdAt: AUG_10,
    };
    const consumptions = attendance.map((a, i) => ({
      id: `con-${String(i).padStart(2, '0')}`,
      type: TransactionType.LESSON_CONSUMPTION,
      amount: 0,
      enrollmentId: 'enr-1',
      attendanceId: a.id,
      metadata: { perLessonCost: 37_500 },
      createdAt: new Date(a.date.getTime() + 10 * 3_600_000),
    }));
    const db = {
      transaction: {
        // The coverage engine asks for both types at once (`type: { in }`);
        // loadCarriedIn asks for the deductions alone.
        findMany: jest.fn((args: { where: { type: unknown } }) =>
          Promise.resolve(
            args.where.type === TransactionType.LESSON_DEDUCTION
              ? [
                  {
                    id: deduction.id,
                    createdAt: deduction.createdAt,
                    amount: deduction.amount,
                  },
                ]
              : [deduction, ...consumptions],
          ),
        ),
      },
      attendance: { findMany: jest.fn(() => Promise.resolve(attendance)) },
    };

    const res = await loadCarriedIn(
      db as never,
      [{ id: 'enr-1', startDate: null }],
      SEPTEMBER,
    );

    expect(res.get('enr-1')).toEqual({
      lessons: 5,
      value: 187_500,
      batches: [{ deductionId: 'ded-aug', lessons: 5, value: 187_500 }],
    });
  });

  it('does not query for an empty list', async () => {
    const db = {
      transaction: { findMany: jest.fn() },
      attendance: { findMany: jest.fn() },
    };
    expect((await loadCarriedIn(db as never, [], SEPTEMBER)).size).toBe(0);
    expect(db.transaction.findMany).not.toHaveBeenCalled();
  });
});
