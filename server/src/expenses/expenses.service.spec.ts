import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { ExpenseQueryDto } from './dto/expense-query.dto';

describe('ExpensesService — findAll filters + summary', () => {
  let service: ExpensesService;

  // tx client handed to the $transaction callback.
  const tx = { expense: { update: jest.fn() } };

  const prisma = {
    expense: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const transactionsService = {
    recordExpense: jest.fn(),
    reverseTransaction: jest.fn(),
  };

  const entityHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
    recordStatusChange: jest.fn(),
    recordRestore: jest.fn(),
  };

  const COMPANY_ID = 1;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default happy-path mocks so findAll resolves.
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.expense.count.mockResolvedValue(0);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.expense.groupBy.mockResolvedValue([]);
    // $transaction runs the callback with the tx client.
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(ExpensesService);
  });

  // Helper: read the `where` object passed to the list query.
  const whereArg = () => prisma.expense.findMany.mock.calls[0][0].where;

  it('always scopes to companyId + deletedAt: null', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID);
    expect(whereArg()).toMatchObject({ companyId: COMPANY_ID, deletedAt: null });
  });

  it('filters by category and paymentMethod when provided', async () => {
    await service.findAll(
      {
        category: ExpenseCategory.RENT,
        paymentMethod: ExpensePaymentMethod.CARD,
      } as ExpenseQueryDto,
      COMPANY_ID,
    );
    expect(whereArg()).toMatchObject({
      category: ExpenseCategory.RENT,
      paymentMethod: ExpensePaymentMethod.CARD,
    });
  });

  it('applies case-insensitive description search', async () => {
    await service.findAll({ search: 'ijara' } as ExpenseQueryDto, COMPANY_ID);
    expect(whereArg().description).toEqual({
      contains: 'ijara',
      mode: 'insensitive',
    });
  });

  it('builds a gte-only date filter when only startDate is given', async () => {
    await service.findAll(
      { startDate: '2026-06-01' } as ExpenseQueryDto,
      COMPANY_ID,
    );
    const date = whereArg().date;
    expect(date.gte).toEqual(new Date('2026-06-01'));
    expect(date.lte).toBeUndefined();
  });

  it('builds a lte-only date filter when only endDate is given', async () => {
    await service.findAll(
      { endDate: '2026-06-30' } as ExpenseQueryDto,
      COMPANY_ID,
    );
    const date = whereArg().date;
    expect(date.lte).toEqual(new Date('2026-06-30'));
    expect(date.gte).toBeUndefined();
  });

  it('builds a bounded date filter when both dates are given', async () => {
    await service.findAll(
      { startDate: '2026-06-01', endDate: '2026-06-30' } as ExpenseQueryDto,
      COMPANY_ID,
    );
    expect(whereArg().date).toEqual({
      gte: new Date('2026-06-01'),
      lte: new Date('2026-06-30'),
    });
  });

  it('omits the date filter entirely when neither bound is given', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID);
    expect(whereArg().date).toBeUndefined();
  });

  it('returns a summary derived from aggregate + groupBy over the full filtered set', async () => {
    prisma.expense.count.mockResolvedValue(7);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 900_000 } });
    prisma.expense.groupBy.mockResolvedValue([
      { paymentMethod: ExpensePaymentMethod.CASH, _sum: { amount: 500_000 } },
      { paymentMethod: ExpensePaymentMethod.CARD, _sum: { amount: 400_000 } },
    ]);

    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID);

    expect(res.summary).toEqual({
      totalAmount: 900_000,
      count: 7,
      cashTotal: 500_000,
      cardTotal: 400_000,
    });
    // Summary aggregation must use the SAME where as the list query.
    expect(prisma.expense.aggregate.mock.calls[0][0].where).toEqual(whereArg());
    expect(prisma.expense.groupBy.mock.calls[0][0].where).toEqual(whereArg());
  });

  it('defaults missing payment-method buckets to 0', async () => {
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.expense.groupBy.mockResolvedValue([]); // no rows at all
    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID);
    expect(res.summary.cashTotal).toBe(0);
    expect(res.summary.cardTotal).toBe(0);
    expect(res.summary.totalAmount).toBe(0);
  });

  describe('exportAll', () => {
    it('queries the same filtered set without pagination', async () => {
      prisma.expense.findMany.mockResolvedValue([{ id: 'e1' }]);
      const rows = await service.exportAll(
        {
          category: ExpenseCategory.MARKETING,
          paymentMethod: ExpensePaymentMethod.CASH,
          page: 2,
          pageSize: 10,
        } as ExpenseQueryDto,
        COMPANY_ID,
      );

      const call = prisma.expense.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({
        companyId: COMPANY_ID,
        deletedAt: null,
        category: ExpenseCategory.MARKETING,
        paymentMethod: ExpensePaymentMethod.CASH,
      });
      // No pagination applied to the export.
      expect(call.skip).toBeUndefined();
      expect(call.take).toBeUndefined();
      expect(rows).toEqual([{ id: 'e1' }]);
    });
  });

  describe('remove', () => {
    const existing = {
      id: 'exp-1',
      amount: 100,
      companyId: COMPANY_ID,
      deletedAt: null,
    };

    it('records a delete in EntityHistory inside the transaction', async () => {
      prisma.expense.findFirst.mockResolvedValue(existing);
      prisma.transaction.findFirst.mockResolvedValue(null); // no ledger entry

      await service.remove('exp-1', 42, COMPANY_ID);

      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Expense',
          entityId: 'exp-1',
          oldValues: existing,
          changedById: 42,
          companyId: COMPANY_ID,
          tx,
        }),
      );
      // soft-delete stamped within the same tx
      expect(tx.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-1' },
          data: expect.objectContaining({ deletedById: 42 }),
        }),
      );
    });

    it('reverses the linked ledger entry before deleting', async () => {
      prisma.expense.findFirst.mockResolvedValue(existing);
      prisma.transaction.findFirst.mockResolvedValue({ id: 'tx-9' });

      await service.remove('exp-1', 42, COMPANY_ID);

      expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
        'tx-9',
        expect.objectContaining({ performedById: 42 }),
        tx,
      );
      expect(entityHistoryService.recordDelete).toHaveBeenCalled();
    });

    it('throws NotFound when the expense does not exist', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 42, COMPANY_ID)).rejects.toThrow(
        'Xarajat topilmadi',
      );
      expect(entityHistoryService.recordDelete).not.toHaveBeenCalled();
    });
  });
});
