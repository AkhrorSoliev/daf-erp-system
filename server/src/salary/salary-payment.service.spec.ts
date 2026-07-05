import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaymentService } from './salary-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

describe('SalaryPaymentService.getMatrix', () => {
  let service: SalaryPaymentService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mainBranch: 1,
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: {} },
      ],
    }).compile();
    service = module.get(SalaryPaymentService);
  });

  const user = (id: number) => ({
    id,
    firstName: `T${id}`,
    lastName: '',
    roles: [{ role: { id: 4, name: 'Teacher' } }],
  });

  it('builds the inclusive month list and buckets payments by Tashkent month of periodStart', async () => {
    prisma.salaryPayment.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        userId: 7,
        amount: 1_000_000,
        status: 'CALCULATED',
        // 2026-04-30T19:00Z == 01.05 Tashkent → bucket "2026-05"
        periodStart: new Date('2026-04-30T19:00:00.000Z'),
        user: user(7),
        settledExpenses: [{ amount: 200_000 }],
      },
      {
        id: 'p2',
        userId: 7,
        amount: 2_000_000,
        status: 'PAID',
        // 2026-05-31T19:00Z == 01.06 Tashkent → bucket "2026-06"
        periodStart: new Date('2026-05-31T19:00:00.000Z'),
        user: user(7),
        settledExpenses: [],
      },
    ]);

    const res = await service.getMatrix(
      { from: '2026-05', to: '2026-06' },
      1,
      999,
    );

    expect(res.months).toEqual(['2026-05', '2026-06']);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.user.id).toBe(7);
    expect(row.cells['2026-05']).toEqual({
      amount: 1_000_000,
      grossAmount: 1_200_000, // + settled advance
      status: 'CALCULATED',
      paymentId: 'p1',
    });
    expect(row.cells['2026-06'].amount).toBe(2_000_000);
    expect(row.total).toBe(3_000_000);
    expect(res.monthlyTotals).toEqual({
      '2026-05': 1_000_000,
      '2026-06': 2_000_000,
    });
    expect(res.grandTotal).toBe(3_000_000);
  });

  it('scopes a Branch Director to their own mainBranch', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: 2,
      roles: [{ role: { name: 'Branch Director' } }],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { mainBranch: 2 } }),
      }),
    );
  });

  it('does NOT branch-scope a CEO', async () => {
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    const arg = prisma.salaryPayment.findMany.mock.calls[0][0];
    expect(arg.where.user).toBeUndefined();
  });
});
