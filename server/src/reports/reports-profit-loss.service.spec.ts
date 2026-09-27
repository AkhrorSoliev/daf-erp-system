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
          // teacher
          {
            amount: 400_000,
            _count: { accruals: 10 },
            user: { salaryConfigs: [], roles: [{ roleId: 3 }] },
          },
          // admin on a fixed monthly rate
          {
            amount: 150_000,
            _count: { accruals: 0 },
            user: { salaryConfigs: [{ id: 'cfg' }], roles: [] },
          },
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
      branchIds: null,
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
      pl.operatingExpenses.byCategory.find(
        (c) => c.category === 'TEACHER_ADVANCE',
      ),
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

    const pl = await service.getProfitLoss(1, { branchIds: null });
    expect(pl.revenue.byType[0].type).toBe('TUITION');
    expect(pl.netProfit).toBe(500_000);
  });

  describe('teacher vs staff pay is decided by the payee', () => {
    const only = (row: any) =>
      prisma.salaryPayment.findMany.mockResolvedValue([row]);

    // May 2026 was entered from the CEO's spreadsheet: no accruals behind it.
    // Counted as staff pay, it fed June's net-profit fallback and wiped the
    // whole May payroll off June's profit.
    it('keeps an accrual-less payout of a teacher on the teacher side', async () => {
      only({
        amount: 400_000,
        _count: { accruals: 0 },
        user: { salaryConfigs: [], roles: [{ roleId: 3 }] },
      });

      const pl = await service.getProfitLoss(1, { branchIds: null });
      expect(pl.costOfServices.teacherSalaries).toBe(400_000);
      expect(pl.operatingExpenses.adminSalaries).toBe(0);
    });

    it('counts a fixed-monthly payout of a non-teacher as staff pay', async () => {
      only({
        amount: 150_000,
        _count: { accruals: 0 },
        user: { salaryConfigs: [{ id: 'cfg' }], roles: [] },
      });

      const pl = await service.getProfitLoss(1, { branchIds: null });
      expect(pl.operatingExpenses.adminSalaries).toBe(150_000);
      expect(pl.costOfServices.teacherSalaries).toBe(0);
    });

    it('keeps a fixed-monthly TEACHER on the teacher side', async () => {
      only({
        amount: 150_000,
        _count: { accruals: 0 },
        user: { salaryConfigs: [{ id: 'cfg' }], roles: [{ roleId: 3 }] },
      });

      const pl = await service.getProfitLoss(1, { branchIds: null });
      expect(pl.costOfServices.teacherSalaries).toBe(150_000);
      expect(pl.operatingExpenses.adminSalaries).toBe(0);
    });

    it('asks Prisma for the payee rate and Teacher role alongside the accrual count', async () => {
      only({
        amount: 1,
        _count: { accruals: 1 },
        user: { salaryConfigs: [], roles: [] },
      });

      await service.getProfitLoss(1, { branchIds: null });
      expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            user: {
              select: {
                salaryConfigs: {
                  where: { salaryType: 'FIXED_MONTHLY', groupId: null },
                  select: { id: true },
                  take: 1,
                },
                roles: {
                  where: { role: { name: 'Teacher' } },
                  select: { roleId: true },
                  take: 1,
                },
              },
            },
          }),
        }),
      );
    });
  });
});
