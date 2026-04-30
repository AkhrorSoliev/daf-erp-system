import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundsEligibilityService } from './refunds-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RefundsEligibilityService', () => {
  let service: RefundsEligibilityService;
  let prisma: any;

  const studentRow = { id: 10001, balance: 100_000 };
  const enrollmentRow = {
    id: 'enr-1',
    groupId: 'group-1',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsEligibilityService,
        { provide: PrismaService, useValue: prisma },
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

  describe('ledger filter regression (reversedAt:null)', () => {
    // The bug: the original aggregate used only `reversedTransactionId: null`,
    // which excluded reversal entries but STILL counted reversed originals.
    // After a lesson reversal, the consumed total was double-charged. The
    // fix uses both `reversedTransactionId: null` AND `reversedAt: null`.
    it('uses both reversedTransactionId:null AND reversedAt:null on the enrollment-scoped query', async () => {
      await service.previewRefund(10001, 1);

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            enrollmentId: 'enr-1',
            type: 'LESSON_DEDUCTION',
            reversedTransactionId: null,
            reversedAt: null,
          }),
        }),
      );
    });

    it('reversed originals do not inflate ledgerConsumed', async () => {
      prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.attendance.count.mockResolvedValue(2);

      const result = await service.previewRefund(10001, 1);

      expect(result.ledgerConsumed).toBe(0);
      expect(result.attendanceConsumed).toBe(2 * Math.round(400_000 / 12));
      expect(result.overDeducted).toBe(0);
    });

    it('genuinely consumed lessons still count toward ledgerConsumed', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: -400_000 },
      });
      prisma.attendance.count.mockResolvedValue(8);

      const result = await service.previewRefund(10001, 1);

      expect(result.ledgerConsumed).toBe(400_000);
      expect(result.attendanceConsumed).toBe(8 * Math.round(400_000 / 12));
      expect(result.overDeducted).toBe(
        400_000 - 8 * Math.round(400_000 / 12),
      );
    });
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

  describe('warnings', () => {
    it('flags >50% completion as a non-eligible warning', async () => {
      prisma.attendance.count.mockResolvedValue(7);
      const result = await service.previewRefund(10001, 1);
      expect(result.warning).toMatch(/50%/);
    });

    it('no warning when <50% attended', async () => {
      prisma.attendance.count.mockResolvedValue(3);
      const result = await service.previewRefund(10001, 1);
      expect(result.warning).toBeNull();
    });
  });
});
