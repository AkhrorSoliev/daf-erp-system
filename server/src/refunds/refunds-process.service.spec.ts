import { Test, TestingModule } from '@nestjs/testing';
import { RefundStatus } from '@prisma/client';
import { RefundsProcessService } from './refunds-process.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

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
