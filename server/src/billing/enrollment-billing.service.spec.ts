import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentBillingService } from './enrollment-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';

describe('EnrollmentBillingService.refundPrepaidToBalance', () => {
  let service: EnrollmentBillingService;
  let tx: any;
  let transactionsService: any;
  let salaryAccrualService: any;

  beforeEach(async () => {
    tx = {
      enrollment: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      // Faza 8 — refundPrepaidToBalance now reads the most recent
      // LESSON_DEDUCTION's metadata.perLessonCost so course price
      // changes after the deduction don't affect the refund. Default to
      // null (no metadata) so existing tests fall through to legacy
      // course-price math; one new test below overrides this.
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: { findUnique: jest.fn(), update: jest.fn() },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
    };
    transactionsService = {
      createAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
      reverseTransaction: jest.fn(),
    };
    salaryAccrualService = {
      reverseAccrualForAttendance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentBillingService,
        { provide: PrismaService, useValue: tx },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: SalaryAccrualService, useValue: salaryAccrualService },
      ],
    }).compile();

    service = module.get(EnrollmentBillingService);
  });

  it('returns null when enrollment does not exist', async () => {
    tx.enrollment.findUnique.mockResolvedValue(null);
    const result = await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'missing',
      performedById: 99,
    });
    expect(result).toBeNull();
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
  });

  it('returns null when prepaidLessonsRemaining is 0 (no-op)', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-1',
      studentId: 10001,
      prepaidLessonsRemaining: 0,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 400_000, lessonPaymentCount: 12 },
      },
    });
    const result = await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-1',
      performedById: 99,
    });
    expect(result).toBeNull();
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });

  it('Misol 4: refunds 5 × 33,333 to balance and zeroes prepaid', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-A',
      studentId: 10001,
      prepaidLessonsRemaining: 5,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 400_000, lessonPaymentCount: 12 },
      },
    });

    const result = await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-A',
      performedById: 99,
      reason: 'Transfer',
    });

    expect(result).toEqual({ refunded: 5 * 33_333, lessons: 5 });
    expect(transactionsService.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 10001,
        amount: 5 * 33_333,
        description: 'Transfer',
      }),
      tx,
    );
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-A' },
      data: { prepaidLessonsRemaining: 0 },
    });
  });

  it('P1.6: uses original metadata.perLessonCost over current course price', async () => {
    // Original deduction was at 30,000 per lesson; course price has since
    // moved to 50,000/lesson. Refund must use the original price (the
    // student is owed what they paid in, not what the course costs now).
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-1',
      studentId: 10001,
      prepaidLessonsRemaining: 4,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 600_000, lessonPaymentCount: 12 },
      },
    });
    tx.transaction.findFirst.mockResolvedValue({
      metadata: { perLessonCost: 30_000 },
    });

    await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-1',
      performedById: 99,
    });

    expect(transactionsService.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4 * 30_000 }), // not 4 × 50,000
      tx,
    );
  });

  it('falls back to default lessonPaymentCount when course value is missing', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-1',
      studentId: 10001,
      prepaidLessonsRemaining: 3,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 360_000, lessonPaymentCount: 0 },
      },
    });
    await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-1',
      performedById: 99,
    });
    // 360,000 / 12 (default) = 30,000 per lesson; 3 lessons = 90,000
    expect(transactionsService.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 90_000 }),
      tx,
    );
  });
});
