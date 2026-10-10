import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { BalanceNoticesController } from './balance-notices.controller';
import { BalanceNoticesService } from './balance-notices.service';

describe('BalanceNoticesController — role guards', () => {
  let controller: BalanceNoticesController;
  const guard = new RolesGuard(new Reflector());

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BalanceNoticesController],
      providers: [{ provide: BalanceNoticesService, useValue: {} }],
    }).compile();
    controller = module.get(BalanceNoticesController);
  });

  const ctx = (roles: string[]) =>
    ({
      getHandler: () => controller.create,
      getClass: () => BalanceNoticesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;

  it('class-level @Roles is CEO, Branch Director, Administrator', () => {
    expect(new Reflector().get(ROLES_KEY, BalanceNoticesController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator']])(
    'create allows %s',
    (role) => {
      expect(guard.canActivate(ctx([role]))).toBe(true);
    },
  );

  it.each([['Cashier'], ['Teacher']])('create denies %s', (role) => {
    expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
  });
});
