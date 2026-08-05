import { Test, TestingModule } from '@nestjs/testing';
import { ReportsBalanceSheetService } from './reports-balance-sheet.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsBalanceSheetService', () => {
  let service: ReportsBalanceSheetService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      cashAccount: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 1_000_000 } }),
      },
      student: {
        // first aggregate = receivables (negative), second = deferred (positive)
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { balance: -300_000 }, _count: 5 })
          .mockResolvedValueOnce({ _sum: { balance: 150_000 }, _count: 3 }),
      },
      salaryAccrual: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 250_000 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsBalanceSheetService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportsBalanceSheetService);
  });

  it('derives assets, liabilities and equity', async () => {
    const bs = await service.getBalanceSheet(1, { branchIds: null });

    expect(bs.assets).toMatchObject({
      cash: 1_000_000,
      accountsReceivable: 300_000, // abs of -300k
      debtorCount: 5,
      total: 1_300_000,
    });
    expect(bs.liabilities).toMatchObject({
      salariesPayable: 250_000,
      deferredRevenue: 150_000,
      total: 400_000,
    });
    expect(bs.equity.retainedEarnings).toBe(900_000); // 1.3M − 400k
    expect(bs.note).toContain('GL');
  });
});
