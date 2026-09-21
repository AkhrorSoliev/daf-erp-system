import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('SettingsController — role guard', () => {
  let controller: SettingsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockSettingsService = {
    getMany: jest.fn().mockResolvedValue({
      'payment.defaultModel': 'LESSON_PACK',
      'payment.excusedCreditEnabled': true,
      'payment.excusedCreditMonthlyCap': null,
      'payment.chargeDayOfMonth': 1,
      'payment.debtWriteOffEnabled': false,
    }),
    set: jest.fn(),
  };
  const mockPrisma = {
    user: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get(SettingsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(roles: string[]) {
    return {
      getHandler: () => controller.getPayment,
      getClass: () => SettingsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  it('is annotated with exactly CEO and Branch Director', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, SettingsController);
    expect(roles).toEqual(['CEO', 'Branch Director']);
  });

  it('allows CEO', () => {
    expect(guard.canActivate(mockExecutionContext(['CEO']))).toBe(true);
  });

  it('allows Branch Director', () => {
    expect(guard.canActivate(mockExecutionContext(['Branch Director']))).toBe(
      true,
    );
  });

  it('denies Administrator', () => {
    expect(() =>
      guard.canActivate(mockExecutionContext(['Administrator'])),
    ).toThrow(ForbiddenException);
  });

  it('denies Cashier', () => {
    expect(() => guard.canActivate(mockExecutionContext(['Cashier']))).toThrow(
      ForbiddenException,
    );
  });

  it('denies Teacher', () => {
    expect(() => guard.canActivate(mockExecutionContext(['Teacher']))).toThrow(
      ForbiddenException,
    );
  });
});

describe('SettingsController — branch scope', () => {
  let controller: SettingsController;
  let settingsService: any;
  let prisma: any;

  const ceoUser = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const bdUser = {
    mainBranch: 5,
    branches: [{ branchId: 5 }],
    roles: [{ role: { name: 'Branch Director' } }],
  };

  beforeEach(() => {
    settingsService = {
      getMany: jest.fn().mockResolvedValue({
        'payment.defaultModel': 'LESSON_PACK',
        'payment.excusedCreditEnabled': true,
        'payment.excusedCreditMonthlyCap': null,
        'payment.chargeDayOfMonth': 1,
        'payment.debtWriteOffEnabled': false,
      }),
      set: jest.fn().mockResolvedValue(undefined),
      getBranchOverrides: jest.fn().mockResolvedValue({
        'payment.defaultModel': [],
        'payment.excusedCreditEnabled': [5],
        'payment.excusedCreditMonthlyCap': [],
        'payment.chargeDayOfMonth': [],
        'payment.debtWriteOffEnabled': [],
      }),
    };
    prisma = {
      user: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    controller = new SettingsController(
      settingsService as unknown as SettingsService,
      prisma as unknown as PrismaService,
    );
  });

  it('CEO reads company-wide settings when no branchId is given', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    const result = await controller.getPayment({}, 1, 1001);
    expect(result.branchId).toBeNull();
    expect(settingsService.getMany).toHaveBeenCalledWith(1001, undefined);
  });

  it('CEO company-wide read also includes which branches carry an override', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    const result = await controller.getPayment({}, 1, 1001);
    expect(settingsService.getBranchOverrides).toHaveBeenCalledWith(1001);
    expect(result.branchOverrides).toEqual({
      'payment.defaultModel': [],
      'payment.excusedCreditEnabled': [5],
      'payment.excusedCreditMonthlyCap': [],
      'payment.chargeDayOfMonth': [],
      'payment.debtWriteOffEnabled': [],
    });
  });

  it('CEO reading one specific branch does NOT fetch branch overrides (only the company-wide view needs them)', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    const result = await controller.getPayment({ branchId: 7 } as any, 1, 1001);
    expect(result.branchId).toBe(7);
    expect(settingsService.getBranchOverrides).not.toHaveBeenCalled();
    expect(result.branchOverrides).toBeUndefined();
  });

  it('Branch Director read never fetches branch overrides — they are always locked to one branch', async () => {
    prisma.user.findFirst.mockResolvedValue(bdUser);
    const result = await controller.getPayment({}, 2, 1001);
    expect(result.branchId).toBe(5);
    expect(settingsService.getBranchOverrides).not.toHaveBeenCalled();
    expect(result.branchOverrides).toBeUndefined();
  });

  it('CEO may write to an explicit branch after it is confirmed to exist', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    await controller.updatePayment(
      { chargeDayOfMonth: 10, branchId: 7 } as any,
      1,
      1001,
    );
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 7, deletedAt: null, companyId: 1001 },
      select: { id: true },
    });
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.chargeDayOfMonth',
      10,
      1,
      7,
    );
  });

  it('Branch Director is always locked to their own branch, ignoring a company-wide request', async () => {
    prisma.user.findFirst.mockResolvedValue(bdUser);
    await controller.updatePayment({ chargeDayOfMonth: 10 } as any, 2, 1001);
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.chargeDayOfMonth',
      10,
      2,
      5,
    );
  });

  it('debtWriteOffEnabled is written through its registry key, company-level (CEO)', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    await controller.updatePayment(
      { debtWriteOffEnabled: true } as any,
      1,
      1001,
    );
    expect(settingsService.set).toHaveBeenCalledTimes(1);
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.debtWriteOffEnabled',
      true,
      1,
      undefined,
    );
  });

  it('debtWriteOffEnabled: false is written too — OFF is the direction the CEO decided', async () => {
    // `if (dto.debtWriteOffEnabled)` (truthiness) bilan bu so'rov bo'sh
    // `edits` bergan va "Kamida bitta sozlama yuborilishi kerak" bilan
    // yiqilgan bo'lardi — ya'ni CEO tugmani qayta O'CHIRA olmasdi.
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    await controller.updatePayment(
      { debtWriteOffEnabled: false } as any,
      1,
      1001,
    );
    expect(settingsService.set).toHaveBeenCalledTimes(1);
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.debtWriteOffEnabled',
      false,
      1,
      undefined,
    );
  });

  it('excusedCreditEnabled: false is written too (same !== undefined guard)', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    await controller.updatePayment(
      { excusedCreditEnabled: false } as any,
      1,
      1001,
    );
    expect(settingsService.set).toHaveBeenCalledTimes(1);
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.excusedCreditEnabled',
      false,
      1,
      undefined,
    );
  });

  it('Branch Director cannot write to a branch outside their own scope', async () => {
    prisma.user.findFirst.mockResolvedValue(bdUser);
    await expect(
      controller.updatePayment(
        { chargeDayOfMonth: 10, branchId: 99 } as any,
        2,
        1001,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(settingsService.set).not.toHaveBeenCalled();
  });

  it('a Branch Director with no branch attached is refused, never treated as company-wide', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...bdUser,
      mainBranch: null,
      branches: [],
    });
    await expect(controller.getPayment({}, 2, 1001)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
