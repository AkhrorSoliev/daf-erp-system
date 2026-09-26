import { computeEnrollmentCoverage } from '../billing/lesson-coverage.helper';
import { StatementLoader, groupLabel } from './statement.loader';

jest.mock('../billing/lesson-coverage.helper', () => ({
  computeEnrollmentCoverage: jest.fn(),
}));

describe('StatementLoader', () => {
  const prisma = {
    student: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn() },
    attendance: { findMany: jest.fn() },
  };
  const loader = new StatementLoader(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.student.findFirst.mockResolvedValue({
      id: 7,
      firstName: 'Test',
      lastName: 'Student',
      balance: -187_500,
      discountPercent: 0,
    });
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: 'e1',
        status: 'ACTIVE',
        startDate: new Date('2026-09-19T00:00:00Z'),
        createdAt: new Date('2026-09-19T08:00:00Z'),
        statusChangedAt: null,
        deletedAt: null,
        group: {
          groupNumber: 36,
          branch: { name: 'Filial' },
          course: {
            name: 'Standart',
            price: 450_000,
            lessonPaymentCount: 12,
            paymentModel: 'MONTHLY',
          },
        },
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'd1',
        type: 'LESSON_DEDUCTION',
        amount: -37_500,
        createdAt: new Date('2026-09-19T12:00:00Z'),
        description: 'Dars uchun yechildi',
        metadata: { mode: 'SINGLE_UNCOVERED' },
        enrollmentId: 'e1',
        paymentId: null,
        reversedAt: new Date(),
        reversedTransactionId: null,
        payment: null,
      },
      {
        id: 'p1',
        type: 'PAYMENT',
        amount: 100_000,
        createdAt: new Date('2026-09-20T20:30:00Z'),
        description: null,
        metadata: null,
        enrollmentId: null,
        paymentId: 'pay-1',
        reversedAt: null,
        reversedTransactionId: null,
        payment: { method: 'PAYME' },
      },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      {
        enrollmentId: 'e1',
        periodYear: 2026,
        periodMonth: 9,
        plannedLessons: 12,
        coveredDates: ['2026-09-19'],
        frozenOutDates: [],
        creditLessons: 0,
        creditAmount: 0,
        excusedLessons: 0,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        date: new Date('2026-09-19T00:00:00Z'),
        status: 'PRESENT',
        group: { groupNumber: 36 },
      },
    ]);
    (computeEnrollmentCoverage as jest.Mock).mockResolvedValue({
      byDeduction: new Map([
        ['d1', { consumedDates: [new Date('2026-09-19T00:00:00Z')] }],
      ]),
      cycleByAttendanceId: new Map(),
    });
  });

  it('formats a group number the way the app does', () => {
    expect(groupLabel(36)).toBe('#036');
    expect(groupLabel(1)).toBe('#001');
    expect(groupLabel(null, 'Individual')).toBe('Individual');
  });

  it('maps rows to Tashkent days with their flags and coverage', async () => {
    const input = await loader.load(7, 1, '2026-09-26');
    expect(input.student).toEqual({
      id: 7,
      name: 'Test Student',
      balance: -187_500,
      discountPercent: 0,
    });
    expect(input.enrollments[0]).toMatchObject({
      group: '#036',
      start: '2026-09-19',
      end: null,
      deleted: false,
    });
    expect(input.rows[0]).toMatchObject({
      day: '2026-09-19',
      reversed: true,
      reversal: false,
      consumedDays: ['2026-09-19'],
    });
    // 20:30 UTC is already the 21st in Tashkent.
    expect(input.rows[1]).toMatchObject({
      day: '2026-09-21',
      paymentMethod: 'PAYME',
      consumedDays: null,
    });
    expect(input.charges[0].period).toBe('2026-09');
    expect(input.attendance).toEqual([
      { day: '2026-09-19', group: '#036', status: 'PRESENT' },
    ]);
  });

  it('refuses a student of another company', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(loader.load(7, 2)).rejects.toThrow("O'quvchi topilmadi");
  });
});
