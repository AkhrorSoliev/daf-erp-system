import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CashAccountsController } from './cash-accounts.controller';
import { CashAccountsService } from './cash-accounts.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('CashAccountsController — RBAC', () => {
  let controller: CashAccountsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashAccountsController],
      providers: [{ provide: CashAccountsService, useValue: {} }],
    }).compile();

    controller = module.get(CashAccountsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function ctxFor(roles: string[]) {
    return {
      getHandler: () => controller.findAll,
      getClass: () => CashAccountsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('is restricted to CEO + Branch Director at the class level', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, CashAccountsController);
    expect(roles).toEqual(['CEO', 'Branch Director']);
  });

  it.each([['CEO'], ['Branch Director']])('allows %s', (role) => {
    expect(guard.canActivate(ctxFor([role]))).toBe(true);
  });

  it.each([['Administrator'], ['Cashier'], ['Teacher']])(
    'denies %s',
    (role) => {
      expect(() => guard.canActivate(ctxFor([role]))).toThrow(
        ForbiddenException,
      );
    },
  );
});
