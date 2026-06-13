import { Test, TestingModule } from '@nestjs/testing';
import { ReportsProfitLossService } from './reports-profit-loss.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsProfitLossService', () => {
  let service: ReportsProfitLossService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      payment: {
        groupBy: jest.fn().mockResolvedValue([
          { revenueType: 'TUITION', _sum: { amount: 1_000_000 }, _count: 5 },
          {
            revenueType: 'REGISTRATION_FEE',
            _sum: { amount: 200_000 },
            _count: 2,
          },
        ]),
      },
      expense: {
        groupBy: jest.fn().mockResolvedValue([
          { category: 'RENT', _sum: { amount: 300_000 } },
          { category: 'TEACHER_ADVANCE', _sum: { amount: 50_000 } },
          { category: 'MARKETING', _sum: { amount: 100_000 } },
        ]),
      },
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 400_000, _count: { accruals: 10 } }, // teacher
          { amount: 150_000, _count: { accruals: 0 } }, // admin (fixed)
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsProfitLossService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportsProfitLossService);
  });

  it('builds a correct P&L with teacher/admin salary split and COGS', async () => {
    const pl = await service.getProfitLoss(1, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(pl.revenue.total).toBe(1_200_000);
    expect(pl.revenue.byType[0]).toEqual({
      type: 'TUITION',
      amount: 1_000_000,
      count: 5,
    });

    // COGS = teacher salaries (400k) + teacher advances (50k)
    expect(pl.costOfServices).toEqual({
      teacherSalaries: 400_000,
      teacherAdvances: 50_000,
      total: 450_000,
    });
    expect(pl.grossProfit).toBe(750_000);

    // Operating = RENT 300k + MARKETING 100k + admin salary 150k = 550k
    // (TEACHER_ADVANCE excluded — it is COGS)
    expect(pl.operatingExpenses.adminSalaries).toBe(150_000);
    expect(pl.operatingExpenses.total).toBe(550_000);
    expect(
      pl.operatingExpenses.byCategory.find((c) => c.category === 'TEACHER_ADVANCE'),
    ).toBeUndefined();

    expect(pl.netProfit).toBe(200_000);
    expect(pl.margins.grossMarginPercent).toBe(63);
    expect(pl.margins.netMarginPercent).toBe(17);
  });

  it('defaults revenueType null to TUITION', async () => {
    prisma.payment.groupBy.mockResolvedValue([
      { revenueType: null, _sum: { amount: 500_000 }, _count: 3 },
    ]);
    prisma.expense.groupBy.mockResolvedValue([]);
    prisma.salaryPayment.findMany.mockResolvedValue([]);

    const pl = await service.getProfitLoss(1, {});
    expect(pl.revenue.byType[0].type).toBe('TUITION');
    expect(pl.netProfit).toBe(500_000);
  });
});
