import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  SalarySettleMonthService,
  allocateCashSlices,
} from './salary-settle-month.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';

jest.mock('./shared/resolve-monthly-scope');

const mockedScope = resolveMonthlyScope as jest.MockedFunction<
  typeof resolveMonthlyScope
>;

describe('SalarySettleMonthService', () => {
  let service: SalarySettleMonthService;
  let prisma: any;
  let transactions: any;

  // 2026-07 payroll period, Tashkent-shifted instants.
  const periodStart = new Date('2026-06-30T19:00:00.000Z');
  const periodEnd = new Date('2026-07-31T18:59:59.999Z');

  const scope = {
    month: '2026-07',
    period: { periodStart, periodEnd },
    periodStartLow: new Date('2026-06-30T19:00:00.000Z'),
    periodStartHigh: new Date('2026-07-31T19:00:00.000Z'),
    branchId: undefined,
    blocked: false,
  };

  const payment = (over: Partial<any> = {}) => ({
    id: 'sp-1',
    userId: 10010,
    amount: 1_000_000,
    status: 'CALCULATED',
    note: null,
    user: {
      firstName: 'Jamsher',
      lastName: 'Murtazoxonov',
      mainBranch: 1,
      branches: [],
    },
    ...over,
  });

  beforeEach(async () => {
    mockedScope.mockResolvedValue(scope as any);

    prisma = {
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([payment()]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'CALCULATED', note: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      cashAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'acc-1', branchId: 1, name: "Farg'ona filiali kassa" },
          ]),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, name: "Farg'ona" }]),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    transactions = {
      recordSalaryPayment: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalarySettleMonthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    service = module.get(SalarySettleMonthService);
  });

  const dto = (over: Partial<any> = {}) => ({
    month: '2026-07',
    paidAt: '2026-08-05',
    accounts: [{ branchId: 1, cashAccountId: 'acc-1', amount: 1_000_000 }],
    confirmAmount: 1_000_000,
    ...over,
  });

  describe('preview', () => {
    it('returns only unpaid rows with their total and the branches they touch', async () => {
      const res = await service.preview('2026-07', 1, 1);

      expect(res.total).toBe(1_000_000);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toMatchObject({
        paymentId: 'sp-1',
        fullName: 'Jamsher Murtazoxonov',
        branchId: 1,
        branchName: "Farg'ona",
        amount: 1_000_000,
      });
      expect(res.branches).toEqual([{ branchId: 1, branchName: "Farg'ona" }]);
    });

    it('asks Prisma only for CALCULATED and APPROVED rows in the period', async () => {
      await service.preview('2026-07', 1, 1);

      expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['CALCULATED', 'APPROVED'] },
            periodStart: {
              gte: scope.periodStartLow,
              lt: scope.periodStartHigh,
            },
          }),
        }),
      );
    });
  });

  describe('settle — refusals write nothing', () => {
    it('refuses when the retyped total does not match', async () => {
      await expect(
        service.settle(dto({ confirmAmount: 999 }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
    });

    it('refuses when there is nothing left to settle', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses a paidAt in the future', async () => {
      await expect(
        service.settle(dto({ paidAt: '2099-01-01' }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses a paidAt before the period started', async () => {
      await expect(
        service.settle(dto({ paidAt: '2026-06-01' }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses an account belonging to another branch', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'acc-1', branchId: 2, name: 'Namangan kassa' },
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses when a payee has no branch — nothing is written for anyone', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        payment(),
        payment({
          id: 'sp-2',
          userId: 10505,
          amount: 0,
          user: {
            firstName: 'Muzzammila',
            lastName: 'Sobirova',
            mainBranch: null,
            branches: [],
          },
        }),
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses when a payee branch has no account in the request', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        payment(),
        payment({
          id: 'sp-2',
          amount: 0,
          user: {
            firstName: 'X',
            lastName: 'Y',
            mainBranch: 2,
            branches: [],
          },
        }),
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });
  });

  describe('settle — the happy path', () => {
    it('records the payout against the chosen account with the chosen date', async () => {
      const res = await service.settle(dto() as any, 1, 42);

      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 10010,
          amount: 1_000_000,
          salaryPaymentId: 'sp-1',
          cashSlices: [{ cashAccountId: 'acc-1', amount: 1_000_000 }],
          performedById: 42,
          description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
        }),
        expect.anything(),
      );

      expect(prisma.salaryPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sp-1' },
          data: expect.objectContaining({
            status: 'PAID',
            paidById: 42,
            // 05.08.2026 00:00 Tashkent
            paidAt: new Date('2026-08-04T19:00:00.000Z'),
          }),
        }),
      );

      expect(res).toMatchObject({
        count: 1,
        total: 1_000_000,
        month: '2026-07',
      });
    });

    it('stamps an audit marker onto the note', async () => {
      await service.settle(dto({ note: 'Naqd berildi' }) as any, 1, 42);

      const data = prisma.salaryPayment.update.mock.calls[0][0].data;
      expect(data.note).toContain('Tashqarida berilgan oylik tasdiqlandi');
      expect(data.note).toContain('2026-08-05');
      expect(data.note).toContain('Naqd berildi');
    });

    it('skips a row another request already paid, inside the transaction', async () => {
      prisma.salaryPayment.findUnique.mockResolvedValue({
        status: 'PAID',
        note: null,
      });

      const res = await service.settle(dto() as any, 1, 42);

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(res.count).toBe(0);
    });
  });

  describe('settle — split across kassa and bank', () => {
    // The July payroll was handed over part cash, part card.
    const twoPayments = () => [
      payment({ id: 'sp-1', amount: 700_000 }),
      payment({ id: 'sp-2', userId: 10008, amount: 300_000 }),
    ];

    it('refuses a split whose parts do not add up to the branch total', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue(twoPayments());

      await expect(
        service.settle(
          dto({
            accounts: [
              { branchId: 1, cashAccountId: 'kassa', amount: 600_000 },
              { branchId: 1, cashAccountId: 'bank', amount: 300_000 },
            ],
          }) as any,
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('draws each payout from the named accounts, straddling where needed', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue(twoPayments());
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'kassa', branchId: 1, name: "Farg'ona kassa" },
        { id: 'bank', branchId: 1, name: "Farg'ona bank" },
      ]);

      await service.settle(
        dto({
          accounts: [
            { branchId: 1, cashAccountId: 'kassa', amount: 600_000 },
            { branchId: 1, cashAccountId: 'bank', amount: 400_000 },
          ],
        }) as any,
        1,
        42,
      );

      // sp-1 (700k) empties the kassa's 600k and takes 100k from the bank;
      // sp-2 (300k) takes the bank's remaining 300k.
      expect(transactions.recordSalaryPayment).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          salaryPaymentId: 'sp-1',
          cashSlices: [
            { cashAccountId: 'kassa', amount: 600_000 },
            { cashAccountId: 'bank', amount: 100_000 },
          ],
        }),
        expect.anything(),
      );
      expect(transactions.recordSalaryPayment).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          salaryPaymentId: 'sp-2',
          cashSlices: [{ cashAccountId: 'bank', amount: 300_000 }],
        }),
        expect.anything(),
      );
    });
  });

  describe('allocateCashSlices', () => {
    const rows = (...amounts: number[]) =>
      amounts.map((amount, i) => ({
        paymentId: `p${i}`,
        branchId: 1,
        amount,
      }));

    it('gives every payment one slice when a single account funds them all', () => {
      const out = allocateCashSlices(
        rows(700_000, 300_000),
        new Map([[1, [{ cashAccountId: 'kassa', amount: 1_000_000 }]]]),
      );

      expect(out.get('p0')).toEqual([
        { cashAccountId: 'kassa', amount: 700_000 },
      ]);
      expect(out.get('p1')).toEqual([
        { cashAccountId: 'kassa', amount: 300_000 },
      ]);
    });

    it('keeps each account total exactly as stated, whatever the straddle', () => {
      const out = allocateCashSlices(
        rows(500_000, 400_000, 100_000),
        new Map([
          [
            1,
            [
              { cashAccountId: 'kassa', amount: 250_000 },
              { cashAccountId: 'bank', amount: 750_000 },
            ],
          ],
        ]),
      );

      const perAccount = new Map<string, number>();
      for (const slices of out.values()) {
        for (const s of slices) {
          perAccount.set(
            s.cashAccountId,
            (perAccount.get(s.cashAccountId) ?? 0) + s.amount,
          );
        }
      }
      expect(perAccount.get('kassa')).toBe(250_000);
      expect(perAccount.get('bank')).toBe(750_000);

      // And every payment is fully funded — no shortfall, no overdraw.
      for (const [id, slices] of out) {
        const row = rows(500_000, 400_000, 100_000).find(
          (r) => r.paymentId === id,
        )!;
        expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(row.amount);
      }
    });

    it('skips a branch with no accounts rather than inventing one', () => {
      const out = allocateCashSlices(
        [{ paymentId: 'p0', branchId: 2, amount: 100 }],
        new Map([[1, [{ cashAccountId: 'kassa', amount: 100 }]]]),
      );
      expect(out.size).toBe(0);
    });
  });
});
