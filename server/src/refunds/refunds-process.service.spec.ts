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
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
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
