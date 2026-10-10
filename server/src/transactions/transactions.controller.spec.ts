import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('TransactionsController — route access', () => {
  // Appendix C: no screen reads the company-wide ledger or a teacher's ledger,
  // so the Administrator no longer reaches them.
  it('findAll is gated by the finance report capability', () => {
    expect(routeAccess(TransactionsController, 'findAll')).toEqual({
      kind: 'can',
      keys: ['reports.finance'],
    });
    expect(defaultRolesOf(TransactionsController, 'findAll')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('findByTeacher is gated by the salary view capability', () => {
    expect(routeAccess(TransactionsController, 'findByTeacher')).toEqual({
      kind: 'can',
      keys: ['salary.view'],
    });
    expect(defaultRolesOf(TransactionsController, 'findByTeacher')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  // Appendix C: only «Barcha yozuvlar» in the student's «To'lovlar» tab calls
  // the ledger, and a cashier does not see that tab.
  it.each(['findByStudent', 'getLessonTrail'])(
    '%s is gated by the student details capability, not open to the Cashier',
    (name) => {
      expect(routeAccess(TransactionsController, name)).toEqual({
        kind: 'can',
        keys: ['students.details'],
      });
      expect(defaultRolesOf(TransactionsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('createAdjustment is gated by the balance adjustment capability', () => {
    expect(routeAccess(TransactionsController, 'createAdjustment')).toEqual({
      kind: 'can',
      keys: ['balance.adjust'],
    });
    expect(defaultRolesOf(TransactionsController, 'createAdjustment')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  // Widened 2026-08-12 for the single debt page (/payments/debt), which
  // shows write-offs as a tab. The CEO's call: the page must not hide parts
  // of itself per role, because a screen whose shape changes by viewer is a
  // screen nobody can be told how to use. Reversing a write-off — the one
  // action that moves money back — stays behind the undo capability.
  it('findDebtWriteOffs is gated by the debt view capability and readable by every staff role of the debt page', () => {
    expect(routeAccess(TransactionsController, 'findDebtWriteOffs')).toEqual({
      kind: 'can',
      keys: ['debt.view'],
    });
    expect(defaultRolesOf(TransactionsController, 'findDebtWriteOffs')).toEqual(
      ['Administrator', 'Branch Director', 'CEO', 'Cashier'],
    );
  });
});

describe('TransactionsController — debt write-off audit scope', () => {
  let controller: TransactionsController;

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
