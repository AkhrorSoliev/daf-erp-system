import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RefundsCreateService } from './refunds-create.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';

jest.mock('../common/auth/financial-write-scope', () => ({
  assertCallerMayWriteForStudent: jest.fn().mockResolvedValue(1),
}));

/**
 * A refund is paid out of two places and only two: the free balance, and the
 * lessons the student has paid for but not yet taken. Money that is already
 * spent on attended lessons — ABSENT ones included, they are billable here — is
 * gone and cannot fund a payout.
 *
 * The version this replaces credited `deductions − PRESENT/LATE` back to the
 * balance without touching `prepaidLessonsRemaining`, so the same lessons
 * stayed covered while their money returned. One student gained 200 000 so'm that
 * way, and the credit was re-offered in full on every subsequent refund.
 */
describe('RefundsCreateService.quickRefund', () => {
  let service: RefundsCreateService;
  let prisma: any;
  let transactionsService: any;
  let enrollmentBilling: any;
  let student: any;
  let enrollment: any;
  let tx: any;
  let history: any;
  let events: { emit: jest.Mock };

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

    tx = {
      refund: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: 'ref-1', ...data }),
        ),
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
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    history = { recordStatusChange: jest.fn() };
    events = { emit: jest.fn() };
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
        { provide: EntityHistoryService, useValue: history },
        { provide: EventEmitter2, useValue: events },
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
    // 1 000 so'm free, six lessons ahead, 90 000 asked for.
    // Shortfall is 89 000 — two lessons (66 666) fall short, three (99 999) do it.
    student.balance = 1_000;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockImplementation(pricedPerLesson);

    await service.quickRefund(dto(100_000), 99, 1);

    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enrollmentId: 'enr-1', lessons: 3 }),
    );
  });

  it('refuses more than balance plus prepaid value, writing nothing', async () => {
    student.balance = 1_000;
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
    // A request open seconds ago is as much a duplicate as a payout.
    expect(prisma.refund.findFirst.mock.calls[0][0].where.status).toEqual({
      in: ['REQUESTED', 'COMPLETED'],
    });
  });

  /**
   * A frozen student has no ACTIVE enrollment — `dto.enrollmentId` is
   * omitted and the payout is funded from the free balance alone, through
   * the same `TransactionsService.recordRefund` the enrollment path uses.
   */
  describe('balance-only path (no enrollmentId)', () => {
    const balanceOnlyDto = (amount: number) => ({
      studentId: 10001,
      amount,
      refundMethod: 'CASH' as const,
    });

    it('succeeds and moves exactly the balance through recordRefund, never touching enrollments', async () => {
      student.balance = 180_000;

      await service.quickRefund(balanceOnlyDto(180_000), 99, 1);

      expect(transactionsService.recordRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 10001,
          amount: 180_000,
        }),
        expect.anything(),
      );
      expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
      expect(enrollmentBilling.releasePrepaidLessons).not.toHaveBeenCalled();
      expect(enrollmentBilling.prepaidRefundValue).not.toHaveBeenCalled();
    });

    it('refuses a refund larger than the balance, writing nothing', async () => {
      student.balance = 100_000;

      await expect(
        service.quickRefund(balanceOnlyDto(150_000), 99, 1),
      ).rejects.toThrow(BadRequestException);

      expect(transactionsService.recordRefund).not.toHaveBeenCalled();
    });

    it('refuses any refund for a frozen student with zero balance', async () => {
      student.balance = 0;

      await expect(
        service.quickRefund(balanceOnlyDto(1), 99, 1),
      ).rejects.toThrow(BadRequestException);

      expect(transactionsService.recordRefund).not.toHaveBeenCalled();
    });
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

  describe('the request (ADR-0076)', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      // Monday 28.09.2026, 11:00 Tashkent; Thursday 01.10 is a holiday.
      jest.setSystemTime(new Date('2026-09-28T06:00:00Z'));
      prisma.holiday.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-01T00:00:00Z'),
        },
      ]);
      student.balance = 500_000;
    });
    afterEach(() => jest.useRealTimers());

    it('opens a REQUESTED refund due on the 10th bank day, with no method and no payout stamp', async () => {
      const out = await service.quickRefund(dto(100_000), 99, 1);

      const data = tx.refund.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'REQUESTED',
        requestedAmount: 100_000,
        approvedAmount: 100_000,
        requestedById: 99,
        // 13.10 at 00:00 Tashkent.
        dueDate: new Date('2026-10-12T19:00:00.000Z'),
      });
      expect(data.refundMethod).toBeUndefined();
      expect(data.processedAt).toBeUndefined();
      expect(data.processedById).toBeUndefined();
      expect(out.dueDate).toBe('2026-10-13');
    });

    it("reads the holidays of the student's branch", async () => {
      await service.quickRefund(dto(100_000), 99, 1);
      expect(prisma.holiday.findMany.mock.calls[0][0].where.OR).toEqual([
        { branchId: null },
        { branchId: 1 },
      ]);
    });

    it('takes the money off the balance at once, in the same transaction', async () => {
      await service.quickRefund(dto(100_000), 99, 1);
      expect(transactionsService.recordRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100_000, refundId: 'ref-1' }),
        tx,
      );
    });

    it('records the request in the student history', async () => {
      await service.quickRefund({ ...dto(100_000), reason: 'Ketdi' }, 99, 1);
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          oldValues: { balans: 500_000 },
          newValues: expect.objectContaining({
            status: 'PUL_QAYTARISH_SOROVI',
            summa: 100_000,
            muddat: '13.10.2026',
            sabab: 'Ketdi',
          }),
        }),
      );
    });

    describe('the student is told after the commit', () => {
      const payload = {
        refundId: 'ref-1',
        studentId: 10001,
        companyId: 1,
        performedById: 99,
      };

      it('emits refund.requested once, after the transaction, with ids only', async () => {
        const order: string[] = [];
        tx.refund.create.mockImplementation(({ data }: any) => {
          order.push('write');
          return Promise.resolve({ id: 'ref-1', ...data });
        });
        events.emit.mockImplementation(() => order.push('emit'));

        await service.quickRefund(dto(100_000), 99, 1);

        expect(events.emit).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledWith('refund.requested', payload);
        expect(order).toEqual(['write', 'emit']);
      });

      it('the balance-only path emits it too', async () => {
        await service.quickRefund({ studentId: 10001, amount: 200_000 }, 99, 1);
        expect(events.emit).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledWith('refund.requested', payload);
      });

      it('a refused request emits nothing', async () => {
        await expect(service.quickRefund(dto(600_000), 99, 1)).rejects.toThrow(
          BadRequestException,
        );
        expect(events.emit).not.toHaveBeenCalled();
      });

      it('a failed write emits nothing (both paths)', async () => {
        transactionsService.recordRefund.mockRejectedValue(new Error('boom'));
        await expect(service.quickRefund(dto(100_000), 99, 1)).rejects.toThrow(
          'boom',
        );
        await expect(
          service.quickRefund({ studentId: 10001, amount: 200_000 }, 99, 1),
        ).rejects.toThrow('boom');
        expect(events.emit).not.toHaveBeenCalled();
      });
    });

    it('the balance-only path opens the same kind of request', async () => {
      const out = await service.quickRefund(
        { studentId: 10001, amount: 200_000 },
        99,
        1,
      );
      expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({
        status: 'REQUESTED',
        enrollmentId: null,
        requestedById: 99,
      });
      expect(out.dueDate).toBe('2026-10-13');
    });
  });
});
