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
  const mockPrisma = {
    userBranch: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;

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
    it('denies Administrator (financial audit is BD+CEO only)', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.findDebtWriteOffs, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('endpoint metadata sanity', () => {
    it('findDebtWriteOffs is annotated with CEO + Branch Director only', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.findDebtWriteOffs,
      );
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });
  });

  describe('branch scope resolver (private)', () => {
    it('CEO gets null (no branch filter)', async () => {
      mockPrisma.userBranch.findMany.mockResolvedValue([
        { branchId: 99 }, // ignored for CEO
      ]);
      const result = await (controller as any).resolveBranchScopeForUser({
        id: 1,
        roles: ['CEO'],
      });
      expect(result).toBeNull();
      expect(mockPrisma.userBranch.findMany).not.toHaveBeenCalled();
    });

    it('Branch Director gets their UserBranch rows', async () => {
      mockPrisma.userBranch.findMany.mockReset();
      mockPrisma.userBranch.findMany.mockResolvedValue([
        { branchId: 3 },
        { branchId: 7 },
      ]);
      const result = await (controller as any).resolveBranchScopeForUser({
        id: 2,
        roles: ['Branch Director'],
      });
      expect(result).toEqual([3, 7]);
    });
  });
});
