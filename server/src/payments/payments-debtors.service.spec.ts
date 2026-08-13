import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { DebtAgeService } from './../common/finance/debt-age.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentsDebtorsService', () => {
  let service: PaymentsDebtorsService;
  let prisma: {
    student: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
    paymentPromise: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 }, _count: 0 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ mainBranch: 7 }),
        findFirst: jest.fn().mockResolvedValue({ mainBranch: null, branches: [], roles: [{ role: { name: 'CEO' } }] }),
      },
      paymentPromise: { count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsDebtorsService,
        {
          provide: DebtAgeService,
          useValue: { getDebtAges: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PaymentsDebtorsService);
  });

  describe('getDebtors', () => {
    it('filters by negative balance + company, every status, no branch filter for CEO', async () => {
      await service.getDebtors(1001, { userId: 1, roles: ['CEO'] });
      const arg = prisma.student.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(
        expect.objectContaining({
          companyId: 1001,
          deletedAt: null,
            balance: { lt: 0 },
        }),
      );
      expect(arg.where.branches).toBeUndefined();
      expect(arg.orderBy).toEqual({ balance: 'asc' });
    });

    it('builds a unified search OR (name/phone) and adds id for numeric input', async () => {
      await service.getDebtors(1001, {
        userId: 1,
        roles: ['CEO'],
        search: '10264',
      });
      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { firstName: { contains: '10264', mode: 'insensitive' } },
          { phone: { contains: '10264' } },
          { id: { equals: 10264 } },
        ]),
      );
    });

    it('maps debtAmount as the absolute value of the negative balance', async () => {
      prisma.student.findMany.mockResolvedValueOnce([
        { id: 1, balance: -50000, enrollments: [] },
      ]);
      prisma.student.count.mockResolvedValueOnce(1);
      const res = await service.getDebtors(1001, { userId: 1, roles: ['CEO'] });
      expect(res.data[0].debtAmount).toBe(50000);
      // No promise / no call → both null (rows may omit the relation arrays).
      expect(res.data[0].promise).toBeNull();
      expect(res.data[0].lastCall).toBeNull();
    });

    it('surfaces the active promise + last outreach call on each debtor', async () => {
      const promiseDate = new Date('2026-06-20T23:59:59.000Z');
      const callDate = new Date('2026-06-13T09:00:00.000Z');
      prisma.student.findMany.mockResolvedValueOnce([
        {
          id: 1,
          balance: -50000,
          enrollments: [],
          paymentPromises: [
            { promiseDate, comment: '20-iyun to‘layman dedi', status: 'OPEN' },
          ],
          callLogs: [
            {
              note: 'Javob bermadi',
              outcome: 'NO_ANSWER',
              followUpAt: new Date('2026-06-18T18:59:59.000Z'),
              createdAt: callDate,
              calledBy: { firstName: 'Ali', lastName: 'Valiyev' },
            },
          ],
        },
      ]);
      prisma.student.count.mockResolvedValueOnce(1);
      const res = await service.getDebtors(1001, { userId: 1, roles: ['CEO'] });
      expect(res.data[0].promise).toEqual({
        promiseDate: promiseDate.toISOString(),
        comment: '20-iyun to‘layman dedi',
        status: 'OPEN',
      });
      expect(res.data[0].lastCall).toEqual({
        note: 'Javob bermadi',
        outcome: 'NO_ANSWER',
        followUpAt: '2026-06-18T18:59:59.000Z',
        createdAt: callDate.toISOString(),
        calledByName: 'Ali Valiyev',
      });
    });

    it('scopes a Branch Director to their own branches', async () => {
      // The shared resolver merges `mainBranch` and `UserBranch`, and reads the
      // caller's roles from their record rather than the request context.
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: 7,
        branches: [{ branchId: 7 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await service.getDebtors(1001, { userId: 9, roles: ['Branch Director'] });
      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.branches).toEqual({ some: { branchId: { in: [7] } } });
    });

    it('scopes an Administrator too — the role is no longer company-wide', async () => {
      // D4/D6: every employee below the CEO belongs to a branch and sees it.
      // Administrator used to be exempt alongside CEO, so one branch's admin
      // read the whole company's debtor names, phones and balances.
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: 2,
        branches: [{ branchId: 2 }],
        roles: [{ role: { name: 'Administrator' } }],
      });
      await service.getDebtors(1001, { userId: 9, roles: ['Administrator'] });
      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.branches).toEqual({ some: { branchId: { in: [2] } } });
    });

    it('returns empty for a Branch Director with no branch (never queries students)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      const res = await service.getDebtors(1001, {
        userId: 9,
        roles: ['Branch Director'],
      });
      expect(res).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDebtorSummary', () => {
    it('returns total/avg debt + promise counts over the same where', async () => {
      prisma.student.aggregate.mockResolvedValueOnce({
        _sum: { balance: -300000 },
        _count: 3,
      });
      prisma.paymentPromise.count
        .mockResolvedValueOnce(5) // open
        .mockResolvedValueOnce(2); // overdue
      const res = await service.getDebtorSummary(1001, {
        userId: 1,
        roles: ['CEO'],
      });
      expect(res).toEqual({
        totalDebt: 300000,
        debtorCount: 3,
        avgDebt: 100000,
        openPromises: 5,
        overduePromises: 2,
      });
    });
  });
});
