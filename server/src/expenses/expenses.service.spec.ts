import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PermissionsService } from '../common/permissions/permissions.service';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { tashkentMonthKey } from '../common/date/tashkent';
import { expenseMonthWindow } from './expenses-month';

describe('ExpensesService — findAll filters + summary', () => {
  let service: ExpensesService;

  // tx client handed to the $transaction callback. `update` looks the original
  // ledger entry up through the SAME tx client (not `prisma`), so the stub
  // needs its own `transaction.findFirst` — `remove` is the one that reads it
  // off `prisma`.
  const tx = {
    expense: { update: jest.fn() },
    transaction: { findFirst: jest.fn() },
  };

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
    // Every expense write now verifies the named branch exists in this company
    // and that the caller may act on it (`assertBranchWritable`). A CEO spans
    // every branch, so the default caller here passes the check.
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      }),
    },
    leadSource: { findFirst: jest.fn() },
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

  // Every caller holds every key unless a test says otherwise; the
  // category rule has its own block at the end of this file.
  const permissions = { has: jest.fn() };

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
    permissions.has.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get(ExpensesService);
  });

  // Helper: read the `where` object passed to the list query.
  const whereArg = () => prisma.expense.findMany.mock.calls[0][0].where;

  it('always scopes to companyId + deletedAt: null', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg()).toMatchObject({
      companyId: COMPANY_ID,
      deletedAt: null,
    });
  });

  it('filters by category and paymentMethod when provided', async () => {
    await service.findAll(
      {
        category: [ExpenseCategory.RENT],
        paymentMethod: [ExpensePaymentMethod.CARD],
      } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg()).toMatchObject({
      category: ExpenseCategory.RENT,
      paymentMethod: ExpensePaymentMethod.CARD,
    });
  });

  it('applies case-insensitive description search', async () => {
    await service.findAll(
      { search: 'ijara' } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().description).toEqual({
      contains: 'ijara',
      mode: 'insensitive',
    });
  });

  it('builds a gte-only date filter when only startDate is given', async () => {
    await service.findAll(
      { startDate: '2026-06-01' } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    const date = whereArg().date;
    expect(date.gte).toEqual(new Date('2026-06-01'));
    expect(date.lte).toBeUndefined();
  });

  it('builds a lte-only date filter when only endDate is given', async () => {
    await service.findAll(
      { endDate: '2026-06-30' } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    const date = whereArg().date;
    expect(date.lte).toEqual(new Date('2026-06-30'));
    expect(date.gte).toBeUndefined();
  });

  it('builds a bounded date filter when both dates are given', async () => {
    await service.findAll(
      { startDate: '2026-06-01', endDate: '2026-06-30' } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().date).toEqual({
      gte: new Date('2026-06-01'),
      lte: new Date('2026-06-30'),
    });
  });

  it('defaults to the current Tashkent month when neither oy nor a range is given', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().date).toEqual(
      expenseMonthWindow(tashkentMonthKey(new Date())),
    );
  });

  it('reads ?oy= as the Tashkent month window, the next 1st exclusive', async () => {
    await service.findAll(
      { oy: '2026-09' } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().date).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lt: new Date('2026-10-01T00:00:00.000Z'),
    });
  });

  it('refuses oy together with the old range, before any read', async () => {
    await expect(
      service.findAll(
        { oy: '2026-09', startDate: '2026-09-01' } as ExpenseQueryDto,
        COMPANY_ID,
        null,
      ),
    ).rejects.toThrow("Oy yoki sana oralig'i — ikkalasi birga emas");
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-04', "Xarajatlar may 2026 dan boshlab ko'rsatiladi"],
    ['2099-01', "Kelajak oyni tanlab bo'lmaydi"],
  ])('refuses oy=%s with 400', async (oy, message) => {
    await expect(
      service.findAll({ oy } as ExpenseQueryDto, COMPANY_ID, null),
    ).rejects.toThrow(new BadRequestException(message));
  });

  it('filters «Kim kiritgan» by one author or several', async () => {
    await service.findAll(
      { createdById: [10234] } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().createdById).toBe(10234);
    prisma.expense.findMany.mockClear();
    await service.findAll(
      { createdById: [10234, 10567] } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().createdById).toEqual({ in: [10234, 10567] });
  });

  it('orders by date, then entry time, then id — newest first', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(prisma.expense.findMany.mock.calls[0][0].orderBy).toEqual([
      { date: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('gives every row its hint', async () => {
    prisma.expense.findMany.mockResolvedValue([
      { id: 'e1', category: 'OTHER', description: 'Stullar' },
      { id: 'e2', category: 'RENT', description: 'Ijara' },
    ]);
    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(res.data.map((r) => r.hint)).toEqual(['EQUIPMENT', null]);
  });

  it('returns a summary derived from the grouped scan over the full filtered set', async () => {
    prisma.expense.count.mockResolvedValue(7);
    prisma.expense.groupBy.mockResolvedValue([
      {
        category: ExpenseCategory.RENT,
        paymentMethod: ExpensePaymentMethod.CASH,
        _sum: { amount: 500_000 },
      },
      {
        category: ExpenseCategory.UTILITIES,
        paymentMethod: ExpensePaymentMethod.CARD,
        _sum: { amount: 400_000 },
      },
    ]);

    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);

    expect(res.summary).toEqual({
      totalAmount: 900_000,
      count: 7,
      cashTotal: 500_000,
      cardTotal: 400_000,
      advancesTotal: 0,
    });
    // Summary aggregation must use the SAME where as the list query, grouped by
    // both category (to split the advance) and paymentMethod.
    const call = prisma.expense.groupBy.mock.calls[0][0];
    expect(call.where).toEqual(whereArg());
    expect(call.by).toEqual(['category', 'paymentMethod']);
  });

  it('excludes TEACHER_ADVANCE from the list/summary (managed on the salary page)', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().category).toEqual({
      not: ExpenseCategory.TEACHER_ADVANCE,
    });
  });

  it('honours a non-advance category filter (still excluding advances implicitly)', async () => {
    await service.findAll(
      { category: [ExpenseCategory.MARKETING] } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().category).toEqual(ExpenseCategory.MARKETING);
  });

  it('bir nechta toifa tanlansa `in` bilan filtrlaydi', async () => {
    await service.findAll(
      {
        category: [ExpenseCategory.MARKETING, ExpenseCategory.RENT],
      } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().category).toEqual({
      in: [ExpenseCategory.MARKETING, ExpenseCategory.RENT],
    });
  });

  it("tanlovdan avansni olib tashlaydi va qolganini qo'llaydi", async () => {
    await service.findAll(
      {
        category: [ExpenseCategory.TEACHER_ADVANCE, ExpenseCategory.RENT],
      } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().category).toEqual(ExpenseCategory.RENT);
  });

  it('faqat avans tanlansa avansni chiqarib tashlash shartiga qaytadi', async () => {
    await service.findAll(
      { category: [ExpenseCategory.TEACHER_ADVANCE] } as ExpenseQueryDto,
      COMPANY_ID,
      null,
    );
    expect(whereArg().category).toEqual({
      not: ExpenseCategory.TEACHER_ADVANCE,
    });
  });

  it('defaults missing payment-method buckets to 0', async () => {
    prisma.expense.groupBy.mockResolvedValue([]); // no rows at all
    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(res.summary.cashTotal).toBe(0);
    expect(res.summary.cardTotal).toBe(0);
    expect(res.summary.totalAmount).toBe(0);
    expect(res.summary.advancesTotal).toBe(0);
  });

  describe('exportAll', () => {
    it('queries the same filtered set without pagination', async () => {
      prisma.expense.findMany.mockResolvedValue([{ id: 'e1' }]);
      const rows = await service.exportAll(
        {
          category: [ExpenseCategory.MARKETING],
          paymentMethod: [ExpensePaymentMethod.CASH],
          page: 2,
          pageSize: 10,
        } as ExpenseQueryDto,
        COMPANY_ID,
        null,
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
      expect(call.orderBy).toEqual([
        { date: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
      expect(rows).toEqual([{ id: 'e1' }]);
    });
  });

  describe('branch ownership on writes', () => {
    // `dto.branchId` was written onto the Expense row AND its ledger entry with
    // no validation at all — no existence check, no company check, no caller
    // check. Since D4 makes every expense exactly one branch's cost, a wrong
    // branch here is two wrong P&Ls, not a labelling slip.
    const dto = {
      category: 'RENT',
      paymentMethod: 'CASH',
      amount: 100,
      description: 'x',
      date: '2026-08-01',
      branchId: 2,
    } as any;

    it('rejects a branch that does not exist in this company', async () => {
      prisma.branch.findFirst.mockResolvedValueOnce(null);

      await expect(service.create(dto, 42, COMPANY_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a branch outside the caller's scope", async () => {
      prisma.branch.findFirst.mockResolvedValueOnce({ id: 2 });
      // A Fargona (branch 1) director booking a cost against Namangan (2).
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(service.create(dto, 42, COMPANY_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('checks BOTH the current and the target branch on a move', async () => {
      // Checking only the target would let someone reach into the other
      // branch's books to move a cost OUT of them.
      prisma.expense.findFirst.mockResolvedValue({
        id: 'exp-1',
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
      });
      prisma.branch.findFirst.mockResolvedValue({ id: 1 });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.update('exp-1', { branchId: 2 } as any, 42, COMPANY_ID);

      const checked = prisma.branch.findFirst.mock.calls.map(
        (c: any) => c[0].where.id,
      );
      expect(checked).toContain(1);
      expect(checked).toContain(2);
    });
  });

  describe('marketing channel (ADR-0109)', () => {
    const SOURCE = '0b0c7c1e-6a1c-4f7e-9d0a-3f5b2f1c9a11';
    const dto = (over: object = {}) =>
      ({
        category: 'MARKETING',
        paymentMethod: 'CASH',
        amount: 100,
        description: 'Instagram reklama',
        date: '2026-10-01',
        branchId: 1,
        ...over,
      }) as any;

    beforeEach(() => {
      prisma.expense.create.mockResolvedValue({
        id: 'exp-1',
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
      });
      (tx as any).expense.create = prisma.expense.create;
    });

    it('saves the channel on a MARKETING expense', async () => {
      prisma.leadSource.findFirst.mockResolvedValueOnce({ id: SOURCE });

      await service.create(dto({ leadSourceId: SOURCE }), 42, COMPANY_ID);

      expect(prisma.leadSource.findFirst).toHaveBeenCalledWith({
        where: { id: SOURCE, companyId: COMPANY_ID, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.expense.create.mock.calls[0][0].data.leadSourceId).toBe(
        SOURCE,
      );
    });

    it('saves no channel when none is given', async () => {
      await service.create(dto(), 42, COMPANY_ID);

      expect(prisma.leadSource.findFirst).not.toHaveBeenCalled();
      expect(
        prisma.expense.create.mock.calls[0][0].data.leadSourceId,
      ).toBeNull();
    });

    it('refuses a channel on any other category, before writing', async () => {
      await expect(
        service.create(
          dto({ category: 'RENT', leadSourceId: SOURCE }),
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow('faqat marketing xarajatiga');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a source that is not this company’s live source', async () => {
      prisma.leadSource.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.create(dto({ leadSourceId: SOURCE }), 42, COMPANY_ID),
      ).rejects.toThrow('Manba topilmadi');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    describe('update', () => {
      const existing = (over: object = {}) => ({
        id: 'exp-1',
        category: 'MARKETING',
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        leadSourceId: SOURCE,
        ...over,
      });
      const dataOfUpdate = () => tx.expense.update.mock.calls[0][0].data;

      it('clears the channel when the form sends null', async () => {
        prisma.expense.findFirst.mockResolvedValue(existing());

        await service.update(
          'exp-1',
          { leadSourceId: null } as any,
          42,
          COMPANY_ID,
        );

        expect(dataOfUpdate().leadSourceId).toBeNull();
      });

      it('leaves the channel alone when the field is not sent', async () => {
        prisma.expense.findFirst.mockResolvedValue(existing());

        await service.update('exp-1', { amount: 100 } as any, 42, COMPANY_ID);

        expect(dataOfUpdate()).not.toHaveProperty('leadSourceId');
      });

      it('drops the channel when the row stops being MARKETING', async () => {
        prisma.expense.findFirst.mockResolvedValue(existing());
        // A category change re-posts the ledger entry from the updated row.
        tx.expense.update.mockResolvedValueOnce(
          existing({ category: 'OTHER', leadSourceId: null }),
        );

        await service.update(
          'exp-1',
          { category: 'OTHER' } as any,
          42,
          COMPANY_ID,
        );

        expect(dataOfUpdate().leadSourceId).toBeNull();
      });

      it('refuses a channel given together with a non-MARKETING category', async () => {
        prisma.expense.findFirst.mockResolvedValue(existing());

        await expect(
          service.update(
            'exp-1',
            { category: 'OTHER', leadSourceId: SOURCE } as any,
            42,
            COMPANY_ID,
          ),
        ).rejects.toThrow('faqat marketing xarajatiga');
      });
    });
  });

  describe('remove', () => {
    const existing = {
      id: 'exp-1',
      amount: 100,
      branchId: 1,
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

  /**
   * Avans (TEACHER_ADVANCE) oddiy xarajatdan ikki narsa bilan farq qiladi:
   * u xodimga bog'langan va u keyingi oylikdan ushlab qolinadi. Ushlab
   * qolingandan keyin uning summasini o'zgartirish yoki o'chirish
   * SalaryPayment'ni eski raqam bo'yicha kamaytirilgan holda qoldiradi —
   * oylik varaqasi bilan haqiqat farq qila boshlaydi.
   */
  describe('avans qorovullari', () => {
    const openAdvance = {
      id: 'adv-open',
      category: ExpenseCategory.TEACHER_ADVANCE,
      amount: 500_000,
      branchId: 1,
      companyId: COMPANY_ID,
      deletedAt: null,
      relatedUserId: 10005,
      settledBySalaryPaymentId: null,
    };

    const settledAdvance = {
      ...openAdvance,
      id: 'adv-settled',
      settledBySalaryPaymentId: 'sp-1',
    };

    it('oylikka hisoblangan avansni tahrirlashni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(settledAdvance);

      await expect(
        service.update(
          'adv-settled',
          { amount: 600_000 } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("oylikka hisoblangan avansni o'chirishni rad etadi", async () => {
      prisma.expense.findFirst.mockResolvedValue(settledAdvance);

      await expect(
        service.remove('adv-settled', 42, COMPANY_ID),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hisoblanmagan avans summasini tuzatadi va daftarni qayta yozadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);
      tx.transaction.findFirst.mockResolvedValue({ id: 'tx-7' });
      tx.expense.update.mockResolvedValue({
        ...openAdvance,
        amount: 600_000,
        description: 'Avans',
        paymentMethod: ExpensePaymentMethod.CASH,
      });

      await service.update(
        'adv-open',
        { amount: 600_000 } as any,
        42,
        COMPANY_ID,
      );

      expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
        'tx-7',
        expect.objectContaining({ performedById: 42 }),
        tx,
      );
      expect(transactionsService.recordExpense).toHaveBeenCalledWith(
        expect.objectContaining({ expenseId: 'adv-open', amount: 600_000 }),
        tx,
      );
    });

    it('faqat sana tuzatilsa daftarga tegmaydi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);
      tx.expense.update.mockResolvedValue({ ...openAdvance });

      await service.update(
        'adv-open',
        { date: '2026-09-15' } as any,
        42,
        COMPANY_ID,
      );

      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
      expect(transactionsService.recordExpense).not.toHaveBeenCalled();
    });

    it('avansni boshqa toifaga aylantirishni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update(
          'adv-open',
          { category: ExpenseCategory.RENT } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('avansning xodimini almashtirishni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update(
          'adv-open',
          { relatedUserId: 10006 } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('avansdan xodim biriktirmasini uzishni rad etadi (relatedUserId: null)', async () => {
      // `expense-form-dialog.tsx` har saqlashda `relatedUserId: null` yuboradi.
      // U oyna avansga ochilmaydi, lekin ochilib qolsa jimgina emas, baland
      // ovoz bilan to'xtasin.
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update(
          'adv-open',
          { relatedUserId: null } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('oddiy xarajatni avansga aylantirishda xodim talab qiladi', async () => {
      prisma.expense.findFirst.mockResolvedValue({
        id: 'exp-plain',
        category: ExpenseCategory.RENT,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId: null,
        settledBySalaryPaymentId: null,
      });

      const error = await service
        .update(
          'exp-plain',
          { category: ExpenseCategory.TEACHER_ADVANCE } as any,
          42,
          COMPANY_ID,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Avans uchun xodimni tanlang',
      );
    });

    // Bu matn formada xato bo'lib chiqadi: enum nomi ham, maydon nomi ham
    // (`relatedUserId`) foydalanuvchiga hech narsa demaydi.
    it('xodimsiz avans yozilmaydi va sababi oddiy tilda aytiladi', async () => {
      const error = await service
        .create(
          {
            category: ExpenseCategory.TEACHER_ADVANCE,
            paymentMethod: ExpensePaymentMethod.CASH,
            amount: 500_000,
            description: 'Avans',
            date: '2026-10-01',
            branchId: 1,
          } as any,
          42,
          COMPANY_ID,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Avans uchun xodimni tanlang',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("avans bo'lmagan xarajatga qorovul tegmaydi", async () => {
      // `settledBySalaryPaymentId` faqat avansda ma'noga ega — boshqa toifa
      // uchun eski xatti-harakat o'zgarmasligi kerak.
      prisma.expense.findFirst.mockResolvedValue({
        id: 'exp-plain-2',
        category: ExpenseCategory.RENT,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId: null,
        settledBySalaryPaymentId: 'sp-1',
      });
      tx.transaction.findFirst.mockResolvedValue(null);
      tx.expense.update.mockResolvedValue({
        id: 'exp-plain-2',
        amount: 200,
        branchId: 1,
        companyId: COMPANY_ID,
        relatedUserId: null,
        description: 'Ijara',
        paymentMethod: ExpensePaymentMethod.CASH,
      });

      await expect(
        service.update('exp-plain-2', { amount: 200 } as any, 42, COMPANY_ID),
      ).resolves.toBeDefined();
    });
  });

  /**
   * CEO decision (10.10.2026): an advance to yourself is written, changed and
   * deleted by another manager; only the CEO handles their own. The advance is
   * also booked in a branch its recipient belongs to, because it is settled
   * against that person's payroll.
   */
  describe('own advances and the recipient branch', () => {
    const CEO_ROW = {
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    };
    // Keyed by user id. One mock answers both the existence lookup and the
    // branch-scope lookup (Prisma's `select` is not applied by a mock).
    const people: Record<number, object> = {
      1: { id: 1, ...CEO_ROW },
      42: {
        id: 42,
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
      10005: {
        id: 10005,
        mainBranch: 1,
        branches: [],
        roles: [{ role: { name: 'Teacher' } }],
      },
      10007: {
        id: 10007,
        mainBranch: 2,
        branches: [],
        roles: [{ role: { name: 'Teacher' } }],
      },
    };
    const advanceDto = (relatedUserId: number) =>
      ({
        category: ExpenseCategory.TEACHER_ADVANCE,
        paymentMethod: ExpensePaymentMethod.CASH,
        amount: 500_000,
        description: 'Avans',
        date: '2026-10-10',
        branchId: 1,
        relatedUserId,
      }) as any;
    const advanceRow = (relatedUserId: number) => ({
      id: 'adv-1',
      category: ExpenseCategory.TEACHER_ADVANCE,
      amount: 500_000,
      branchId: 1,
      companyId: COMPANY_ID,
      deletedAt: null,
      relatedUserId,
      settledBySalaryPaymentId: null,
    });

    beforeEach(() => {
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(people[where.id] ?? null),
      );
    });
    afterEach(() => {
      // `clearAllMocks` keeps implementations: put the file's default back.
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);
    });

    it('refuses a director writing an advance to themselves', async () => {
      await expect(
        service.create(advanceDto(42), 42, COMPANY_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets the CEO write an advance to themselves', async () => {
      prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

      await service.create(advanceDto(1), 1, COMPANY_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("refuses a recipient who is not in the expense's branch", async () => {
      await expect(
        service.create(advanceDto(10007), 42, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a director write an advance to a teacher of their branch', async () => {
      prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

      await service.create(advanceDto(10005), 42, COMPANY_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses a director changing their own advance', async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(42));

      await expect(
        service.update('adv-1', { amount: 600_000 } as any, 42, COMPANY_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a director deleting their own advance', async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(42));

      await expect(service.remove('adv-1', 42, COMPANY_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses moving an advance to a branch its recipient is not in, even for the CEO', async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(10005));

      await expect(
        service.update('adv-1', { branchId: 2 } as any, 1, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses turning a plain expense into an advance to yourself', async () => {
      prisma.expense.findFirst.mockResolvedValue({
        ...advanceRow(0),
        category: ExpenseCategory.RENT,
        relatedUserId: null,
      });

      await expect(
        service.update(
          'adv-1',
          {
            category: ExpenseCategory.TEACHER_ADVANCE,
            relatedUserId: 42,
          } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * ADR-0087 (CEO, 10.10 and 11.10.2026): an advance is cut from its
     * recipient's salary, so it requires `salary.pay` (`expenses.manage` alone
     * is refused); every other category requires `expenses.manage` (`salary.pay`
     * alone is refused). The routes let both holders in only to reach this check.
     */
    describe('who may write which category', () => {
      const REFUSAL = "Bu xarajatni kiritish huquqingiz yo'q";
      const holding = (...keys: string[]) =>
        permissions.has.mockImplementation((_userId: number, key: string) =>
          Promise.resolve(keys.includes(key)),
        );
      const advance = {
        category: ExpenseCategory.TEACHER_ADVANCE,
        paymentMethod: ExpensePaymentMethod.CASH,
        amount: 500_000,
        description: 'Avans',
        date: '2026-10-10',
        branchId: 1,
        relatedUserId: 10005,
      } as any;
      const rent = {
        ...advance,
        category: ExpenseCategory.RENT,
        description: 'Ijara',
        relatedUserId: undefined,
      };
      const row = (category: ExpenseCategory) => ({
        id: 'exp-1',
        category,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId:
          category === ExpenseCategory.TEACHER_ADVANCE ? 10005 : null,
        settledBySalaryPaymentId: null,
      });

      it('lets a holder of salary.pay alone write an advance', async () => {
        holding('salary.pay', 'salary.view');
        prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

        await service.create(advance, 42, COMPANY_ID);

        expect(permissions.has).toHaveBeenCalledWith(42, 'salary.pay');
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('refuses an advance to a holder of expenses.manage without salary.pay', async () => {
        holding('expenses.manage', 'expenses.view');

        await expect(service.create(advance, 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.branch.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('refuses rent to a holder of salary.pay alone', async () => {
        holding('salary.pay', 'salary.view');

        await expect(service.create(rent, 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('lets a holder of expenses.manage write rent', async () => {
        holding('expenses.manage', 'expenses.view');
        prisma.$transaction.mockResolvedValueOnce({ id: 'exp-new' });

        await service.create(rent, 42, COMPANY_ID);

        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('turns rent into an advance only for a caller holding both keys', async () => {
        prisma.expense.findFirst.mockResolvedValue(row(ExpenseCategory.RENT));
        const toAdvance = {
          category: ExpenseCategory.TEACHER_ADVANCE,
          relatedUserId: 10005,
        } as any;

        holding('salary.pay', 'salary.view');
        await expect(
          service.update('exp-1', toAdvance, 42, COMPANY_ID),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));

        holding('expenses.manage', 'expenses.view');
        await expect(
          service.update('exp-1', toAdvance, 42, COMPANY_ID),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));

        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('lets a holder of salary.pay alone change and delete an advance', async () => {
        holding('salary.pay', 'salary.view');
        prisma.expense.findFirst.mockResolvedValue(
          row(ExpenseCategory.TEACHER_ADVANCE),
        );
        prisma.transaction.findFirst.mockResolvedValue(null);
        prisma.$transaction
          .mockResolvedValueOnce({ id: 'exp-1' })
          .mockResolvedValueOnce(undefined);

        await service.update(
          'exp-1',
          { date: '2026-10-11' } as any,
          42,
          COMPANY_ID,
        );
        await service.remove('exp-1', 42, COMPANY_ID);

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('refuses changing and deleting an advance to a holder of expenses.manage without salary.pay', async () => {
        holding('expenses.manage', 'expenses.view');
        prisma.expense.findFirst.mockResolvedValue(
          row(ExpenseCategory.TEACHER_ADVANCE),
        );

        await expect(
          service.update(
            'exp-1',
            { date: '2026-10-11' } as any,
            42,
            COMPANY_ID,
          ),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));
        await expect(service.remove('exp-1', 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('lets a caller holding both keys turn rent into an advance', async () => {
        holding('expenses.manage', 'salary.pay');
        prisma.expense.findFirst.mockResolvedValue(row(ExpenseCategory.RENT));
        prisma.transaction.findFirst.mockResolvedValue(null);
        prisma.$transaction.mockResolvedValueOnce({ id: 'exp-1' });

        await service.update(
          'exp-1',
          {
            category: ExpenseCategory.TEACHER_ADVANCE,
            relatedUserId: 10005,
          } as any,
          42,
          COMPANY_ID,
        );

        expect(permissions.has).toHaveBeenCalledWith(42, 'expenses.manage');
        expect(permissions.has).toHaveBeenCalledWith(42, 'salary.pay');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('refuses turning an advance into rent to a holder of salary.pay alone', async () => {
        holding('salary.pay', 'salary.view');
        prisma.expense.findFirst.mockResolvedValue(
          row(ExpenseCategory.TEACHER_ADVANCE),
        );

        await expect(
          service.update(
            'exp-1',
            { category: ExpenseCategory.RENT } as any,
            42,
            COMPANY_ID,
          ),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('refuses deleting rent to a holder of salary.pay alone', async () => {
        holding('salary.pay', 'salary.view');
        prisma.expense.findFirst.mockResolvedValue(row(ExpenseCategory.RENT));

        await expect(service.remove('exp-1', 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });
});
