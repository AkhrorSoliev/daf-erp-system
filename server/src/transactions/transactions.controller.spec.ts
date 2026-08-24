import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('TransactionsController — debt write-off audit guards', () => {
  let controller: TransactionsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockTransactionsService = {
    findDebtWriteOffs: jest.fn().mockResolvedValue({ data: [] }),
    createAdjustment: jest.fn(),
  } as any;
  // `resolveCallerReportBranchIds` reads the caller row — roles, `mainBranch`
  // and the `UserBranch` join — not `userBranch` directly. The local resolver
  // this replaced queried `userBranch` alone, which is how `mainBranch` was
  // being missed.
  const mockPrisma = {
    user: { findFirst: jest.fn() },
  } as any;
  const caller = (
    roles: string[],
    branches: number[] = [],
    mainBranch: number | null = null,
  ) => ({
    mainBranch,
    branches: branches.map((branchId) => ({ branchId })),
    roles: roles.map((name) => ({ role: { name } })),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: mockTransactionsService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get(TransactionsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => TransactionsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('findDebtWriteOffs() guard', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    // Widened 2026-08-12 for the single debt page (/payments/debt), which
    // shows write-offs as a tab. The CEO's call: the page must not hide parts
    // of itself per role, because a screen whose shape changes by viewer is a
    // screen nobody can be told how to use. Reversing a write-off — the one
    // action that moves money back — stays CEO-only.
    it('allows Administrator (debt page tab)', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Cashier (debt page tab)', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Cashier',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('endpoint metadata sanity', () => {
    it('findDebtWriteOffs is readable by every staff role on the debt page', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.findDebtWriteOffs,
      );
      expect(roles).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
        'Cashier',
      ]);
    });
  });

  // The scope resolution used to be a private helper reading `UserBranch`
  // raw. Two things followed: `mainBranch` was invisible, and a caller with no
  // branch resolved to `[]`, which met a `branchIds.length > 0` check in the
  // read service and produced NO branch predicate — every branch, for someone
  // entitled to none.
  describe('branch scope', () => {
    const user = { id: 2, companyId: 1001, roles: ['Branch Director'] };
    const query = {} as never;

    it('gives a CEO the whole company', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(caller(['CEO'], [99]));

      await controller.findDebtWriteOffs(query, {
        id: 1,
        companyId: 1001,
        roles: ['CEO'],
      });

      expect(mockTransactionsService.findDebtWriteOffs).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ branchIds: null }),
      );
    });

    it('counts mainBranch, not just the UserBranch rows', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        caller(['Branch Director'], [], 3),
      );

      await controller.findDebtWriteOffs(query, user);

      expect(mockTransactionsService.findDebtWriteOffs).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ branchIds: [3] }),
      );
    });

    it('merges mainBranch with the join rows without duplicating', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        caller(['Branch Director'], [3, 7], 3),
      );

      await controller.findDebtWriteOffs(query, user);

      const arg =
        mockTransactionsService.findDebtWriteOffs.mock.calls.at(-1)[1];
      expect([...arg.branchIds].sort()).toEqual([3, 7]);
    });

    it('refuses a caller entitled to no branch instead of showing every one', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(caller(['Administrator']));

      await expect(controller.findDebtWriteOffs(query, user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a branch the caller does not hold', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        caller(['Branch Director'], [1]),
      );

      await expect(
        controller.findDebtWriteOffs({ branchId: 2 } as never, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('narrows to a branch the caller does hold', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        caller(['Branch Director'], [1, 2]),
      );

      await controller.findDebtWriteOffs({ branchId: 2 } as never, user);

      expect(mockTransactionsService.findDebtWriteOffs).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ branchIds: [2] }),
      );
    });
  });
});
