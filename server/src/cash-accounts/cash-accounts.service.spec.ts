import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashAccountsService } from './cash-accounts.service';
import { CashMovementsService } from './cash-movements.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CashAccountType } from '@prisma/client';

describe('CashAccountsService', () => {
  let service: CashAccountsService;
  let prisma: any;
  let cashMovements: any;
  let entityHistory: any;

  // $transaction runs the callback with a fake tx client immediately.
  const txClient = {
    cashAccount: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    prisma = {
      // The branch a new account is opened for must exist.
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      // The caller-scope guard on every id-addressed cash operation reads the
      // acting user; a CEO spans all branches.
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      cashAccount: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      cashMovement: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(txClient)),
    };
    cashMovements = {
      adjust: jest.fn().mockResolvedValue({}),
      transfer: jest.fn().mockResolvedValue({}),
    };
    entityHistory = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashAccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: cashMovements },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();
    service = module.get(CashAccountsService);
  });

  describe('create', () => {
    it('seeds an opening balance via an ADJUSTMENT movement', async () => {
      txClient.cashAccount.create.mockResolvedValue({ id: 'acc1' });
      txClient.cashAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        balance: 1000,
      });

      await service.create(
        { name: 'Kassa', type: CashAccountType.CASH, branchId: 1, openingBalance: 1000 },
        7,
        1,
      );

      expect(cashMovements.adjust).toHaveBeenCalledWith(
        expect.objectContaining({ cashAccountId: 'acc1', signedAmount: 1000 }),
        txClient,
      );
      expect(entityHistory.recordCreate).toHaveBeenCalled();
    });

    it('does not write a movement when openingBalance is 0/absent', async () => {
      txClient.cashAccount.create.mockResolvedValue({ id: 'acc2' });
      txClient.cashAccount.findUnique.mockResolvedValue({
        id: 'acc2',
        balance: 0,
      });
      await service.create(
        { name: 'Bank', type: CashAccountType.BANK, branchId: 1 },
        7,
        1,
      );
      expect(cashMovements.adjust).not.toHaveBeenCalled();
    });

    it('rejects an unknown branch', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { name: 'X', type: CashAccountType.CASH, branchId: 99 },
          7,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('refuses to archive an account that still holds money', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc1',
        balance: 5000,
      });
      await expect(service.remove('acc1', 7, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('archives an empty account', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc1', balance: 0 });
      const res = await service.remove('acc1', 7, 1);
      expect(res).toEqual({ message: "Kassa hisobi o'chirildi" });
      expect(entityHistory.recordDelete).toHaveBeenCalled();
    });

    it('throws when the account does not exist', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue(null);
      await expect(service.remove('nope', 7, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transfer', () => {
    it('rejects same-account transfers', async () => {
      await expect(
        service.transfer(
          { fromAccountId: 'a', toAccountId: 'a', amount: 100 },
          7,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the source has insufficient funds', async () => {
      prisma.cashAccount.findFirst
        .mockResolvedValueOnce({ id: 'a', balance: 100 })
        .mockResolvedValueOnce({ id: 'b', balance: 0 });
      await expect(
        service.transfer(
          { fromAccountId: 'a', toAccountId: 'b', amount: 500 },
          7,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(cashMovements.transfer).not.toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    it('writes an ADJUSTMENT for the delta', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc1',
        balance: 800,
      });
      await service.reconcile('acc1', { actualBalance: 1000, reason: 'sanab' }, 7, 1);
      expect(cashMovements.adjust).toHaveBeenCalledWith(
        expect.objectContaining({ signedAmount: 200 }),
        txClient,
      );
    });

    it('is a no-op when already reconciled', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc1',
        balance: 1000,
      });
      await service.reconcile(
        'acc1',
        { actualBalance: 1000, reason: 'x' },
        7,
        1,
      );
      expect(cashMovements.adjust).not.toHaveBeenCalled();
    });
  });

  describe('findAll branch scope', () => {
    it('returns nothing for a Branch Director with no branch', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: null });
      const res = await service.findAll({}, 1, 50, ['Branch Director']);
      expect(res).toEqual({ data: [], totalBalance: 0 });
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });

    it('sums balances for CEO (no branch filter)', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'a', balance: 1000 },
        { id: 'b', balance: 250 },
      ]);
      const res = await service.findAll({}, 1, 7, ['CEO']);
      expect(res.totalBalance).toBe(1250);
      expect(res.data).toHaveLength(2);
    });
  });
});

/**
 * `findAll` applied a branch scope but every id-addressed cash operation only
 * checked `companyId` — so a director of one branch could transfer money out of
 * the other branch's kassa, or post an adjustment to it.
 */
describe('CashAccountsService — branch confinement', () => {
  let service: CashAccountsService;
  let prisma: any;

  const account = (branchId: number) => ({
    id: `acc-${branchId}`,
    branchId,
    companyId: 1,
    balance: 1_000_000,
    deletedAt: null,
  });

  const makeService = async (caller: any) => {
    const txClient = {
      cashAccount: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
      cashMovement: { create: jest.fn() },
    };
    prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(caller),
      },
      cashAccount: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(account(2)),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      cashMovement: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(txClient)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashAccountsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CashMovementsService,
          useValue: { adjust: jest.fn(), transfer: jest.fn() },
        },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(CashAccountsService);
  };

  const director = {
    mainBranch: 1,
    branches: [{ branchId: 1 }],
    roles: [{ role: { name: 'Branch Director' } }],
  };

  it("refuses to read another branch's cash movements", async () => {
    await makeService(director);
    await expect(
      service.getMovements('acc-2', {} as any, 1, 99),
    ).rejects.toThrow(/boshqa filialga tegishli/);
  });

  it("refuses to reconcile another branch's kassa", async () => {
    await makeService(director);
    await expect(
      service.reconcile('acc-2', { actualBalance: 5, reason: 'x' } as any, 99, 1),
    ).rejects.toThrow(/boshqa filialga tegishli/);
  });

  it("refuses to transfer out of another branch's kassa", async () => {
    await makeService(director);
    await expect(
      service.transfer(
        { fromAccountId: 'acc-2', toAccountId: 'acc-9', amount: 100 } as any,
        99,
        1,
      ),
    ).rejects.toThrow(/boshqa filialga tegishli/);
  });

  it('lets a CEO reach any branch', async () => {
    await makeService({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });
    await expect(
      service.getMovements('acc-2', {} as any, 1, 99),
    ).resolves.toBeDefined();
  });
});

