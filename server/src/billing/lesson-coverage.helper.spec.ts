import { TransactionType } from '@prisma/client';
import {
  allocateCoverage,
  computeEnrollmentCoverage,
  type CoverageTx,
  type CoveragePrismaLike,
} from './lesson-coverage.helper';

const d = (iso: string) => new Date(iso);

function deduction(
  id: string,
  enrollmentId: string,
  lessonsCovered: number,
  createdAt: string,
): CoverageTx {
  return {
    id,
    type: TransactionType.LESSON_DEDUCTION,
    amount: -1000 * lessonsCovered,
    enrollmentId,
    attendanceId: null,
    metadata: { lessonsCovered, perLessonCost: 1000 },
    createdAt: d(createdAt),
  };
}

function consumption(
  id: string,
  enrollmentId: string,
  attendanceId: string,
  createdAt: string,
): CoverageTx {
  return {
    id,
    type: TransactionType.LESSON_CONSUMPTION,
    amount: 0,
    enrollmentId,
    attendanceId,
    metadata: { perLessonCost: 1000 },
    createdAt: d(createdAt),
  };
}

describe('allocateCoverage', () => {
  it('FIFO: fills the oldest non-full deduction bucket first', () => {
    const txs: CoverageTx[] = [
      deduction('ded-1', 'enr-1', 2, '2026-06-01T00:00:00Z'),
      consumption('c-1', 'enr-1', 'att-1', '2026-06-02T00:00:00Z'),
      consumption('c-2', 'enr-1', 'att-2', '2026-06-04T00:00:00Z'),
      // 3-chi consumption — 1-bucket to'ldi, 2-deductionga o'tadi
      deduction('ded-2', 'enr-1', 2, '2026-06-05T00:00:00Z'),
      consumption('c-3', 'enr-1', 'att-3', '2026-06-06T00:00:00Z'),
    ];
    const attDates = new Map<string, Date>([
      ['att-1', d('2026-06-02')],
      ['att-2', d('2026-06-04')],
      ['att-3', d('2026-06-06')],
    ]);

    const { byDeduction, cycleByAttendanceId } = allocateCoverage(
      txs,
      attDates,
    );

    expect(byDeduction.get('ded-1')).toMatchObject({
      cycleSequenceNumber: 1,
      capacity: 2,
      coveredCount: 2,
    });
    expect(byDeduction.get('ded-2')).toMatchObject({
      cycleSequenceNumber: 2,
      capacity: 2,
      coveredCount: 1,
    });
    // att-1, att-2 -> sikl 1; att-3 -> sikl 2
    expect(cycleByAttendanceId.get('att-1')).toBe(1);
    expect(cycleByAttendanceId.get('att-2')).toBe(1);
    expect(cycleByAttendanceId.get('att-3')).toBe(2);
  });

  it('reads capacity from metadata.lessonsCovered', () => {
    const txs: CoverageTx[] = [
      deduction('ded-1', 'enr-1', 6, '2026-06-01T00:00:00Z'),
    ];
    const { byDeduction } = allocateCoverage(txs, new Map());
    expect(byDeduction.get('ded-1')?.capacity).toBe(6);
    expect(byDeduction.get('ded-1')?.coveredCount).toBe(0);
  });

  it('derives the date range from attendance.date, not createdAt', () => {
    // Retroaktiv billing: consumption createdAt deduction'dan keyin, lekin
    // dars sanasi (att-1) ancha oldin. Sana att.date dan olinishi shart.
    const txs: CoverageTx[] = [
      deduction('ded-1', 'enr-1', 2, '2026-06-10T00:00:00Z'),
      consumption('c-1', 'enr-1', 'att-1', '2026-06-10T01:00:00Z'),
      consumption('c-2', 'enr-1', 'att-2', '2026-06-10T02:00:00Z'),
    ];
    const attDates = new Map<string, Date>([
      ['att-1', d('2026-06-03')], // dars sanasi createdAt'dan oldin
      ['att-2', d('2026-06-05')],
    ]);
    const { byDeduction } = allocateCoverage(txs, attDates);
    const cov = byDeduction.get('ded-1')!;
    expect(cov.firstCoveredDate).toEqual(d('2026-06-03'));
    expect(cov.lastCoveredDate).toEqual(d('2026-06-05'));
  });

  it('resets cycleSequenceNumber per enrollment', () => {
    const txs: CoverageTx[] = [
      deduction('a-1', 'enr-A', 1, '2026-06-01T00:00:00Z'),
      deduction('a-2', 'enr-A', 1, '2026-06-08T00:00:00Z'),
      deduction('b-1', 'enr-B', 1, '2026-06-02T00:00:00Z'),
    ];
    const { byDeduction } = allocateCoverage(txs, new Map());
    expect(byDeduction.get('a-1')?.cycleSequenceNumber).toBe(1);
    expect(byDeduction.get('a-2')?.cycleSequenceNumber).toBe(2);
    expect(byDeduction.get('b-1')?.cycleSequenceNumber).toBe(1);
  });

  it('overflows into the last bucket instead of dropping a lesson', () => {
    // Sig'imdan oshgan iste'mol ilgari JIMGINA yo'qolardi (`continue`), ya'ni
    // o'tilgan dars hech qaysi siklga tegishli bo'lmay qolardi. Endi u
    // oxirgi paketga qo'shiladi — dars ledgerda bor, demak u ko'rinishi shart.
    const txs: CoverageTx[] = [
      deduction('ded-1', 'enr-1', 1, '2026-06-01T00:00:00Z'),
      consumption('c-1', 'enr-1', 'att-1', '2026-06-02T00:00:00Z'),
      consumption('c-2', 'enr-1', 'att-2', '2026-06-03T00:00:00Z'),
    ];
    const attDates = new Map<string, Date>([
      ['att-1', d('2026-06-02')],
      ['att-2', d('2026-06-03')],
    ]);
    const { byDeduction, cycleByAttendanceId } = allocateCoverage(
      txs,
      attDates,
    );
    expect(byDeduction.get('ded-1')?.coveredCount).toBe(2);
    expect(byDeduction.get('ded-1')?.consumedDates).toEqual([
      d('2026-06-02'),
      d('2026-06-03'),
    ]);
    expect(cycleByAttendanceId.get('att-2')).toBe(1);
  });

  it('opens the cycle before consuming from it when timestamps tie', () => {
    // Yechim va iste'mol bitta tranzaksiyada yozilsa `createdAt` bir xil
    // bo'ladi. Faqat `id` bo'yicha tartiblash iste'molni oldinga o'tkazib,
    // darsni yo'qotardi ('c-1' < 'ded-1').
    const txs: CoverageTx[] = [
      consumption('c-1', 'enr-1', 'att-1', '2026-06-01T00:00:00Z'),
      deduction('ded-1', 'enr-1', 2, '2026-06-01T00:00:00Z'),
    ];
    const { byDeduction } = allocateCoverage(
      txs,
      new Map([['att-1', d('2026-06-01')]]),
    );
    expect(byDeduction.get('ded-1')?.coveredCount).toBe(1);
  });
});

describe('computeEnrollmentCoverage', () => {
  it('returns empty maps for no enrollments without hitting the DB', async () => {
    const prisma = {
      transaction: { findMany: jest.fn() },
      attendance: { findMany: jest.fn() },
    } as unknown as CoveragePrismaLike;

    const res = await computeEnrollmentCoverage(prisma, []);
    expect(res.byDeduction.size).toBe(0);
    expect(res.cycleByAttendanceId.size).toBe(0);
    expect(prisma.transaction.findMany as jest.Mock).not.toHaveBeenCalled();
  });

  it('queries with reversedAt: null and joins attendance dates', async () => {
    const txFindMany = jest
      .fn()
      .mockResolvedValue([
        deduction('ded-1', 'enr-1', 2, '2026-06-01T00:00:00Z'),
        consumption('c-1', 'enr-1', 'att-1', '2026-06-02T00:00:00Z'),
      ]);
    const attFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'att-1', date: d('2026-06-02') }]);
    const prisma = {
      transaction: { findMany: txFindMany },
      attendance: { findMany: attFindMany },
    } as unknown as CoveragePrismaLike;

    const res = await computeEnrollmentCoverage(prisma, ['enr-1']);

    expect(txFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reversedAt: null }),
      }),
    );
    expect(attFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['att-1'] } } }),
    );
    expect(res.byDeduction.get('ded-1')).toMatchObject({
      coveredCount: 1,
      firstCoveredDate: d('2026-06-02'),
    });
  });
});
