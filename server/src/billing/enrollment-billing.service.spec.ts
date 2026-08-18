import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
    // Written as a decrement of everything remaining rather than a literal 0:
    // draining the counter is the same operation as releasing N of them, and
    // going through one path keeps the arithmetic in a single place.
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-A' },
      data: { prepaidLessonsRemaining: { decrement: 5 } },
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

/**
 * Partial prepaid release.
 *
 * `refundPrepaidWithOverride` zeroes the counter — right for FROZEN, where
 * whatever is left is forfeited. A refund taken while the student STAYS in the
 * group must cancel exactly the lessons it is paid out of and leave the rest
 * standing, or the student silently loses lessons they still own.
 */
describe('EnrollmentBillingService.releasePrepaidLessons', () => {
  let service: EnrollmentBillingService;
  let tx: any;
  let transactionsService: any;

  const enrollmentRow = {
    id: 'enroll-1',
    studentId: 10001,
    prepaidLessonsRemaining: 6,
    group: {
      branchId: 1,
      companyId: 1,
      course: { price: 400_000, lessonPaymentCount: 12 },
    },
  };

  beforeEach(async () => {
    tx = {
      enrollment: {
        findUnique: jest.fn().mockResolvedValue(enrollmentRow),
        update: jest.fn().mockResolvedValue({}),
      },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentBillingService,
        { provide: PrismaService, useValue: tx },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: SalaryAccrualService, useValue: { reverseAccrualForAttendance: jest.fn() } },
      ],
    }).compile();

    service = module.get(EnrollmentBillingService);
  });

  it('decrements the counter by exactly the lessons asked for', async () => {
    const result = await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 2,
      performedById: 99,
    });

    expect(result).toEqual({ refunded: 66_666, lessons: 2 });
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-1' },
      data: { prepaidLessonsRemaining: { decrement: 2 } },
    });
  });

  it('refuses to release more lessons than the enrollment holds', async () => {
    await expect(
      service.releasePrepaidLessons(tx, {
        enrollmentId: 'enroll-1',
        lessons: 7,
        performedById: 99,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });

  it('is a no-op for zero lessons', async () => {
    const result = await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 0,
      performedById: 99,
    });

    expect(result).toBeNull();
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });

  it('passes metadata through to the adjustment', async () => {
    await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 1,
      performedById: 99,
      metadata: { refundId: 'ref-1', lessonsReleased: 1 },
    });

    expect(transactionsService.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { refundId: 'ref-1', lessonsReleased: 1 },
      }),
      tx,
    );
  });

  it('prices the release off the deduction batch, discount and all', async () => {
    // 7-lesson batch charged 233 331 — the shape #10393 actually had.
    tx.transaction.findFirst.mockResolvedValue({
      amount: -233_331,
      metadata: { perLessonCost: 33_333, lessonsCovered: 7 },
    });

    const result = await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 3,
      performedById: 99,
    });

    expect(result).toEqual({ refunded: 99_999, lessons: 3 });
  });

  it('refundPrepaidToBalance still empties the counter', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      ...enrollmentRow,
      prepaidLessonsRemaining: 5,
    });

    const result = await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-1',
      performedById: 99,
    });

    expect(result).toEqual({ refunded: 166_665, lessons: 5 });
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-1' },
      data: { prepaidLessonsRemaining: { decrement: 5 } },
    });
  });
});
