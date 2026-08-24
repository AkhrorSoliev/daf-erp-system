import { Test, TestingModule } from '@nestjs/testing';
import {
  CashMovementsService,
  cashTypeForPaymentMethod,
  cashTypeForExpenseMethod,
} from './cash-movements.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CashAccountType,
  CashMovementType,
  ExpensePaymentMethod,
  PaymentMethod,
} from '@prisma/client';

// A minimal fake transaction client. lockAccount() uses $queryRaw (SELECT FOR
// UPDATE); the rest go through the model delegates.
function makeTxClient(opts: {
  account?: { id: string; balance: number; branchId: number | null } | null;
  resolve?: { id: string } | null;
  movements?: any[];
}) {
  const created: any[] = [];
  const updates: any[] = [];
  return {
    _created: created,
    _updates: updates,
    $queryRaw: jest.fn().mockResolvedValue(opts.account ? [opts.account] : []),
    cashAccount: {
      // resolveAccountId looks up the branch account only — the company-wide
      // fallback was removed, so one findFirst is all it takes.
      findFirst: jest.fn().mockResolvedValue(opts.resolve ?? null),
      update: jest.fn().mockImplementation(({ data }) => {
        updates.push(data);
        return { ...data };
      }),
    },
    cashMovement: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { id: `mv${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      findMany: jest.fn().mockResolvedValue(opts.movements ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('CashMovementsService', () => {
  let service: CashMovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashMovementsService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    service = module.get(CashMovementsService);
  });

  describe('payment-method → account-type mapping', () => {
    it('CASH lands in the kassa', () => {
      expect(cashTypeForPaymentMethod(PaymentMethod.CASH)).toBe(
        CashAccountType.CASH,
      );
    });
    it('gateway/transfer lands in the bank', () => {
      for (const m of [
        PaymentMethod.PAYME,
        PaymentMethod.CLICK,
        PaymentMethod.UZUM,
        PaymentMethod.TRANSFER,
      ]) {
        expect(cashTypeForPaymentMethod(m)).toBe(CashAccountType.BANK);
      }
    });
    it('expense CARD → bank, CASH → kassa', () => {
      expect(cashTypeForExpenseMethod(ExpensePaymentMethod.CARD)).toBe(
        CashAccountType.BANK,
      );
      expect(cashTypeForExpenseMethod(ExpensePaymentMethod.CASH)).toBe(
        CashAccountType.CASH,
      );
    });
  });

  describe('recordInflow', () => {
    it("credits the branch's own account", async () => {
      const tx = makeTxClient({
        account: { id: 'acc1', balance: 1000, branchId: 1 },
        resolve: { id: 'acc1' },
      });

      const mv = await service.recordInflow(
        {
          companyId: 1,
          branchId: 1,
          amount: 500,
          preferType: CashAccountType.CASH,
          transactionId: 'tx1',
        },
        tx,
      );

      expect(mv).not.toBeNull();
      expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
      const row = tx._created[0];
      expect(row.type).toBe(CashMovementType.INFLOW);
      expect(row.amount).toBe(500);
      expect(row.balanceBefore).toBe(1000);
      expect(row.balanceAfter).toBe(1500);
      expect(tx._updates[0].balance).toBe(1500);
    });

    it('is a no-op when no account is configured', async () => {
      const tx = makeTxClient({ resolve: null });
      const mv = await service.recordInflow({ companyId: 1, amount: 500 }, tx);
      expect(mv).toBeNull();
      expect(tx.cashMovement.create).not.toHaveBeenCalled();
    });

    it('ignores non-positive amounts', async () => {
      const tx = makeTxClient({});
      expect(
        await service.recordInflow({ companyId: 1, amount: 0 }, tx),
      ).toBeNull();
      expect(tx.cashAccount.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('recordOutflow', () => {
    it('debits the account (negative signed amount)', async () => {
      const tx = makeTxClient({
        account: { id: 'acc1', balance: 1000, branchId: 1 },
        resolve: { id: 'acc1' },
      });

      await service.recordOutflow(
        { companyId: 1, branchId: 1, amount: 300, transactionId: 'tx2' },
        tx,
      );

      const row = tx._created[0];
      expect(row.type).toBe(CashMovementType.OUTFLOW);
      expect(row.amount).toBe(-300);
      expect(row.balanceBefore).toBe(1000);
      expect(row.balanceAfter).toBe(700);
      expect(tx._updates[0].balance).toBe(700);
    });
  });

  // Each branch carries its own cash (docs/branch-decisions.md D4). The old
  // company-wide fallback quietly absorbed branch outflows, leaving that
  // account negative and the branch's balance too high by the same amount.
  describe('missing branch account', () => {
    it('throws instead of silently skipping when a named branch has no account', async () => {
      const tx = makeTxClient({ account: null, resolve: null });

      await expect(
        service.recordOutflow({ companyId: 1, branchId: 2, amount: 300 }, tx),
      ).rejects.toThrow(/Filial #2 uchun .* kassa hisobi topilmadi/);
      expect(tx.cashMovement.create).not.toHaveBeenCalled();
    });

    it('does NOT fall back to a company-wide account', async () => {
      // A branch-less account exists, but the branch has none: the old code
      // would have booked the money here anyway.
      const tx = makeTxClient({ account: null, resolve: null });

      await expect(
        service.recordInflow({ companyId: 1, branchId: 2, amount: 500 }, tx),
      ).rejects.toThrow(/kassa hisobi topilmadi/);
    });

    it('still degrades to a warning when no branch was given at all', async () => {
      // A CEO salary spans branches and has no branch of its own — blocking
      // that payout would be worse than an unmirrored cash row.
      const tx = makeTxClient({ account: null, resolve: null });

      await expect(
        service.recordOutflow({ companyId: 1, amount: 300 }, tx),
      ).resolves.toBeNull();
      expect(tx.cashMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('reverseByTransactionId', () => {
    it('marks the original reversed and posts an inverse movement', async () => {
      const tx = makeTxClient({
        account: { id: 'acc1', balance: 700, branchId: null },
        movements: [
          {
            id: 'mvOrig',
            cashAccountId: 'acc1',
            amount: -300,
            companyId: 1,
            branchId: null,
          },
        ],
      });

      const reversals = await service.reverseByTransactionId(
        'tx2',
        { performedById: 5, reason: 'test' },
        tx,
      );

      expect(reversals).toHaveLength(1);
      // original marked reversed + reversal linked back
      expect(tx.cashMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mvOrig' } }),
      );
      const inverse = tx._created[0];
      expect(inverse.type).toBe(CashMovementType.ADJUSTMENT);
      // original was -300 → inverse is +300, restoring the balance
      expect(inverse.amount).toBe(300);
      expect(inverse.balanceAfter).toBe(1000);
    });

    it('is a no-op when the source transaction has no cash movement', async () => {
      const tx = makeTxClient({ movements: [] });
      const reversals = await service.reverseByTransactionId('txX', {}, tx);
      expect(reversals).toHaveLength(0);
      expect(tx.cashMovement.create).not.toHaveBeenCalled();
    });
  });
});
