import { Test } from '@nestjs/testing';
import { PaymentsPreviewService } from './payments-preview.service';
import { PrismaService } from '../prisma/prisma.service';

const baseEnrollment = (overrides: Partial<{
  prepaid: number;
  price: number;
  lpc: number;
}> = {}) => ({
  id: 'enr-1',
  prepaidLessonsRemaining: overrides.prepaid ?? 0,
  group: {
    id: 'grp-1',
    name: '#029',
    course: {
      name: 'Intensive',
      price: overrides.price ?? 414000,
      lessonPaymentCount: overrides.lpc ?? 12,
    },
  },
});

describe('PaymentsPreviewService', () => {
  let service: PaymentsPreviewService;
  let prisma: {
    student: { findFirst: jest.Mock };
    enrollment: { findMany: jest.Mock };
    transaction: { count: jest.Mock; findMany: jest.Mock };
    attendance: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      student: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mod = await Test.createTestingModule({
      providers: [
        PaymentsPreviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(PaymentsPreviewService);
  });

  it('returns NO_ENROLLMENT scenario when the student has no active enrollment', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 100000,
      discountPercent: 0,
    });

    const res = await service.preview(10001, 200000, 1001, null);

    expect(res.scenario).toBe('NO_ENROLLMENT');
    expect(res.newBalance).toBe(300000);
    expect(res.primaryEnrollment).toBeNull();
    expect(res.breakdown).toEqual([
      expect.objectContaining({ kind: 'REMAINDER', amount: 200000 }),
    ]);
  });

  it('repays debt first when balance is negative', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: -253000,
      discountPercent: 0,
    });
    prisma.enrollment.findMany.mockResolvedValue([baseEnrollment({ price: 414000, lpc: 12 })]);
    prisma.transaction.count.mockResolvedValue(3);

    const res = await service.preview(10001, 300000, 1001, null);

    // Debt 253k + 47k remainder; 47k < perLessonCost (34_500) only buys 1 lesson partial
    expect(res.scenario).toBe('SINGLE_ENROLLMENT');
    expect(res.currentBalance).toBe(-253000);
    expect(res.newBalance).toBe(47000);
    expect(res.breakdown[0]).toMatchObject({ kind: 'DEBT_REPAY', amount: 253000 });
    // 47000 / 34500 = 1 lesson partial; 47000 - 34500 = 12500 remainder
    expect(res.breakdown).toEqual([
      expect.objectContaining({ kind: 'DEBT_REPAY', amount: 253000 }),
      expect.objectContaining({
        kind: 'CYCLE_PARTIAL',
        lessons: 1,
        cycleSequenceNumber: 4,
      }),
      expect.objectContaining({ kind: 'REMAINDER', amount: 12500 }),
    ]);
  });

  it('breaks a large payment into full cycles + partial + remainder', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 0,
      discountPercent: 0,
    });
    // 414_000 / 12 = 34_500 per lesson
    prisma.enrollment.findMany.mockResolvedValue([baseEnrollment({ price: 414000, lpc: 12 })]);
    prisma.transaction.count.mockResolvedValue(0);

    const res = await service.preview(10001, 500000, 1001, null);

    expect(res.scenario).toBe('SINGLE_ENROLLMENT');
    // 500_000 = 414_000 (full sikl) + 86_000 → 2 dars * 34_500 = 69_000 (partial) + 17_000 (remainder)
    expect(res.breakdown).toEqual([
      expect.objectContaining({
        kind: 'CYCLE_FULL',
        amount: 414000,
        lessons: 12,
        cycleSequenceNumber: 1,
      }),
      expect.objectContaining({
        kind: 'CYCLE_PARTIAL',
        amount: 69000,
        lessons: 2,
        cycleSequenceNumber: 2,
      }),
      expect.objectContaining({ kind: 'REMAINDER', amount: 17000 }),
    ]);
  });

  it('falls back to MULTI_ENROLLMENT scenario when student has 2+ active enrollments', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 0,
      discountPercent: 0,
    });
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
      { ...baseEnrollment({ price: 690000, lpc: 20 }), id: 'enr-2' },
    ]);

    const res = await service.preview(10001, 500000, 1001, null);

    expect(res.scenario).toBe('MULTI_ENROLLMENT');
    expect(res.primaryEnrollment).toBeNull();
    expect(res.breakdown).toEqual([
      expect.objectContaining({ kind: 'REMAINDER', amount: 500000 }),
    ]);
  });

  it('surfaces the past unpaid lesson date range on DEBT_REPAY', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: -69000, // 2 ta to'lanmagan dars (34_500 * 2)
      discountPercent: 0,
    });
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
    ]);
    prisma.transaction.count.mockResolvedValue(2);
    // Hech qaysi dars qoplanmagan (consumption yo'q)
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      { date: new Date('2026-05-04') },
      { date: new Date('2026-05-06') },
    ]);

    const res = await service.preview(10001, 69000, 1001, null);

    const debt = res.breakdown.find((b) => b.kind === 'DEBT_REPAY');
    expect(debt).toMatchObject({
      kind: 'DEBT_REPAY',
      amount: 69000,
      lessons: 2,
    });
    expect(debt?.firstLessonDate).toBe(new Date('2026-05-04').toISOString());
    expect(debt?.lastLessonDate).toBe(new Date('2026-05-06').toISOString());
    // Faqat eng eski 2 ta to'lanmagan darsni so'raydi
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, orderBy: { date: 'asc' } }),
    );
  });

  it('labels future cycles forward-looking (no "Sikl #N") with null dates', async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 0,
      discountPercent: 0,
    });
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
    ]);
    prisma.transaction.count.mockResolvedValue(2);

    const res = await service.preview(10001, 414000, 1001, null);

    const full = res.breakdown.find((b) => b.kind === 'CYCLE_FULL');
    expect(full?.label).toContain('Kelgusi sikl');
    expect(full?.label).not.toContain('#');
    expect(full?.firstLessonDate).toBeNull();
    expect(full?.lastLessonDate).toBeNull();
    // cycleSequenceNumber hali ham mavjud (ichki foydalanish uchun)
    expect(full?.cycleSequenceNumber).toBe(3);
  });

  it("applies the student's discount the same way bill() does", async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 0,
      discountPercent: 50, // half-price
    });
    prisma.enrollment.findMany.mockResolvedValue([baseEnrollment({ price: 414000, lpc: 12 })]);

    const res = await service.preview(10001, 207000, 1001, null);

    // Discounted full cycle = 207_000 → exactly one full cycle.
    expect(res.breakdown).toEqual([
      expect.objectContaining({
        kind: 'CYCLE_FULL',
        amount: 207000,
        lessons: 12,
        cycleSequenceNumber: 1,
      }),
    ]);
  });
});
