import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsFrozenBalanceService } from './payments-frozen-balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { confinedTo } from './payments.branch-isolation.spec';

const FROZEN_BALANCE_MIN_DAYS = 30;

describe('PaymentsFrozenBalanceService', () => {
  let service: PaymentsFrozenBalanceService;
  let prisma: {
    student: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    payment: {
      groupBy: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      payment: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: {
        // Backs `resolveCallerReportBranchIds` -> `resolveCallerBranchScope`.
        // CEO (10001) spans every branch; Branch Director (10002) is
        // confined to branch 2 via `mainBranch`.
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 10002) {
            return Promise.resolve({
              mainBranch: 2,
              branches: [],
              roles: [{ role: { name: 'Branch Director' } }],
            });
          }
          return Promise.resolve({
            mainBranch: null,
            branches: [],
            roles: [{ role: { name: 'CEO' } }],
          });
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsFrozenBalanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PaymentsFrozenBalanceService);
  });

  describe('getFrozenBalances', () => {
    it('uchala shartni ham qo`llaydi', async () => {
      await service.getFrozenBalances(1001, { userId: 10001, roles: ['CEO'] });

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('FROZEN');
      expect(where.balance).toEqual({ gt: 0 });
      expect(where.deletedAt).toBeNull();
      // 30 kundan eski
      expect(where.statusChangedAt.lt).toBeInstanceOf(Date);
    });

    // Bu test faqat cutoff arifmetikasini tekshiradi (aslida 29/31 kunlik
    // qator tuzilmaydi — mocklangan Prisma bilan buni to'g'ridan-to'g'ri
    // isbotlash qiyin). Nom brifdan olingan; nima tekshirilayotgani shu izoh.
    it('29 kun bo`lganni QAYTARMAYDI, 31 kun bo`lganni qaytaradi — cutoff aynan 30 kun oldin', async () => {
      const now = new Date('2026-09-03T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      await service.getFrozenBalances(1001, { userId: 10001, roles: ['CEO'] });

      const cutoff = prisma.student.findMany.mock.calls[0][0].where
        .statusChangedAt.lt as Date;
      const days = (now.getTime() - cutoff.getTime()) / 86_400_000;
      expect(days).toBe(FROZEN_BALANCE_MIN_DAYS);
      jest.useRealTimers();
    });

    it('daysFrozen ni hisoblaydi', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10453,
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          balance: 257_144,
          statusChangedAt: new Date('2026-07-20T00:00:00.000Z'),
        },
      ]);

      const res = await service.getFrozenBalances(1001, {
        userId: 10001,
        roles: ['CEO'],
      });

      expect(res.data[0].daysFrozen).toBe(45);
      expect(res.data[0].balance).toBe(257_144);
      jest.useRealTimers();
    });

    it('filial qamrovini qo`llaydi — AYNAN [2] ga cheklaydi, boshqasiga emas', async () => {
      await service.getFrozenBalances(1001, {
        branchId: 2,
        userId: 10002,
        roles: ['Branch Director'],
      });

      const where = prisma.student.findMany.mock.calls[0][0].where;
      // Aniq id tekshiruvi — `JSON.stringify(where).includes('branch')` kabi
      // yumshoq tekshiruv noto'g'ri filialga qattiq kodlangan bo'lsa ham
      // o'tib ketardi (masalan `studentBranchWhere([1])` — filial 1ga
      // sizib chiqish). `confinedTo` esa faqat [2] ga mos kelsa o'tadi.
      expect(confinedTo(where, [2])).toBe(true);
      expect(confinedTo(where, [1])).toBe(false);
    });

    it('lastPaymentAt ni BITTA guruhlangan so`rov bilan oladi (N+1 yo`q)', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10453,
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          balance: 257_144,
          statusChangedAt: new Date('2026-07-20T00:00:00.000Z'),
        },
        {
          id: 10454,
          firstName: 'Malika',
          lastName: 'Yusupova',
          phone: '901234568',
          balance: 100_000,
          statusChangedAt: new Date('2026-07-15T00:00:00.000Z'),
        },
      ]);
      prisma.payment.groupBy.mockResolvedValue([
        {
          studentId: 10453,
          _max: { createdAt: new Date('2026-06-01T00:00:00.000Z') },
        },
      ]);

      const res = await service.getFrozenBalances(1001, {
        userId: 10001,
        roles: ['CEO'],
      });

      expect(prisma.payment.groupBy).toHaveBeenCalledTimes(1);
      expect(
        res.data.find((r) => r.studentId === 10453)?.lastPaymentAt,
      ).toEqual(new Date('2026-06-01T00:00:00.000Z'));
      expect(
        res.data.find((r) => r.studentId === 10454)?.lastPaymentAt,
      ).toBeNull();
    });

    it('filial qamrovi bo`sh bo`lsa hech narsa qaytarmaydi (fail-closed)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: 3,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      const res = await service.getFrozenBalances(1001, {
        branchId: 99,
        userId: 10002,
        roles: ['Branch Director'],
      });

      expect(res).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });
});
