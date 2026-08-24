import { Test, TestingModule } from '@nestjs/testing';
import { ReportsCashFlowService } from './reports-cash-flow.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsCashFlowService', () => {
  let service: ReportsCashFlowService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            name: 'Kassa',
            type: 'CASH',
            branchId: null,
            balance: 800_000,
          },
          {
            id: 'b',
            name: 'Bank',
            type: 'BANK',
            branchId: null,
            balance: 200_000,
          },
        ]),
      },
      cashMovement: {
        // first aggregate call = movements after period end; second = in period
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 100_000 } })
          .mockResolvedValueOnce({ _sum: { amount: 500_000 } }),
        groupBy: jest.fn().mockResolvedValue([
          { type: 'INFLOW', _sum: { amount: 700_000 }, _count: 7 },
          { type: 'OUTFLOW', _sum: { amount: -200_000 }, _count: 4 },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsCashFlowService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportsCashFlowService);
  });

  it('reconstructs opening/closing balances from the ledger', async () => {
    const cf = await service.getCashFlow(1, {
      branchIds: null,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    // currentTotal 1,000,000 − afterEnd 100,000 = closing 900,000
    expect(cf.closingBalance).toBe(900_000);
    // closing 900,000 − inPeriod 500,000 = opening 400,000
    expect(cf.openingBalance).toBe(400_000);
    expect(cf.netCashFlow).toBe(500_000);
    expect(cf.inflows.operating).toBe(700_000);
    expect(cf.outflows.operating).toBe(-200_000);
    expect(cf.accounts).toHaveLength(2);
    // opening + net == closing (internal consistency)
    expect(cf.openingBalance + cf.netCashFlow).toBe(cf.closingBalance);
  });
});
