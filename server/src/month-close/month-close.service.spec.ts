import { ForbiddenException } from '@nestjs/common';
import { tashkentMonthKey } from '../common/date/tashkent';
import { MonthCloseService } from './month-close.service';

const ACC = {
  id: 'a1',
  name: 'Bank hisobi',
  type: 'BANK',
  branchId: 7,
};

describe('MonthCloseService', () => {
  // Joriy oy hisobda: 2026-10 tugagan, 2026-11 hali tugamagan.
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-11-15T10:00:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
  });
  afterAll(() => jest.useRealTimers());

  let prisma: {
    cashAccount: { findMany: jest.Mock };
    expense: { findFirst: jest.Mock; findMany: jest.Mock };
    salaryPayment: { groupBy: jest.Mock };
    branch: { findMany: jest.Mock };
  };
  let expenses: { create: jest.Mock; update: jest.Mock };
  let reports: { getMonthlyNetProfit: jest.Mock };
  let redis: { scanStream: jest.Mock; del: jest.Mock };
  let service: MonthCloseService;

  beforeEach(() => {
    prisma = {
      cashAccount: { findMany: jest.fn() },
      expense: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryPayment: { groupBy: jest.fn().mockResolvedValue([]) },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, name: 'Toshkent' }]),
      },
    };
    expenses = { create: jest.fn(), update: jest.fn() };
    reports = {
      getMonthlyNetProfit: jest
        .fn()
        .mockResolvedValue({ taxes: { missingRates: [] } }),
    };
    redis = {
      scanStream: jest.fn(() =>
        (async function* () {
          yield ['rpt:np:v7:1:all:u10:2026-10'];
        })(),
      ),
      del: jest.fn(),
    };
    service = new MonthCloseService(
      prisma as never,
      expenses as never,
      reports as never,
      redis as never,
    );
  });

  describe('saveBankFees', () => {
    it('refuses a month that has not ended', async () => {
      await expect(
        service.saveBankFees(
          1,
          tashkentMonthKey(new Date()),
          [{ cashAccountId: 'a1', amount: 5 }],
          10,
          null,
        ),
      ).rejects.toThrow('Joriy oy hali tugamagan');
    });

    it('refuses a month before the start month', async () => {
      await expect(
        service.saveBankFees(
          1,
          '2026-09',
          [{ cashAccountId: 'a1', amount: 5 }],
          10,
          null,
        ),
      ).rejects.toThrow('Bank xarajati 2026-10 oyidan boshlab kiritiladi');
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });

    it('refuses the same account twice in one request', async () => {
      await expect(
        service.saveBankFees(
          1,
          '2026-10',
          [
            { cashAccountId: 'a1', amount: 5 },
            { cashAccountId: 'a1', amount: 6 },
          ],
          10,
          null,
        ),
      ).rejects.toThrow('Bir hisob ikki marta berilgan');
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it('still invalidates the cache when a later item throws', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        ACC,
        { ...ACC, id: 'a2', name: 'Ikkinchi' },
      ]);
      prisma.expense.findFirst.mockResolvedValue(null);
      expenses.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.saveBankFees(
          1,
          '2026-10',
          [
            { cashAccountId: 'a1', amount: 5 },
            { cashAccountId: 'a2', amount: 6 },
          ],
          10,
          null,
        ),
      ).rejects.toThrow('boom');
      expect(redis.del).toHaveBeenCalled();
    });

    it('refuses a bad month string', async () => {
      await expect(
        service.saveBankFees(
          1,
          '2026-13',
          [{ cashAccountId: 'a1', amount: 5 }],
          10,
          null,
        ),
      ).rejects.toThrow("Oy noto'g'ri");
    });

    it('refuses an account that is not a live BANK account of the company', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([]);
      await expect(
        service.saveBankFees(
          1,
          '2026-10',
          [{ cashAccountId: 'x', amount: 5 }],
          10,
          null,
        ),
      ).rejects.toThrow('Bank hisobi topilmadi');
    });

    it('refuses an account outside the caller scope', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([ACC]);
      await expect(
        service.saveBankFees(
          1,
          '2026-10',
          [{ cashAccountId: 'a1', amount: 5 }],
          10,
          [3],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a fee on the last day of the month with the account', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([ACC]);
      prisma.expense.findFirst.mockResolvedValue(null);
      await service.saveBankFees(
        1,
        '2026-10',
        [{ cashAccountId: 'a1', amount: 125_000 }],
        10,
        null,
      );
      expect(expenses.create).toHaveBeenCalledWith(
        {
          category: 'BANK_FEES',
          paymentMethod: 'CARD',
          amount: 125_000,
          description: 'Bank xizmati — Bank hisobi, 2026-10',
          date: '2026-10-31',
          branchId: 7,
        },
        10,
        1,
        { cashAccountId: 'a1' },
      );
      expect(redis.del).toHaveBeenCalled();
    });

    it('0 is an entry too (created with amount 0)', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([ACC]);
      prisma.expense.findFirst.mockResolvedValue(null);
      await service.saveBankFees(
        1,
        '2026-10',
        [{ cashAccountId: 'a1', amount: 0 }],
        10,
        null,
      );
      expect(expenses.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 0 }),
        10,
        1,
        { cashAccountId: 'a1' },
      );
    });

    it('a different amount updates the existing row; the same amount does nothing', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([ACC]);
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1', amount: 100 });
      await service.saveBankFees(
        1,
        '2026-10',
        [{ cashAccountId: 'a1', amount: 250 }],
        10,
        null,
      );
      expect(expenses.update).toHaveBeenCalledWith(
        'e1',
        { amount: 250 },
        10,
        1,
      );
      expenses.update.mockClear();
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1', amount: 250 });
      await service.saveBankFees(
        1,
        '2026-10',
        [{ cashAccountId: 'a1', amount: 250 }],
        10,
        null,
      );
      expect(expenses.update).not.toHaveBeenCalled();
      expect(expenses.create).not.toHaveBeenCalled();
    });
  });

  describe('read', () => {
    it('accounts with their amount or null, salaries, checklist', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        ACC,
        { ...ACC, id: 'a2', name: 'Ikkinchi' },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        { cashAccountId: 'a1', amount: 0 },
      ]);
      prisma.salaryPayment.groupBy.mockResolvedValue([
        { status: 'PAID', _count: { _all: 3 } },
        { status: 'APPROVED', _count: { _all: 1 } },
      ]);
      reports.getMonthlyNetProfit.mockResolvedValue({
        taxes: { missingRates: ['bank.feesEntered'] },
      });
      const v = await service.read(1, '2026-10', null, 10);
      expect(v.bankAccounts.map((a) => a.amount)).toEqual([0, null]);
      expect(v.salaries).toEqual({ paid: 3, total: 4 });
      expect(v.checklist).toEqual({
        bankFeesEntered: false,
        salariesPaid: false,
        ratesComplete: true,
      });
      expect(v.ended).toBe(true);
      expect(v.bankAccounts[0].branchName).toBe('Toshkent');
    });

    it('a month before the start month has no bank accounts and reads as entered', async () => {
      const v = await service.read(1, '2026-09', null, 10);
      expect(v.bankAccounts).toEqual([]);
      expect(v.checklist.bankFeesEntered).toBe(true);
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
      expect(reports.getMonthlyNetProfit).toHaveBeenCalled();
    });

    it('a real missing rate keeps ratesComplete false', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([]);
      reports.getMonthlyNetProfit.mockResolvedValue({
        taxes: { missingRates: ['fees.qr'] },
      });
      const v = await service.read(1, '2026-10', null, 10);
      expect(v.checklist.ratesComplete).toBe(false);
    });
  });
});
