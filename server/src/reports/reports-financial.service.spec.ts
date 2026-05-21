import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFinancialService } from './reports-financial.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsFinancialService', () => {
  let service: ReportsFinancialService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      student: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: 0 }, _count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      salaryPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      salaryAccrual: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsFinancialService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ReportsFinancialService);
  });

  describe('getFinancialOverview', () => {
    const period = { startDate: '2026-05-01', endDate: '2026-05-31' };

    it('reports income.billed as the absolute value of the LESSON_DEDUCTION sum', async () => {
      // LESSON_DEDUCTION amounts are stored negative (they reduce balance).
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: -118894638 },
      });

      const result = await service.getFinancialOverview(1, period);

      expect(result.income.billed).toBe(118894638);
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            type: 'LESSON_DEDUCTION',
          }),
        }),
      );
    });

    it('returns income.billed = 0 when there are no LESSON_DEDUCTION rows', async () => {
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
      });

      const result = await service.getFinancialOverview(1, period);

      expect(result.income.billed).toBe(0);
    });

    it('scopes the billed-lessons query to the requested branch', async () => {
      await service.getFinancialOverview(1, { ...period, branchId: 42 });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 42 }),
        }),
      );
    });
  });
});
