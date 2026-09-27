import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SalarySettleAllocatedService } from './salary-settle-allocated.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';

jest.mock('./shared/resolve-monthly-scope');

const mockedScope = resolveMonthlyScope as jest.MockedFunction<
  typeof resolveMonthlyScope
>;

/**
 * Closing a month from an explicit per-payment plan.
 *
 * Used for payroll handed over before the system recorded how: the CEO set the
 * split per person (teacher 50/50, staff all cash) and one month predates the
 * cash journal entirely. The plan must name exactly the month's unpaid rows,
 * and nothing may be written until every row checks out.
 */
describe('SalarySettleAllocatedService', () => {
  let service: SalarySettleAllocatedService;
  let prisma: any;
  let transactions: any;

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
    amount: 1_000_001,
    status: 'CALCULATED',
    note: null,
    user: {
      firstName: 'Teacher',
      lastName: 'One',
      mainBranch: 1,
      branches: [],
    },
    ...over,
  });
  const staff = () =>
    payment({
      id: 'sp-2',
      userId: 10738,
      amount: 3_000_000,
      user: { firstName: 'Staff', lastName: 'Two', mainBranch: null, branches: [{ branchId: 1 }] },
    });

  const teacherPlan = {
    paymentId: 'sp-1',
    cashSlices: [
      { cashAccountId: 'kassa', amount: 500_001 },
      { cashAccountId: 'bank', amount: 500_000 },
    ],
  };
  const staffPlan = {
    paymentId: 'sp-2',
    cashSlices: [{ cashAccountId: 'kassa', amount: 3_000_000 }],
  };
  const input = (over: Partial<any> = {}) => ({
    month: '2026-07',
    paidAt: '2026-08-10',
    note: 'CEO qarori',
    payments: [teacherPlan, staffPlan],
    ...over,
  });

  beforeEach(async () => {
    mockedScope.mockResolvedValue(scope as any);
    prisma = {
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([payment(), staff()]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'CALCULATED', note: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'kassa', branchId: 1, name: "Farg'ona filiali kassa" },
          { id: 'bank', branchId: 1, name: "Farg'ona filiali bank" },
        ]),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    transactions = {
      recordSalaryPayment: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalarySettleAllocatedService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    service = module.get(SalarySettleAllocatedService);
  });

  const expectNothingWritten = () => {
    expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
  };

  describe('refusals write nothing', () => {
    it('refuses a plan that leaves out one of the month rows', async () => {
      await expect(
        service.settle(input({ payments: [teacherPlan] }), 1, 42),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('refuses a plan naming a payment outside the month', async () => {
      await expect(
        service.settle(
          input({
            payments: [
              teacherPlan,
              staffPlan,
              { paymentId: 'sp-x', cashSlices: [] },
            ],
          }),
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('refuses the same payment named twice', async () => {
      await expect(
        service.settle(
          input({ payments: [teacherPlan, staffPlan, teacherPlan] }),
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    // The report floors a month before the company's start date; settling the
    // floor month instead of the one asked for would close the wrong payroll.
    it('refuses when the report moved the month', async () => {
      mockedScope.mockResolvedValue({ ...scope, month: '2026-08' } as any);

      await expect(service.settle(input(), 1, 42)).rejects.toThrow(
        BadRequestException,
      );
      expectNothingWritten();
    });

    it('refuses slices that do not add up to the payment', async () => {
      await expect(
        service.settle(
          input({
            payments: [
              {
                paymentId: 'sp-1',
                cashSlices: [{ cashAccountId: 'kassa', amount: 500_000 }],
              },
              staffPlan,
            ],
          }),
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('refuses a negative or fractional slice', async () => {
      await expect(
        service.settle(
          input({
            payments: [
              {
                paymentId: 'sp-1',
                cashSlices: [
                  { cashAccountId: 'kassa', amount: 1_500_001 },
                  { cashAccountId: 'bank', amount: -500_000 },
                ],
              },
              staffPlan,
            ],
          }),
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it("refuses an account of another branch", async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'kassa', branchId: 1, name: "Farg'ona filiali kassa" },
        { id: 'bank', branchId: 2, name: 'Namangan bank' },
      ]);

      await expect(service.settle(input(), 1, 42)).rejects.toThrow(
        BadRequestException,
      );
      expectNothingWritten();
    });

    it('refuses an account that is not active or not found', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'kassa', branchId: 1, name: "Farg'ona filiali kassa" },
      ]);

      await expect(service.settle(input(), 1, 42)).rejects.toThrow(
        BadRequestException,
      );
      expectNothingWritten();
    });

    it('refuses a paidAt in the future', async () => {
      await expect(
        service.settle(input({ paidAt: '2099-01-10' }), 1, 42),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('refuses slices together with predatesCashJournal', async () => {
      await expect(
        service.settle(
          input({
            payments: [
              { ...teacherPlan, predatesCashJournal: true },
              staffPlan,
            ],
          }),
          1,
          42,
        ),
      ).rejects.toThrow(BadRequestException);
      expectNothingWritten();
    });

    it('refuses when there is nothing left to settle', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([]);

      await expect(service.settle(input(), 1, 42)).rejects.toThrow(
        BadRequestException,
      );
      expectNothingWritten();
    });
  });

  describe('dry run', () => {
    it('returns what would leave each account and writes nothing', async () => {
      const res = await service.settle(input(), 1, 42, { dryRun: true });

      expect(res.dryRun).toBe(true);
      expect(res.count).toBe(2);
      expect(res.total).toBe(4_000_001);
      expect(res.paymentIds).toEqual([]);
      expect(res.perAccount).toEqual(
        expect.arrayContaining([
          { cashAccountId: 'kassa', amount: 3_500_001 },
          { cashAccountId: 'bank', amount: 500_000 },
        ]),
      );
      expect(res.predatesCashJournalTotal).toBe(0);
      expectNothingWritten();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('the happy path', () => {
    it("records each payment with its own slices, the chosen date and an audit note", async () => {
      const res = await service.settle(input(), 1, 42);

      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          salaryPaymentId: 'sp-1',
          amount: 1_000_001,
          cashSlices: teacherPlan.cashSlices,
          performedById: 42,
          description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
        }),
        expect.anything(),
      );
      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          salaryPaymentId: 'sp-2',
          cashSlices: staffPlan.cashSlices,
        }),
        expect.anything(),
      );

      const data = prisma.salaryPayment.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'PAID',
        paidById: 42,
        // 10.08.2026 00:00 Tashkent
        paidAt: new Date('2026-08-09T19:00:00.000Z'),
      });
      expect(data.note).toContain('Tashqarida berilgan oylik tasdiqlandi (2026-08-10)');
      expect(data.note).toContain('CEO qarori');

      expect(res).toMatchObject({ dryRun: false, count: 2, total: 4_000_001 });
      expect(res.paymentIds).toEqual(['sp-1', 'sp-2']);
    });

    it('writes a pre-journal month with the flag and no slices', async () => {
      const res = await service.settle(
        input({
          payments: [
            { paymentId: 'sp-1', predatesCashJournal: true },
            { paymentId: 'sp-2', predatesCashJournal: true },
          ],
        }),
        1,
        42,
      );

      for (const call of transactions.recordSalaryPayment.mock.calls) {
        expect(call[0]).toMatchObject({ predatesCashJournal: true });
        expect(call[0].cashSlices).toBeUndefined();
      }
      expect(res.predatesCashJournalTotal).toBe(4_000_001);
      expect(res.perAccount).toEqual([]);
      // No account lookup is needed when no account is named.
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });

    it('skips a row another request already paid, inside the transaction', async () => {
      prisma.salaryPayment.findUnique
        .mockResolvedValueOnce({ status: 'PAID', note: null })
        .mockResolvedValueOnce({ status: 'CALCULATED', note: null });

      const res = await service.settle(input(), 1, 42);

      expect(transactions.recordSalaryPayment).toHaveBeenCalledTimes(1);
      expect(res.paymentIds).toEqual(['sp-2']);
      expect(res.total).toBe(3_000_000);
    });
  });
});
