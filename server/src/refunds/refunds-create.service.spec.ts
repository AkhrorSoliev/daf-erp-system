import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RefundsCreateService } from './refunds-create.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';

jest.mock('../common/auth/financial-write-scope', () => ({
  assertCallerMayWriteForStudent: jest.fn().mockResolvedValue(undefined),
}));

/**
 * A refund is paid out of two places and only two: the free balance, and the
 * lessons the student has paid for but not yet taken. Money that is already
 * spent on attended lessons — ABSENT ones included, they are billable here — is
 * gone and cannot fund a payout.
 *
 * The version this replaces credited `deductions − PRESENT/LATE` back to the
 * balance without touching `prepaidLessonsRemaining`, so the same lessons
 * stayed covered while their money returned. #10393 gained 266 664 so'm that
 * way, and the credit was re-offered in full on every subsequent refund.
 */
describe('RefundsCreateService.quickRefund', () => {
  let service: RefundsCreateService;
  let prisma: any;
  let transactionsService: any;
  let enrollmentBilling: any;
  let student: any;
  let enrollment: any;

  const dto = (amount: number) => ({
    studentId: 10001,
    enrollmentId: 'enr-1',
    amount,
    refundMethod: 'CASH' as const,
  });

  beforeEach(async () => {
    student = { id: 10001, balance: 0 };
    enrollment = {
      id: 'enr-1',
      groupId: 'group-1',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      prepaidLessonsRemaining: 0,
      group: {
        name: '#011',
        course: { name: 'Standart', price: 400_000, lessonPaymentCount: 12 },
      },
    };

    prisma = {
      student: { findFirst: jest.fn(() => Promise.resolve(student)) },
      enrollment: { findFirst: jest.fn(() => Promise.resolve(enrollment)) },
      attendance: { count: jest.fn().mockResolvedValue(0) },
      refund: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { approvedAmount: 0 } }),
      },
      $transaction: jest.fn((cb: any) =>
        cb({
          refund: { create: jest.fn().mockResolvedValue({ id: 'ref-1' }) },
        }),
      ),
    };
    transactionsService = {
      recordRefund: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      createAdjustment: jest.fn(),
    };
    enrollmentBilling = {
      prepaidRefundValue: jest.fn().mockResolvedValue(0),
      releasePrepaidLessons: jest
        .fn()
        .mockImplementation((_tx: unknown, p: { lessons: number }) =>
          Promise.resolve({ refunded: p.lessons * 33_333, lessons: p.lessons }),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsCreateService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EnrollmentBillingService, useValue: enrollmentBilling },
        {
          provide: EntityHistoryService,
          useValue: { recordStatusChange: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RefundsCreateService);
  });

  /** Value of N lessons at the 33 333 per-lesson price used across these tests. */
  const pricedPerLesson = (_tx: unknown, _id: string, _c: unknown, n: number) =>
    Promise.resolve(n * 33_333);

  it('leaves the lessons alone when the free balance covers the payout', async () => {
    student.balance = 500_000;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await service.quickRefund(dto(100_000), 99, 1);

    expect(enrollmentBilling.releasePrepaidLessons).not.toHaveBeenCalled();
    expect(transactionsService.recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100_000 }),
      expect.anything(),
    );
  });

  it('cancels the fewest lessons that cover the shortfall', async () => {
    // #10393 exactly: 17 so'm free, six lessons ahead, 100 000 asked for.
    // Shortfall is 99 983 — two lessons (66 666) fall short, three (99 999) do it.
    student.balance = 17;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await service.quickRefund(dto(100_000), 99, 1);

    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enrollmentId: 'enr-1', lessons: 3 }),
    );
  });

  it('refuses more than balance plus prepaid value, writing nothing', async () => {
    student.balance = 17;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await expect(service.quickRefund(dto(500_000), 99, 1)).rejects.toThrow(
      BadRequestException,
    );

    expect(enrollmentBilling.releasePrepaidLessons).not.toHaveBeenCalled();
    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
  });

  it('gives ABSENT lessons nothing to pay out of', async () => {
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 0;
    prisma.attendance.count.mockResolvedValue(3);

    await expect(service.quickRefund(dto(33_333), 99, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('tags the release with the refund it belongs to', async () => {
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 4;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await service.quickRefund(dto(33_333), 99, 1);

    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lessons: 1,
        metadata: { refundId: 'ref-1', lessonsReleased: 1 },
      }),
    );
  });

  it('records the payout after the lessons are released', async () => {
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 4;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await service.quickRefund(dto(33_333), 99, 1);

    expect(transactionsService.recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 33_333, refundId: 'ref-1' }),
      expect.anything(),
    );
  });

  it('refuses an identical refund raised seconds ago', async () => {
    student.balance = 500_000;
    prisma.refund.findFirst.mockResolvedValue({ id: 'ref-earlier' });

    await expect(service.quickRefund(dto(100_000), 99, 1)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
  });

  it('falls back to every remaining lesson when granularity leaves a gap', async () => {
    // Rounding can leave the last lesson worth slightly less than the shortfall;
    // the max check already passed, so release everything rather than nothing.
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 3;
    enrollmentBilling.prepaidRefundValue.mockImplementation(
      (_tx: unknown, _id: string, _c: unknown, n: number) =>
        Promise.resolve(n === 3 ? 100_000 : n * 33_000),
    );

    await service.quickRefund(dto(100_000), 99, 1);

    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lessons: 3 }),
    );
  });
});
