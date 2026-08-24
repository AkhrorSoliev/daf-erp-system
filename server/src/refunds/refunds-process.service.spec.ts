import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RefundStatus } from '@prisma/client';
import { RefundsProcessService } from './refunds-process.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Covers the approved-amount bound on completion: F-16 (never pay out more than
 * requested) and F-6 (never "complete" a 0-amount refund).
 */
describe('RefundsProcessService — completion bound', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let transactionsService: any;

  const baseRefund = {
    id: 'refund-1',
    studentId: 10001,
    contractId: null,
    requestedAmount: 100000,
    status: RefundStatus.APPROVED,
    companyId: 1001,
  };

  beforeEach(async () => {
    prisma = {
      // The financial-write guard reads the acting user's roles/branches.
      // A CEO spans every branch, so the default caller passes.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      refund: {
        findFirst: jest.fn().mockResolvedValue({ ...baseRefund }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn) =>
        fn({
          refund: { update: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
          contract: { update: jest.fn() },
        }),
      ),
    };
    transactionsService = { recordRefund: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = module.get(RefundsProcessService);
  });

  const complete = (approvedAmount?: number) =>
    service.process(
      'refund-1',
      { status: RefundStatus.COMPLETED, approvedAmount } as any,
      7,
      1001,
    );

  it('completes a refund within the requested bound', async () => {
    await complete(80000);
    expect(transactionsService.recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 80000 }),
      expect.anything(),
    );
  });

  it('F-6: rejects a 0-amount completion (requestedAmount = 0)', async () => {
    prisma.refund.findFirst.mockResolvedValue({
      ...baseRefund,
      requestedAmount: 0,
    });
    await expect(complete()).rejects.toThrow(BadRequestException);
    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
  });

  it('F-16: rejects an approval greater than the requested amount', async () => {
    await expect(complete(150000)).rejects.toThrow(BadRequestException);
    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
  });
});

/**
 * Reversing a refund that cancelled prepaid lessons.
 *
 * The payout is only half of what such a refund did: it also cancelled lessons
 * and credited their money. Walking back the REFUND row alone leaves that
 * credit standing and the lessons cancelled — the student keeps money they were
 * handed AND loses the lessons it came from.
 */
describe('RefundsProcessService.reverse — cancelled lessons', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let transactionsService: any;
  let txClient: any;

  beforeEach(async () => {
    txClient = {
      contract: { update: jest.fn() },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
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
    transactionsService = {
      reverseTransaction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
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
});
