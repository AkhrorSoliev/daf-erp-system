import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RefundStatus } from '@prisma/client';
import { RefundsProcessService } from './refunds-process.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';
import { EntityHistoryService } from '../common/entity-history';

const CEO = {
  mainBranch: null,
  branches: [],
  roles: [{ role: { name: 'CEO' } }],
};

/** «Berildi» and «Bekor qilish» on a refund request (ADR-0076). */
describe('RefundsProcessService — hand-over and cancel', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let tx: any;
  let transactionsService: any;
  let cash: any;
  let history: any;
  let events: { emit: jest.Mock };

  const requested = {
    id: 'refund-1',
    studentId: 10001,
    enrollmentId: 'enr-1',
    status: RefundStatus.REQUESTED,
    requestedAmount: 120_000,
    approvedAmount: 120_000,
  };

  beforeEach(async () => {
    tx = {
      refund: {
        findFirst: jest.fn().mockResolvedValue({ ...requested }),
        update: jest.fn(({ data }: any) =>
          Promise.resolve({ ...requested, dueDate: null, ...data }),
        ),
      },
      transaction: { findFirst: jest.fn() },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(CEO) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      refund: { findFirst: jest.fn().mockResolvedValue({ ...requested }) },
      cashAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acc-1',
          name: 'Asosiy kassa',
          type: 'CASH',
        }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    transactionsService = {
      reverseTransaction: jest.fn().mockResolvedValue({}),
    };
    cash = { recordOutflow: jest.fn().mockResolvedValue({}) };
    history = { recordStatusChange: jest.fn() };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: CashMovementsService, useValue: cash },
        { provide: EntityHistoryService, useValue: history },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = module.get(RefundsProcessService);
  });

  describe('handOver', () => {
    beforeEach(() =>
      tx.transaction.findFirst.mockResolvedValue({ id: 'tx-refund' }),
    );

    it("takes the money out of the chosen drawer of the student's branch and closes the request", async () => {
      const out = await service.handOver('refund-1', 'acc-1', 7, 1001);

      expect(prisma.cashAccount.findFirst.mock.calls[0][0].where).toEqual({
        id: 'acc-1',
        companyId: 1001,
        branchId: 1,
        isActive: true,
        deletedAt: null,
      });
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          branchId: 1,
          amount: 120_000,
          cashAccountId: 'acc-1',
          transactionId: 'tx-refund',
          performedById: 7,
        }),
        tx,
      );
      expect(tx.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          handedOverById: 7,
          processedById: 7,
          cashAccountId: 'acc-1',
          refundMethod: 'CASH',
          handedOverAt: expect.any(Date),
          processedAt: expect.any(Date),
        }),
      });
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 10001,
          oldValues: {},
          newValues: expect.objectContaining({
            status: 'PUL_QAYTARIB_BERILDI',
            summa: 120_000,
            kassa: 'Asosiy kassa',
            usul: 'Naqd',
          }),
          tx,
        }),
      );
      // The receipt endpoint opens a COMPLETED refund only — this is that moment.
      expect(out.status).toBe('COMPLETED');
    });

    it('a card or bank drawer records the payout as a transfer', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-2',
        name: 'Karta',
        type: 'CARD',
      });
      await service.handOver('refund-1', 'acc-2', 7, 1001);
      expect(tx.refund.update.mock.calls[0][0].data.refundMethod).toBe(
        'TRANSFER',
      );
    });

    it("refuses a drawer outside the student's branch, writing nothing", async () => {
      prisma.cashAccount.findFirst.mockResolvedValue(null);
      await expect(
        service.handOver('refund-1', 'acc-9', 7, 1001),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a request already handed over is a 409', async () => {
      tx.refund.findFirst.mockResolvedValue({
        ...requested,
        status: RefundStatus.COMPLETED,
      });
      await expect(
        service.handOver('refund-1', 'acc-1', 7, 1001),
      ).rejects.toThrow(new ConflictException("So'rov allaqachon yopilgan"));
      expect(cash.recordOutflow).not.toHaveBeenCalled();
    });

    it('refuses a caller of another branch', async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: 2,
        branches: [{ branchId: 2 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await expect(
        service.handOver('refund-1', 'acc-1', 7, 1001),
      ).rejects.toThrow(ForbiddenException);
    });

    it('tells the student once, after the commit, with ids only', async () => {
      const order: string[] = [];
      tx.refund.update.mockImplementation(({ data }: any) => {
        order.push('write');
        return Promise.resolve({ ...requested, dueDate: null, ...data });
      });
      events.emit.mockImplementation(() => order.push('emit'));

      await service.handOver('refund-1', 'acc-1', 7, 1001);

      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('refund.handed-over', {
        refundId: 'refund-1',
        studentId: 10001,
        companyId: 1001,
        performedById: 7,
      });
      expect(order).toEqual(['write', 'emit']);
    });

    it('a refused or failed hand-over emits nothing', async () => {
      prisma.cashAccount.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.handOver('refund-1', 'acc-9', 7, 1001),
      ).rejects.toThrow(BadRequestException);

      tx.refund.findFirst.mockResolvedValueOnce({
        ...requested,
        status: RefundStatus.COMPLETED,
      });
      await expect(
        service.handOver('refund-1', 'acc-1', 7, 1001),
      ).rejects.toThrow(ConflictException);

      cash.recordOutflow.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.handOver('refund-1', 'acc-1', 7, 1001),
      ).rejects.toThrow('boom');

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('gives the money and the lessons back and marks the request REJECTED', async () => {
      tx.transaction.findFirst
        .mockResolvedValueOnce({ id: 'tx-refund' })
        .mockResolvedValueOnce({
          id: 'tx-release',
          metadata: { refundId: 'refund-1', lessonsReleased: 2 },
        });

      await service.cancel('refund-1', 'Fikridan qaytdi', 7, 1001);

      expect(transactionsService.reverseTransaction).toHaveBeenNthCalledWith(
        1,
        'tx-refund',
        { performedById: 7, reason: 'Fikridan qaytdi' },
        tx,
      );
      expect(transactionsService.reverseTransaction).toHaveBeenNthCalledWith(
        2,
        'tx-release',
        { performedById: 7, reason: 'Fikridan qaytdi' },
        tx,
      );
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enr-1' },
        data: { prepaidLessonsRemaining: { increment: 2 } },
      });
      expect(tx.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: {
          status: 'REJECTED',
          cancelledAt: expect.any(Date),
          cancelledById: 7,
          cancelReason: 'Fikridan qaytdi',
        },
      });
      expect(history.recordStatusChange.mock.calls[0][0].newValues).toEqual({
        status: 'PUL_QAYTARISH_BEKOR_QILINDI',
        summa: 120_000,
        qaytgan_darslar: 2,
        sabab: 'Fikridan qaytdi',
      });
    });

    it('only an open request can be cancelled', async () => {
      tx.refund.findFirst.mockResolvedValue({
        ...requested,
        status: RefundStatus.REJECTED,
      });
      await expect(service.cancel('refund-1', 'x', 7, 1001)).rejects.toThrow(
        ConflictException,
      );
      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
    });

    it('tells the student once, after the commit, with ids only', async () => {
      tx.transaction.findFirst
        .mockResolvedValueOnce({ id: 'tx-refund' })
        .mockResolvedValueOnce(null);
      const order: string[] = [];
      tx.refund.update.mockImplementation(({ data }: any) => {
        order.push('write');
        return Promise.resolve({ ...requested, dueDate: null, ...data });
      });
      events.emit.mockImplementation(() => order.push('emit'));

      await service.cancel('refund-1', 'Fikridan qaytdi', 7, 1001);

      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('refund.cancelled', {
        refundId: 'refund-1',
        studentId: 10001,
        companyId: 1001,
        performedById: 7,
      });
      expect(order).toEqual(['write', 'emit']);
    });

    it('a refused or failed cancel emits nothing', async () => {
      tx.refund.findFirst.mockResolvedValueOnce({
        ...requested,
        status: RefundStatus.REJECTED,
      });
      await expect(service.cancel('refund-1', 'x', 7, 1001)).rejects.toThrow(
        ConflictException,
      );

      tx.transaction.findFirst.mockResolvedValueOnce({ id: 'tx-refund' });
      transactionsService.reverseTransaction.mockRejectedValueOnce(
        new Error('boom'),
      );
      await expect(service.cancel('refund-1', 'x', 7, 1001)).rejects.toThrow(
        'boom',
      );

      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});

/**
 * Reversing a COMPLETED refund that cancelled prepaid lessons: the payout is
 * only half of what it did, so the release adjustment and the lessons come
 * back too.
 */
describe('RefundsProcessService.reverse — cancelled lessons', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let transactionsService: any;
  let txClient: any;

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(CEO) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      refund: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'refund-1',
          studentId: 10001,
          contractId: null,
          enrollmentId: 'enr-1',
          approvedAmount: 100_000,
          status: RefundStatus.COMPLETED,
        }),
      },
      transaction: { findFirst: jest.fn() },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((fn) => fn(txClient)),
    };
    // The lookups run inside the transaction now (shared with cancel).
    txClient = {
      contract: { update: jest.fn() },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
      transaction: prisma.transaction,
    };
    transactionsService = {
      reverseTransaction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        {
          provide: CashMovementsService,
          useValue: { recordOutflow: jest.fn() },
        },
        {
          provide: EntityHistoryService,
          useValue: { recordStatusChange: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(RefundsProcessService);
  });

  it('reverses the release adjustment and puts the lessons back', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce({
        id: 'tx-release',
        metadata: { refundId: 'refund-1', lessonsReleased: 3 },
      });

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
      'tx-release',
      expect.anything(),
      txClient,
    );
    expect(txClient.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { prepaidLessonsRemaining: { increment: 3 } },
    });
  });

  it('reverses only the payout when no lessons were cancelled', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce(null);

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledTimes(1);
    expect(txClient.enrollment.update).not.toHaveBeenCalled();
  });

  it('looks the release up by the refund it was tagged with', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce(null);

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(prisma.transaction.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'ADJUSTMENT',
          metadata: { path: ['refundId'], equals: 'refund-1' },
        }),
      }),
    );
  });

  it('refuses a refund that is not COMPLETED (a request is cancelled, not reversed)', async () => {
    prisma.refund.findFirst.mockResolvedValueOnce({
      id: 'refund-1',
      studentId: 10001,
      contractId: null,
      enrollmentId: null,
      approvedAmount: 100_000,
      status: RefundStatus.REQUESTED,
    });
    await expect(
      service.reverse('refund-1', { performedById: 99, companyId: 1001 }),
    ).rejects.toThrow(BadRequestException);
  });
});
