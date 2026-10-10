import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaymentService } from './salary-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SETTLE_TX } from './salary-settle-core';
import { parseTashkentDateStart } from './shared/resolve-current-period';
import { SALARY_PAID_EVENT } from './salary-events';
import { PayPaymentDto } from './dto/pay-payment.dto';

const ACC_CASH = '11111111-1111-4111-8111-111111111111';
const ACC_CARD = '22222222-2222-4222-8222-222222222222';

/** A body that is valid for a 1 000 000 so'm payment of a branch-1 payee. */
const payDto = (over: Partial<PayPaymentDto> = {}): PayPaymentDto => ({
  paidAt: '2026-10-05',
  cashSlices: [{ cashAccountId: ACC_CASH, amount: 1_000_000 }],
  ...over,
});

describe('SalaryPaymentService.getMatrix', () => {
  let service: SalaryPaymentService;
  let prisma: any;
  let transactions: { recordSalaryPayment: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    transactions = { recordSalaryPayment: jest.fn().mockResolvedValue({}) };
    events = { emit: jest.fn() };
    prisma = {
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: ACC_CASH, branchId: 1 }]),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mainBranch: 1,
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
        { provide: EventEmitter2, useValue: events },
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

  /**
   * Paying a single salary had NO branch check, while batchPay confined the
   * caller — so the same director could settle another branch's teacher just
   * by passing its id. Both paths must also fail CLOSED when the caller's own
   * branch is unknown.
   */
  describe('branch confinement on payout', () => {
    const CALCULATED = {
      id: 'sp-1',
      userId: 555,
      amount: 1_000_000,
      status: 'APPROVED',
      companyId: 1,
      periodStart: new Date('2026-08-31T19:00:00.000Z'),
    };

    it("refuses to pay another branch's employee", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          mainBranch: 1,
          branches: [],
          roles: [{ role: { name: 'Branch Director' } }],
        }) // caller
        .mockResolvedValueOnce({ mainBranch: 2 }); // payee
      prisma.salaryPayment.findFirst.mockResolvedValue(CALCULATED);

      await expect(
        service.payPayment('sp-1', payDto(), 10012, 1),
      ).rejects.toThrow(/filialingizga tegishli emas/);
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
    });

    it('refuses to pay at all when the caller has no branch (fail closed)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      prisma.salaryPayment.findFirst.mockResolvedValue(CALCULATED);

      await expect(
        service.payPayment('sp-1', payDto(), 10012, 1),
      ).rejects.toThrow(/filialingizga tegishli emas/);
    });

    /**
     * A2.8 lets a director attached to two branches SEE the second branch's
     * payroll. Paying is a separate decision and stays on the home branch, the
     * same as `batchPay` and the payments list.
     */
    describe('a director attached to two branches (A2.8)', () => {
      const TWO_BRANCHES = [{ branchId: 1 }, { branchId: 2 }];

      it("still pays an employee of the caller's home branch", async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({
            mainBranch: 1,
            branches: TWO_BRANCHES,
            roles: [{ role: { name: 'Branch Director' } }],
          }) // caller
          .mockResolvedValueOnce({ mainBranch: 1, telegramChatId: null }); // payee
        prisma.salaryPayment.findFirst.mockResolvedValue(CALCULATED);

        await service.payPayment('sp-1', payDto(), 10012, 1);

        expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 555, amount: 1_000_000 }),
          prisma,
        );
        expect(prisma.salaryPayment.update).toHaveBeenCalled();
      });

      it('does not pay an employee of the second branch, though its payroll is visible', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({
            mainBranch: 1,
            branches: TWO_BRANCHES,
            roles: [{ role: { name: 'Branch Director' } }],
          })
          .mockResolvedValueOnce({ mainBranch: 2 });
        prisma.salaryPayment.findFirst.mockResolvedValue(CALCULATED);

        await expect(
          service.payPayment('sp-1', payDto(), 10012, 1),
        ).rejects.toThrow(/filialingizga tegishli emas/);
        expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
        expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
      });

      it('pays nothing when attached only through UserBranch — and a payee with no branch is no match', async () => {
        // No `mainBranch` on either side: `null === null` must not read as a
        // match.
        prisma.user.findUnique
          .mockResolvedValueOnce({
            mainBranch: null,
            branches: [{ branchId: 2 }],
            roles: [{ role: { name: 'Branch Director' } }],
          })
          .mockResolvedValueOnce({ mainBranch: null });
        prisma.salaryPayment.findFirst.mockResolvedValue(CALCULATED);

        await expect(
          service.payPayment('sp-1', payDto(), 10012, 1),
        ).rejects.toThrow(/filialingizga tegishli emas/);
        expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      });
    });

    it('blocks batchPay for a branch-less non-CEO caller', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        mainBranch: null,
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(
        service.batchPay({ companyId: 1 } as any, 10012),
      ).rejects.toThrow(/asosiy filialingiz belgilanmagan/);
      expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
    });
  });
});

/**
 * «Berildi» (B3 spec §5): the day the money changed hands and where it left
 * from. Every refusal comes before any write; the write is one Serializable
 * transaction; `salary.paid` goes out only after it committed.
 */
describe('SalaryPaymentService.payPayment («Berildi»)', () => {
  let service: SalaryPaymentService;
  let prisma: any;
  let transactions: { recordSalaryPayment: jest.Mock };
  let events: { emit: jest.Mock };
  let order: string[];

  const CEO = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  // September 2026 payroll: opens 00:00 Tashkent on 1 September.
  const periodStart = new Date('2026-08-31T19:00:00.000Z');
  const payment = (over: Partial<any> = {}) => ({
    id: 'sp-1',
    userId: 10001,
    amount: 7_840_000,
    status: 'APPROVED',
    companyId: 1,
    periodStart,
    ...over,
  });
  const payee = (over: Partial<any> = {}) => ({
    mainBranch: 1,
    telegramChatId: '5550001',
    ...over,
  });
  const split = (cash: number, card: number) => [
    { cashAccountId: ACC_CASH, amount: cash },
    { cashAccountId: ACC_CARD, amount: card },
  ];
  const dto = (over: Partial<PayPaymentDto> = {}): PayPaymentDto => ({
    paidAt: '2026-10-05',
    cashSlices: split(5_000_000, 2_840_000),
    ...over,
  });
  const pay = (d: PayPaymentDto = dto()) =>
    service.payPayment('sp-1', d, 10012, 1);
  const nothingWritten = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    order = [];
    transactions = { recordSalaryPayment: jest.fn().mockResolvedValue({}) };
    events = { emit: jest.fn(() => order.push('emit')) };
    prisma = {
      user: {
        // caller (CEO → no branch confinement), then the payee
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(CEO)
          .mockResolvedValueOnce(payee()),
      },
      salaryPayment: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(payment()),
        findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...payment(),
          ...data,
        })),
      },
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: ACC_CASH, branchId: 1 },
          { id: ACC_CARD, branchId: 1 },
        ]),
      },
      $transaction: jest.fn(async (cb: any) => {
        const res = await cb(prisma);
        order.push('tx');
        return res;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = module.get(SalaryPaymentService);
  });

  it('writes the payout with the chosen split and day, then emits salary.paid', async () => {
    const res = await pay(dto({ note: '  avgust uchun  ' }));

    expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
      {
        userId: 10001,
        amount: 7_840_000,
        salaryPaymentId: 'sp-1',
        companyId: 1,
        performedById: 10012,
        cashSlices: split(5_000_000, 2_840_000),
      },
      prisma,
    );
    expect(prisma.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp-1' },
      data: {
        status: 'PAID',
        paidAt: parseTashkentDateStart('2026-10-05'),
        paidById: 10012,
        note: 'avgust uchun',
      },
    });
    expect(res).toMatchObject({ status: 'PAID', notified: true });
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(SALARY_PAID_EVENT, {
      salaryPaymentId: 'sp-1',
      companyId: 1,
    });
  });

  it('runs the write in one Serializable transaction and emits only after it resolved', async () => {
    await pay();

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      SETTLE_TX,
    );
    expect(order).toEqual(['tx', 'emit']);
  });

  it('stamps no note when none (or only spaces) was typed', async () => {
    await pay(dto({ note: '   ' }));

    const data = prisma.salaryPayment.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('note');
  });

  it('answers notified: false when the payee has no bot chat — the payout still happens', async () => {
    prisma.user.findUnique
      .mockReset()
      .mockResolvedValueOnce(CEO)
      .mockResolvedValueOnce(payee({ telegramChatId: null }));

    const res = await pay();

    expect(res.notified).toBe(false);
    expect(prisma.salaryPayment.update).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('accepts a single account that carries the whole sum', async () => {
    await pay(
      dto({ cashSlices: [{ cashAccountId: ACC_CASH, amount: 7_840_000 }] }),
    );

    expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        cashSlices: [{ cashAccountId: ACC_CASH, amount: 7_840_000 }],
      }),
      prisma,
    );
  });

  describe('refusals write nothing', () => {
    it('404 for a payment that is not the company’s', async () => {
      prisma.salaryPayment.findFirst.mockResolvedValue(null);

      await expect(pay()).rejects.toThrow(NotFoundException);
      expect(prisma.salaryPayment.findFirst).toHaveBeenCalledWith({
        where: { id: 'sp-1', companyId: 1 },
      });
      nothingWritten();
    });

    it('409 «Bu oylik allaqachon berilgan» for a PAID payment', async () => {
      prisma.salaryPayment.findFirst.mockResolvedValue(
        payment({ status: 'PAID' }),
      );

      const err = await pay().catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('Bu oylik allaqachon berilgan');
      nothingWritten();
    });

    it('400 for a payment that is not approved yet (the transition rule)', async () => {
      prisma.salaryPayment.findFirst.mockResolvedValue(
        payment({ status: 'CALCULATED' }),
      );

      await expect(pay()).rejects.toThrow(BadRequestException);
      nothingWritten();
    });

    it('403 for a non-CEO payer of another branch, whatever the body says', async () => {
      prisma.user.findUnique
        .mockReset()
        .mockResolvedValueOnce({
          mainBranch: 1,
          branches: [],
          roles: [{ role: { name: 'Branch Director' } }],
        })
        .mockResolvedValueOnce(payee({ mainBranch: 2 }));

      await expect(pay()).rejects.toThrow(ForbiddenException);
      nothingWritten();
    });

    it('400 for a day in the future', async () => {
      await expect(pay(dto({ paidAt: '2099-01-01' }))).rejects.toThrow(
        "To'lov sanasi kelajakda bo'lishi mumkin emas",
      );
      nothingWritten();
    });

    it('400 for a day before the payroll period began', async () => {
      await expect(pay(dto({ paidAt: '2026-08-30' }))).rejects.toThrow(
        "To'lov sanasi hisoblash davri boshlanishidan oldin bo'lishi mumkin emas",
      );
      nothingWritten();
    });

    it.each(['2026-13-01', '2026-02-31', '2026-10-00'])(
      '400 for a day that is not on the calendar (%s)',
      async (paidAt) => {
        await expect(pay(dto({ paidAt }))).rejects.toThrow(
          "Sana noto'g'ri — kalendarda bunday kun yo'q",
        );
        nothingWritten();
      },
    );

    it('400 when the slices do not add up to the payment', async () => {
      await expect(
        pay(dto({ cashSlices: split(5_000_000, 2_000_000) })),
      ).rejects.toThrow("Naqd va karta yig'indisi oylikka teng emas");
      nothingWritten();
    });

    it('400 when a non-zero payment comes with no slices at all', async () => {
      await expect(pay(dto({ cashSlices: [] }))).rejects.toThrow(
        "Naqd va karta yig'indisi oylikka teng emas",
      );
      nothingWritten();
    });

    it("400 for an account of the payee's branch's neighbour", async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: ACC_CASH, branchId: 1 },
        { id: ACC_CARD, branchId: 2 },
      ]);

      await expect(pay()).rejects.toThrow(
        'Kassa xodim filialiga tegishli emas',
      );
      nothingWritten();
    });

    it('400 for an account that is inactive, deleted or not there (the query leaves it out)', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: ACC_CASH, branchId: 1 },
      ]);

      await expect(pay()).rejects.toThrow(
        'Kassa xodim filialiga tegishli emas',
      );
      expect(prisma.cashAccount.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [ACC_CASH, ACC_CARD] },
          companyId: 1,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, branchId: true },
      });
      nothingWritten();
    });

    it('400 for a payee with no branch — «Xodimning filiali aniqlanmagan»', async () => {
      prisma.user.findUnique
        .mockReset()
        .mockResolvedValueOnce(CEO)
        .mockResolvedValueOnce(payee({ mainBranch: null }));

      await expect(pay()).rejects.toThrow(
        "Xodimning filiali aniqlanmagan — oylikni berib bo'lmaydi",
      );
      nothingWritten();
    });

    it('checks the day before the branch, the branch before the sum, the sum before the accounts', async () => {
      const asCeo = (over: Partial<any> = {}) =>
        prisma.user.findUnique
          .mockReset()
          .mockResolvedValueOnce(CEO)
          .mockResolvedValueOnce(payee(over));

      asCeo({ mainBranch: null });
      await expect(
        pay(dto({ paidAt: '2099-01-01', cashSlices: [] })),
      ).rejects.toThrow("To'lov sanasi kelajakda");

      asCeo({ mainBranch: null });
      await expect(pay(dto({ cashSlices: [] }))).rejects.toThrow(
        'Xodimning filiali aniqlanmagan',
      );

      asCeo();
      await expect(pay(dto({ cashSlices: [] }))).rejects.toThrow(
        "Naqd va karta yig'indisi oylikka teng emas",
      );
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });
  });

  describe('a payment advances took whole (0 so’m)', () => {
    beforeEach(() => {
      prisma.salaryPayment.findFirst.mockResolvedValue(payment({ amount: 0 }));
    });

    it('turns PAID with no ledger row, no account lookup, and still emits', async () => {
      const res = await pay(dto({ cashSlices: [] }));

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            paidAt: parseTashkentDateStart('2026-10-05'),
          }),
        }),
      );
      expect(res.status).toBe('PAID');
      expect(events.emit).toHaveBeenCalledWith(SALARY_PAID_EVENT, {
        salaryPaymentId: 'sp-1',
        companyId: 1,
      });
    });

    it('refuses a slice on a 0 payment', async () => {
      await expect(
        pay(dto({ cashSlices: [{ cashAccountId: ACC_CASH, amount: 1 }] })),
      ).rejects.toThrow("Naqd va karta yig'indisi oylikka teng emas");
      nothingWritten();
    });
  });

  describe('a second click, or any other writer, got there first', () => {
    it('409 and no event when the transaction re-reads the row as PAID', async () => {
      prisma.salaryPayment.findUnique.mockResolvedValue({ status: 'PAID' });

      const err = await pay().catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('Bu oylik allaqachon berilgan');
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('400 and no money when the row was cancelled between the check and the write', async () => {
      prisma.salaryPayment.findUnique.mockResolvedValue({
        status: 'CANCELLED',
      });

      await expect(pay()).rejects.toThrow(BadRequestException);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('409 «Bir vaqtda…» when Serializable aborts the transaction, and no event', async () => {
      prisma.$transaction.mockRejectedValue({ code: 'P2034' });

      await expect(pay()).rejects.toThrow(ConflictException);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('lets any other failure of the write through untouched, and no event', async () => {
      transactions.recordSalaryPayment.mockRejectedValue(
        new Error('Kassa taqsimoti to‘lov summasiga teng emas'),
      );

      await expect(pay()).rejects.toThrow('Kassa taqsimoti');
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('batchPay keeps its own way (no client calls it)', () => {
    it('still pays an APPROVED payment with the branch’s default account and today as the day', async () => {
      prisma.user.findUnique
        .mockReset()
        .mockResolvedValueOnce(CEO) // batchPay's caller read
        .mockResolvedValueOnce(CEO) // payPayment scope
        .mockResolvedValueOnce(payee());
      prisma.salaryPayment.findMany.mockResolvedValue([
        { id: 'sp-1', userId: 10001, amount: 7_840_000 },
      ]);

      const res = await service.batchPay({ companyId: 1 }, 10012);

      expect(res).toMatchObject({ total: 1, paid: 1, failed: 0 });
      const args = transactions.recordSalaryPayment.mock.calls[0][0];
      expect(args).not.toHaveProperty('cashSlices');
      expect(prisma.salaryPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            paidAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
