jest.mock('../receipts/pdf/render', () => ({
  renderPdf: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))),
  getCompanyLogoDataUrl: () => null,
}));

import { Test } from '@nestjs/testing';
import { renderPdf } from '../receipts/pdf/render';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PermissionsService } from '../common/permissions/permissions.service';
import { tashkentDateStr, tashkentMonthKey } from '../common/date/tashkent';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpensesService } from './expenses.service';

describe('ExpensesService — the PDF reads the month (spec B6 §5.3)', () => {
  let service: ExpensesService;
  const prisma = {
    expense: { findMany: jest.fn() },
    company: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const ROW = {
    id: 'e1',
    category: 'RENT',
    paymentMethod: 'CASH',
    amount: 5_000_000,
    description: 'Ijara',
    date: new Date('2026-09-05T00:00:00.000Z'),
    branchId: 1,
    receiptUrl: null,
    createdAt: new Date('2026-09-05T09:30:00.000Z'),
    createdBy: { id: 10001, firstName: 'Ism', lastName: 'Familiya' },
  };
  const doc = () => JSON.stringify((renderPdf as jest.Mock).mock.calls[0][0]);

  // Only Date is faked, so the current-month cases cannot flake at midnight.
  const NOW = new Date('2026-10-17T10:00:00.000Z');
  beforeEach(async () => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    jest.clearAllMocks();
    prisma.expense.findMany.mockResolvedValue([ROW]);
    prisma.company.findUnique.mockResolvedValue({ name: 'Markaz' });
    prisma.branch.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: {} },
        { provide: EntityHistoryService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ExpensesService);
  });

  afterEach(() => jest.useRealTimers());

  it('names the month on the «Davr» line and in the file name', async () => {
    const res = await service.generateExpensesPdf(
      { oy: '2026-09' } as ExpenseQueryDto,
      1,
      null,
    );
    expect(res.filename).toBe('xarajatlar-2026-09.pdf');
    expect(res.buffer.toString().startsWith('%PDF')).toBe(true);
    expect(doc()).toContain('Sentabr 2026');
  });

  it('no oy and no range: the current month', async () => {
    const res = await service.generateExpensesPdf(
      {} as ExpenseQueryDto,
      1,
      null,
    );
    expect(res.filename).toBe(`xarajatlar-${tashkentMonthKey(NOW)}.pdf`);
  });

  it('lists who entered them when «Kim kiritgan» is filtered', async () => {
    prisma.user.findMany.mockResolvedValue([
      { firstName: 'Ism', lastName: 'Aliyev' },
    ]);
    await service.generateExpensesPdf(
      { oy: '2026-09', createdById: [10234] } as ExpenseQueryDto,
      1,
      null,
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [10234] }, companyId: 1 },
      }),
    );
    expect(doc()).toContain('Kim kiritgan:');
    expect(doc()).toContain('Ism Aliyev');
  });

  it('joins several creators with a comma', async () => {
    prisma.user.findMany.mockResolvedValue([
      { firstName: 'Ism', lastName: 'Aliyev' },
      { firstName: 'Ism', lastName: 'Valiyev' },
    ]);
    await service.generateExpensesPdf(
      { oy: '2026-09', createdById: [10234, 10567] } as ExpenseQueryDto,
      1,
      null,
    );
    expect(doc()).toContain('Ism Aliyev, Ism Valiyev');
  });

  it('prints no «Kim kiritgan» line when no such user is found', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.generateExpensesPdf(
      { oy: '2026-09', createdById: [10999] } as ExpenseQueryDto,
      1,
      null,
    );
    expect(doc()).not.toContain('Kim kiritgan:');
  });

  it('no «Kim kiritgan» line without the filter', async () => {
    await service.generateExpensesPdf(
      { oy: '2026-09' } as ExpenseQueryDto,
      1,
      null,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(doc()).not.toContain('Kim kiritgan:');
  });

  it('prints «Naqd», never «Naqt»', async () => {
    await service.generateExpensesPdf(
      { oy: '2026-09' } as ExpenseQueryDto,
      1,
      null,
    );
    expect(doc()).toContain('Naqd');
    expect(doc()).not.toContain('Naqt');
  });

  it("keeps the old range label and today's file name for a client on the old page", async () => {
    const res = await service.generateExpensesPdf(
      { startDate: '2026-10-01', endDate: '2026-10-31' } as ExpenseQueryDto,
      1,
      null,
    );
    expect(res.filename).toBe(`xarajatlar-${tashkentDateStr(NOW)}.pdf`);
    expect(doc()).toContain('01.10.2026 — 31.10.2026');
  });
});
