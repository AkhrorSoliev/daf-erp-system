import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { RefundableController } from './refundable.controller';
import { RefundableService } from './refundable.service';

describe('RefundableController — role guards', () => {
  let controller: RefundableController;
  const guard = new RolesGuard(new Reflector());

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RefundableController],
      providers: [{ provide: RefundableService, useValue: {} }],
    }).compile();
    controller = module.get(RefundableController);
  });

  const ctx = (handler: unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => RefundableController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;
  const handlers = () => [
    controller.list,
    controller.student,
    controller.excel,
  ];

  it('class-level @Roles: CEO, Branch Director, Administrator, Cashier', () => {
    expect(new Reflector().get(ROLES_KEY, RefundableController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
      'Cashier',
    ]);
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator'], ['Cashier']])(
    'every read allows %s',
    (role) => {
      for (const h of handlers())
        expect(guard.canActivate(ctx(h, [role]))).toBe(true);
    },
  );

  it('every read denies Teacher', () => {
    for (const h of handlers())
      expect(() => guard.canActivate(ctx(h, ['Teacher']))).toThrow(
        ForbiddenException,
      );
  });
});
