import { Test } from '@nestjs/testing';
import { PaymentsPreviewService } from './payments-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyDiscount } from '../billing/monthly-price';
import { LessonAdmissionService } from '../billing/lesson-admission.service';

const baseEnrollment = (
  overrides: Partial<{
    prepaid: number;
    price: number;
    lpc: number;
    model: 'LESSON_PACK' | 'MONTHLY';
    groupName: string;
    courseName: string;
    groupStatus: 'ACTIVE' | 'PAUSED';
  }> = {},
) => ({
  id: 'enr-1',
  prepaidLessonsRemaining: overrides.prepaid ?? 0,
  group: {
    id: 'grp-1',
    name: overrides.groupName ?? '#029',
    statusEnum: overrides.groupStatus ?? 'ACTIVE',
    course: {
      name: overrides.courseName ?? 'Intensive',
      price: overrides.price ?? 414000,
      lessonPaymentCount: overrides.lpc ?? 12,
      paymentModel: overrides.model ?? 'LESSON_PACK',
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
  let admission: { reachForPayment: jest.Mock };

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
    admission = { reachForPayment: jest.fn().mockResolvedValue(null) };
    const mod = await Test.createTestingModule({
      providers: [
        PaymentsPreviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonAdmissionService, useValue: admission },
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
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
    ]);
    prisma.transaction.count.mockResolvedValue(3);

    const res = await service.preview(10001, 300000, 1001, null);

    // Debt 253k + 47k remainder; 47k < perLessonCost (34_500) only buys 1 lesson partial
    expect(res.scenario).toBe('SINGLE_ENROLLMENT');
    expect(res.currentBalance).toBe(-253000);
    expect(res.newBalance).toBe(47000);
    expect(res.breakdown[0]).toMatchObject({
      kind: 'DEBT_REPAY',
      amount: 253000,
    });
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
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
    ]);
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
    prisma.enrollment.findMany.mockResolvedValue([
      baseEnrollment({ price: 414000, lpc: 12 }),
    ]);

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

  describe('MONTHLY courses', () => {
    it('attaches how far a monthly payment reaches (ADR-0047)', async () => {
      const reach = {
        paidThrough: '2026-10-05',
        next: { date: '2026-10-07', groupName: '#029', needed: 3846 },
        clearsDebt: false,
      };
      admission.reachForPayment.mockResolvedValue(reach);
      prisma.student.findFirst.mockResolvedValue({
        balance: -450000,
        discountPercent: 0,
      });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
      ]);

      const res = await service.preview(10001, 100000, 1001, null);

      expect(res.monthly?.admission).toEqual(reach);
      expect(admission.reachForPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 10001,
          companyId: 1001,
          balanceAfter: -350000,
        }),
      );
    });

    it('shows the debt and the next month instead of cycles', async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: -450000,
        discountPercent: 0,
      });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
      ]);

      const res = await service.preview(10001, 900000, 1001, null);

      expect(res.model).toBe('MONTHLY');
      expect(res.scenario).toBe('SINGLE_ENROLLMENT');
      expect(res.primaryEnrollment).toBeNull();
      expect(res.newBalance).toBe(450000);
      expect(res.monthly).toEqual({
        debt: 450000,
        nextMonthAmount: 450000,
        discountPercent: 0,
        enrollments: [
          {
            groupName: '#029',
            courseName: 'Intensive',
            monthlyPrice: 450000,
            amount: 450000,
          },
        ],
        admission: null,
      });
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'DEBT_REPAY', amount: 450000 }),
        expect.objectContaining({ kind: 'REMAINDER', amount: 450000 }),
      ]);
      for (const item of res.breakdown) {
        expect(item.label).not.toMatch(/sikl|dars/i);
        expect(item.lessons).toBeUndefined();
      }
      // Monthly charges are LESSON_DEDUCTION rows too; counting them as
      // "cycles" was the bug. The monthly path must not read them.
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it("applies the student's discount per enrollment, like the monthly charge", async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: 0,
        discountPercent: 10,
      });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
        {
          ...baseEnrollment({
            model: 'MONTHLY',
            price: 333333,
            groupName: '#031',
            courseName: 'Standart',
          }),
          id: 'enr-2',
        },
      ]);

      const res = await service.preview(10001, 100000, 1001, null);

      expect(res.scenario).toBe('MULTI_ENROLLMENT');
      // 450 000 × 0.9 = 405 000; 333 333 × 0.9 = 299 999.7 → 300 000
      expect(res.monthly?.enrollments.map((e) => e.amount)).toEqual([
        405000, 300000,
      ]);
      expect(res.monthly?.nextMonthAmount).toBe(
        applyDiscount(450000, 10) + applyDiscount(333333, 10),
      );
      expect(res.monthly?.discountPercent).toBe(10);
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'REMAINDER', amount: 100000 }),
      ]);
    });

    it('treats a student with no active enrollment as monthly with nothing due next month', async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: -120000,
        discountPercent: 0,
      });

      const res = await service.preview(10001, 120000, 1001, null);

      expect(res.model).toBe('MONTHLY');
      expect(res.scenario).toBe('NO_ENROLLMENT');
      expect(res.monthly).toEqual({
        debt: 120000,
        nextMonthAmount: 0,
        discountPercent: 0,
        enrollments: [],
        admission: null,
      });
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'DEBT_REPAY', amount: 120000 }),
      ]);
    });

    /**
     * Monthly billing charges ACTIVE groups only (`MonthlyChargeService`: the
     * `statusEnum` guard on a single enrollment and on the daily run's query).
     * An enrollment in a PAUSED group is still ACTIVE, so the preview used to
     * tell the student to pay a month that would never be charged.
     */
    describe('a PAUSED group', () => {
      /**
       * Prisma is a mock here, so it answers the one criterion these tests are
       * about: the group's status in the `where`. An unfiltered query returns
       * every row, exactly as the real database would.
       */
      const answerByGroupStatus =
        (rows: ReturnType<typeof baseEnrollment>[]) =>
        ({ where }: { where: { group?: { statusEnum?: string } } }) =>
          Promise.resolve(
            rows.filter(
              (row) =>
                where.group?.statusEnum === undefined ||
                row.group.statusEnum === where.group.statusEnum,
            ),
          );

      it('is not billed next month: only the ACTIVE group is summed', async () => {
        prisma.student.findFirst.mockResolvedValue({
          balance: 0,
          discountPercent: 0,
        });
        prisma.enrollment.findMany.mockImplementation(
          answerByGroupStatus([
            baseEnrollment({ model: 'MONTHLY', price: 450_000 }),
            {
              ...baseEnrollment({
                model: 'MONTHLY',
                price: 400_000,
                groupName: '#031',
                courseName: 'Standart',
                groupStatus: 'PAUSED',
              }),
              id: 'enr-2',
            },
          ]),
        );

        const res = await service.preview(10001, 100_000, 1001, null);

        expect(res.monthly?.nextMonthAmount).toBe(450_000);
        expect(res.monthly?.enrollments.map((e) => e.groupName)).toEqual([
          '#029',
        ]);
        expect(res.scenario).toBe('SINGLE_ENROLLMENT');
      });

      it('leaves a student whose only group is paused with nothing due next month', async () => {
        prisma.student.findFirst.mockResolvedValue({
          balance: -120_000,
          discountPercent: 0,
        });
        prisma.enrollment.findMany.mockImplementation(
          answerByGroupStatus([
            baseEnrollment({ model: 'MONTHLY', groupStatus: 'PAUSED' }),
          ]),
        );

        const res = await service.preview(10001, 120_000, 1001, null);

        expect(res.model).toBe('MONTHLY');
        expect(res.scenario).toBe('NO_ENROLLMENT');
        expect(res.monthly).toMatchObject({
          debt: 120_000,
          nextMonthAmount: 0,
          enrollments: [],
        });
        // The reach reads the student's own charges, not this list.
        expect(admission.reachForPayment).toHaveBeenCalledWith(
          expect.objectContaining({ studentId: 10001, balanceAfter: 0 }),
        );
      });
    });

    it('keeps the cycle projection when any enrollment is a lesson pack', async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: 0,
        discountPercent: 0,
      });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
        { ...baseEnrollment({ model: 'LESSON_PACK' }), id: 'enr-2' },
      ]);

      const res = await service.preview(10001, 500000, 1001, null);

      expect(res.model).toBe('LESSON_PACK');
      expect(res.monthly).toBeNull();
      expect(res.scenario).toBe('MULTI_ENROLLMENT');
    });

    it('tags a single lesson-pack enrollment LESSON_PACK and keeps its cycles', async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: 0,
        discountPercent: 0,
      });
      prisma.enrollment.findMany.mockResolvedValue([baseEnrollment()]);

      const res = await service.preview(10001, 414000, 1001, null);

      expect(res.model).toBe('LESSON_PACK');
      expect(res.monthly).toBeNull();
      expect(res.primaryEnrollment?.lessonPaymentCount).toBe(12);
      expect(res.breakdown[0]).toMatchObject({
        kind: 'CYCLE_FULL',
        lessons: 12,
      });
    });

    it("selects each course's payment model", async () => {
      prisma.student.findFirst.mockResolvedValue({
        balance: 0,
        discountPercent: 0,
      });

      await service.preview(10001, 1000, 1001, null);

      const args = prisma.enrollment.findMany.mock.calls[0][0] as {
        select: {
          group: { select: { course: { select: Record<string, boolean> } } };
        };
      };
      expect(args.select.group.select.course.select).toMatchObject({
        price: true,
        paymentModel: true,
      });
    });
  });
});
