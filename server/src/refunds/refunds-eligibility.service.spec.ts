import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundsEligibilityService } from './refunds-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';

describe('RefundsEligibilityService', () => {
  let service: RefundsEligibilityService;
  let prisma: any;
  let billing: any;

  const studentRow = { id: 10001, balance: 100_000 };
  const lastPaymentRow = {
    amount: 150_000,
    method: 'PAYME',
    createdAt: new Date('2026-08-12T09:30:00Z'),
  };
  const enrollmentRow = {
    id: 'enr-1',
    groupId: 'group-1',
    status: 'ACTIVE',
    prepaidLessonsRemaining: 0,
    group: {
      name: 'TOS-101',
      course: {
        name: 'Standart',
        price: 400_000,
        lessonPaymentCount: 12,
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(studentRow) },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue(enrollmentRow),
        findMany: jest.fn().mockResolvedValue([enrollmentRow]),
      },
      attendance: { count: jest.fn().mockResolvedValue(0) },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 400_000 } }),
        findFirst: jest.fn().mockResolvedValue(lastPaymentRow),
      },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      refund: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { approvedAmount: 0 } }),
      },
    };

    billing = { prepaidRefundValue: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsEligibilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: EnrollmentBillingService, useValue: billing },
      ],
    }).compile();

    service = module.get<RefundsEligibilityService>(RefundsEligibilityService);
  });

  it('throws NotFoundException when student is missing', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.previewRefund(10001, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when student has no active enrollment', async () => {
    prisma.enrollment.findMany.mockResolvedValue([]);
    await expect(service.previewRefund(10001, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when multiple active enrollments and no enrollmentId given', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enrollmentRow,
      { ...enrollmentRow, id: 'enr-2' },
    ]);
    await expect(service.previewRefund(10001, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('uses explicit enrollmentId when provided', async () => {
    await service.previewRefund(10001, 1, 'enr-1');
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'enr-1',
          studentId: 10001,
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when explicit enrollmentId does not match the student', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(service.previewRefund(10001, 1, 'enr-foreign')).rejects.toThrow(
      NotFoundException,
    );
  });

  // The dialog must refuse what the refund itself would refuse. `quickRefund`
  // only accepts an ACTIVE enrollment, so a preview that happily quoted a
  // DROPPED group sent the operator to a 400 on the button they just filled in.
  it('rejects a non-ACTIVE enrollment even when named explicitly', async () => {
    prisma.enrollment.findFirst.mockResolvedValue({
      ...enrollmentRow,
      status: 'DROPPED',
    });

    await expect(service.previewRefund(10001, 1, 'enr-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('payments aggregation', () => {
    it('sums COMPLETED non-reversed payments at the student level', async () => {
      await service.previewRefund(10001, 1);

      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 10001,
            companyId: 1,
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('returns the aggregated payment total as paidAmount', async () => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 750_000 },
      });
      const result = await service.previewRefund(10001, 1);
      expect(result.paidAmount).toBe(750_000);
    });
  });

  describe('last payment', () => {
    // The refund is taken out of the money that most recently came in, so the
    // dialog has to show which payment that was. It reads the SAME set the
    // paidAmount total is summed from, or the two lines could disagree.
    it('reads the newest payment from the same filter paidAmount is summed over', async () => {
      await service.previewRefund(10001, 1);

      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 10001,
            companyId: 1,
            status: 'COMPLETED',
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns the last payment amount, method and date', async () => {
      const result = await service.previewRefund(10001, 1);

      expect(result.lastPayment).toEqual({
        amount: 150_000,
        method: 'PAYME',
        paidAt: lastPaymentRow.createdAt,
      });
    });

    it('returns null when the student has never paid', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.previewRefund(10001, 1);

      expect(result.lastPayment).toBeNull();
      expect(result.paidAmount).toBe(0);
    });
  });


  /**
   * What a refund may return.
   *
   * This used to be derived: `lesson deductions − PRESENT/LATE attendance`. That
   * difference is never "money over-deducted" — the ledger always deducts
   * exactly `attendance + prepaidLessonsRemaining`, so the gap is precisely the
   * ABSENT lessons (which ARE billable here) plus the lessons already reserved
   * for future dates. Restoring it credited a student money nobody paid, twice
   * over, and the counter it should have consumed stayed untouched.
   */
  describe('what may be refunded', () => {
    it('is the free balance plus the value of the prepaid lessons', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 17 });
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 6 },
      ]);
      billing.prepaidRefundValue.mockResolvedValue(199_998);

      const result = await service.previewRefund(10001, 1);

      expect(result.prepaidLessons).toBe(6);
      expect(result.prepaidValue).toBe(199_998);
      expect(result.maxRefundable).toBe(200_015);
    });

    it('does not grow with ABSENT lessons', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 0 });
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 0 },
      ]);
      prisma.attendance.count.mockResolvedValue(5);

      const result = await service.previewRefund(10001, 1);

      expect(result.maxRefundable).toBe(0);
    });

    it('nets a negative balance off the prepaid value', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: -50_000 });
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 3 },
      ]);
      billing.prepaidRefundValue.mockResolvedValue(99_999);

      const result = await service.previewRefund(10001, 1);

      expect(result.maxRefundable).toBe(49_999);
    });

    it('never goes below zero for a debtor with no prepaid lessons', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: -80_000 });
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 0 },
      ]);

      const result = await service.previewRefund(10001, 1);

      expect(result.maxRefundable).toBe(0);
    });

    it('prices the prepaid lessons through the billing service, not its own math', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 4 },
      ]);

      await service.previewRefund(10001, 1);

      expect(billing.prepaidRefundValue).toHaveBeenCalledWith(
        prisma,
        'enr-1',
        expect.objectContaining({ price: 400_000, lessonPaymentCount: 12 }),
        4,
      );
    });

    it('warns when there is nothing but free balance to draw on', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 10_000 });
      prisma.enrollment.findMany.mockResolvedValue([
        { ...enrollmentRow, prepaidLessonsRemaining: 0 },
      ]);

      const result = await service.previewRefund(10001, 1);

      expect(result.warning).toMatch(/balansdagi/i);
    });
  });
});
