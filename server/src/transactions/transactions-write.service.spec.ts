import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsWriteService } from './transactions-write.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';

/**
 * Branch stamping on the ledger.
 *
 * Every Transaction row goes through this service, so it is the one place that
 * can guarantee a branch is attached. A `branchId = null` row is invisible to
 * every per-branch report and cannot be re-attributed later — which is exactly
 * how ~8 900 of them accumulated before this.
 */
describe('TransactionsWriteService — branch stamping', () => {
  let service: TransactionsWriteService;
  let prisma: any;
  let cash: any;

  const COMPANY = 1001;
  const STUDENT = 10500;

  beforeEach(async () => {
    prisma = {
      // runInTx opens its own transaction when the caller passes none; hand the
      // callback the same mock client so assertions see every write.
      $transaction: jest.fn((cb: any) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: STUDENT, balance: 100_000 }]),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      student: { update: jest.fn() },
      user: { update: jest.fn(), findUnique: jest.fn() },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 2 }) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    cash = { recordInflow: jest.fn(), recordOutflow: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: cash },
      ],
    }).compile();

    service = module.get(TransactionsWriteService);
  });

  const createdData = () => prisma.transaction.create.mock.calls[0][0].data;

  describe('recordPayment', () => {
    it("resolves the student's branch when the caller omits it", async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
    });

    it('routes the cash inflow to that same branch kassa', async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        companyId: COMPANY,
      });

      expect(cash.recordInflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });

    it('honours an explicit branchId over the lookup', async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        branchId: 1,
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 1 }));
      expect(prisma.studentBranch.findFirst).not.toHaveBeenCalled();
    });

    it('refuses to write rather than posting a branch-less row', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue(null);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.recordPayment({
          studentId: STUDENT,
          amount: 400_000,
          paymentId: 'p-1',
          companyId: COMPANY,
        }),
      ).rejects.toThrow(/filial aniqlanmadi/);

      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('recordRefund', () => {
    it('stamps the branch and takes the cash out of that branch kassa', async () => {
      await service.recordRefund({
        studentId: STUDENT,
        amount: 50_000,
        refundId: 'r-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });
  });

  describe('recordSalaryPayment', () => {
    it("uses the employee's own branch and pays out of that branch kassa", async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: 2, branches: [] });

      await service.recordSalaryPayment({
        userId: 10768,
        amount: 3_000_000,
        salaryPaymentId: 'sp-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });

    it('still pays a branch-less CEO instead of throwing', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: null, branches: [] });

      await service.recordSalaryPayment({
        userId: 10000,
        amount: 3_000_000,
        salaryPaymentId: 'sp-2',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: null }));
    });
  });
});

/**
 * A payout can name the drawer it left.
 *
 * `resolveAccountId` picks the branch's OLDEST CASH account. In production that
 * is an empty «Asosiy kassa», not the «Farg'ona filiali kassa» the money
 * actually came from — so a caller that knows the account has to be able to
 * say so, and the ledger row has to be able to say why it exists.
 */
describe('TransactionsWriteService.recordSalaryPayment — cash account + description', () => {
  let service: TransactionsWriteService;
  let prisma: any;
  let cashMovements: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7, balance: 5_000_000 }]),
      $transaction: jest.fn((cb: any) => cb(prisma)),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ mainBranch: 1, branches: [] }),
      },
    };
    cashMovements = { recordOutflow: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: cashMovements },
      ],
    }).compile();
    service = module.get(TransactionsWriteService);
  });

  const base = {
    userId: 7,
    amount: 1_000_000,
    salaryPaymentId: 'sp-1',
    companyId: 1,
    performedById: 99,
  };

  it('forwards an explicit cash account to the journal', async () => {
    await service.recordSalaryPayment({
      ...base,
      cashSlices: [{ cashAccountId: 'acc-42', amount: 1_000_000 }],
    });

    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({ cashAccountId: 'acc-42', amount: 1_000_000 }),
      expect.anything(),
    );
  });

  // The July payroll was handed over part cash, part card. One movement per
  // account is what lets the cash journal say that.
  it('writes one movement per account when a payout is split', async () => {
    await service.recordSalaryPayment({
      ...base,
      cashSlices: [
        { cashAccountId: 'kassa', amount: 600_000 },
        { cashAccountId: 'bank', amount: 400_000 },
      ],
    });

    expect(cashMovements.recordOutflow).toHaveBeenCalledTimes(2);
    expect(cashMovements.recordOutflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cashAccountId: 'kassa', amount: 600_000 }),
      expect.anything(),
    );
    expect(cashMovements.recordOutflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cashAccountId: 'bank', amount: 400_000 }),
      expect.anything(),
    );
    // The ledger still carries the payout as ONE row.
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('refuses slices that do not sum to the payout', async () => {
    await expect(
      service.recordSalaryPayment({
        ...base,
        cashSlices: [
          { cashAccountId: 'kassa', amount: 600_000 },
          { cashAccountId: 'bank', amount: 300_000 },
        ],
      }),
    ).rejects.toThrow(/teng emas/);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(cashMovements.recordOutflow).not.toHaveBeenCalled();
  });

  it('writes the given description onto BOTH the ledger row and the cash movement', async () => {
    await service.recordSalaryPayment({
      ...base,
      description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
        }),
      }),
    );
    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
      }),
      expect.anything(),
    );
  });

  it('keeps the old behaviour when neither is given', async () => {
    await service.recordSalaryPayment(base);

    expect(cashMovements.recordOutflow).toHaveBeenCalledTimes(1);
    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({
        cashAccountId: undefined,
        amount: 1_000_000,
        description: "Oylik to'landi",
      }),
      expect.anything(),
    );
  });
});

/**
 * Adjustment audit trail.
 *
 * A refund that cancels prepaid lessons posts an ADJUSTMENT for the money it
 * frees up, and reversing that refund has to find the same row again. There is
 * no refund FK on Transaction, so the link travels in `metadata`.
 */
describe('TransactionsWriteService.createAdjustment', () => {
  let service: TransactionsWriteService;
  let prisma: any;

  const COMPANY = 1001;
  const STUDENT = 10500;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb: any) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: STUDENT, balance: 0 }]),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      student: {
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: STUDENT }),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 2 }) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: { recordInflow: jest.fn(), recordOutflow: jest.fn() } },
      ],
    }).compile();

    service = module.get(TransactionsWriteService);
  });

  it('writes metadata onto the ADJUSTMENT row when given', async () => {
    await service.createAdjustment({
      studentId: STUDENT,
      amount: 50_000,
      description: 'test',
      companyId: COMPANY,
      metadata: { refundId: 'ref-1', lessonsReleased: 2 },
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          metadata: { refundId: 'ref-1', lessonsReleased: 2 },
        }),
      }),
    );
  });

  it('omits the field entirely when no metadata is given', async () => {
    await service.createAdjustment({
      studentId: STUDENT,
      amount: 50_000,
      description: 'test',
      companyId: COMPANY,
    });

    const data = prisma.transaction.create.mock.calls[0][0].data;
    expect('metadata' in data).toBe(false);
  });
});
