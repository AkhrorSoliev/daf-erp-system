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
    transaction: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      student: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { count: jest.fn().mockResolvedValue(0) },
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

    const res = await service.preview(10001, 200000, 1001);

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

    const res = await service.preview(10001, 300000, 1001);

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

    const res = await service.preview(10001, 500000, 1001);

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

    const res = await service.preview(10001, 500000, 1001);

    expect(res.scenario).toBe('MULTI_ENROLLMENT');
    expect(res.primaryEnrollment).toBeNull();
    expect(res.breakdown).toEqual([
      expect.objectContaining({ kind: 'REMAINDER', amount: 500000 }),
    ]);
  });

  it("applies the student's discount the same way bill() does", async () => {
    prisma.student.findFirst.mockResolvedValue({
      balance: 0,
      discountPercent: 50, // half-price
    });
    prisma.enrollment.findMany.mockResolvedValue([baseEnrollment({ price: 414000, lpc: 12 })]);

    const res = await service.preview(10001, 207000, 1001);

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
