import { releaseCancelledLesson } from './cancelled-lesson-release';
import { cancelledLessonRelease } from './departure-release';

// A group, September 2026: Tue/Thu/Sat, 450 000 over 12 lessons.
const SEPT_014 = [
  '2026-09-03',
  '2026-09-05',
  '2026-09-08',
  '2026-09-10',
  '2026-09-12',
  '2026-09-15',
  '2026-09-17',
  '2026-09-19',
  '2026-09-22',
  '2026-09-24',
  '2026-09-26',
  '2026-09-29',
];
const DAY = new Date('2026-09-17T00:00:00.000Z'); // @db.Date

const charge = (over: Record<string, unknown> = {}) => ({
  id: 'ch-1',
  enrollmentId: 'enr-1',
  studentId: 90998,
  branchId: 2,
  coveredDates: SEPT_014,
  frozenOutDates: ['2026-09-29'],
  perLessonCost: 37_500,
  discountPercent: 0,
  chargedAmount: 412_500,
  excusedLessons: 0,
  ...over,
});

function makeTx(charges: unknown[], excused: unknown[] = []) {
  return {
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue(charges),
      update: jest.fn().mockResolvedValue({}),
    },
    attendance: { findMany: jest.fn().mockResolvedValue(excused) },
  };
}

const params = {
  groupId: 'g-1',
  date: DAY,
  companyId: 1001,
  cancellationId: 'cancel-1',
  reason: "Dars o'tmadi",
  performedById: 90456,
};

describe('releaseCancelledLesson', () => {
  it('gives back the lesson price now and stops billing the day', async () => {
    const tx = makeTx([charge()]);
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };

    const res = await releaseCancelledLesson(
      tx as never,
      writes as never,
      params,
    );

    expect(res).toEqual({ students: 1, refunded: 37_500 });
    expect(writes.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 90998,
        amount: 37_500,
        branchId: 2,
        metadata: expect.objectContaining({
          kind: 'monthly-release',
          period: '2026-09',
          lessons: 1,
          dates: ['2026-09-17'],
          cancellationId: 'cancel-1',
        }),
      }),
      tx,
    );
    expect(tx.enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      data: {
        coveredLessons: 10, // 12 dates − 29.09 (transfer) − 17.09
        chargedAmount: 375_000,
        frozenOutDates: ['2026-09-17', '2026-09-29'],
      },
    });
    // Only charges that billed THIS day are read.
    expect(tx.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 'g-1',
          periodYear: 2026,
          periodMonth: 9,
          coveredDates: { has: '2026-09-17' },
        }),
      }),
    );
  });

  it('takes back the next-month credit of a student whose day was counted EXCUSED', async () => {
    const tx = makeTx([charge({ excusedLessons: 2 })], [{ studentId: 90998 }]);
    const writes = { createAdjustment: jest.fn().mockResolvedValue({}) };

    await releaseCancelledLesson(tx as never, writes as never, params);

    expect(tx.enrollmentMonthlyCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ excusedLessons: { decrement: 1 } }),
      }),
    );
  });

  it('a day already given back is not paid twice', async () => {
    const tx = makeTx([
      charge({ frozenOutDates: ['2026-09-17', '2026-09-29'] }),
    ]);
    const writes = { createAdjustment: jest.fn() };

    const res = await releaseCancelledLesson(
      tx as never,
      writes as never,
      params,
    );

    expect(res).toEqual({ students: 0, refunded: 0 });
    expect(writes.createAdjustment).not.toHaveBeenCalled();
  });

  it('writes nothing when no monthly charge billed the day', async () => {
    const tx = makeTx([]);
    const writes = { createAdjustment: jest.fn() };

    const res = await releaseCancelledLesson(
      tx as never,
      writes as never,
      params,
    );

    expect(res.students).toBe(0);
    expect(tx.attendance.findMany).not.toHaveBeenCalled();
  });
});

describe('cancelledLessonRelease', () => {
  const input = {
    coveredDates: SEPT_014,
    frozenOutDates: [],
    perLessonCost: 37_500,
    discountPercent: 20,
    chargedAmount: 360_000,
  };

  it('returns the discounted lesson price', () => {
    expect(cancelledLessonRelease(input, '2026-09-17')?.amount).toBe(30_000);
  });

  it('never returns more than the charge still holds', () => {
    expect(
      cancelledLessonRelease({ ...input, chargedAmount: 10_000 }, '2026-09-17')
        ?.amount,
    ).toBe(10_000);
  });

  it('a day the charge did not bill gives nothing back', () => {
    expect(cancelledLessonRelease(input, '2026-09-18')).toBeNull();
  });
});
